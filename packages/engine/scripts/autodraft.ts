/**
 * Deterministic auto-drafter (maintainer tooling; no AI).
 *
 * Parses an instruction's normalized official text into a skeleton template:
 * every bracket becomes a yes/no question, every alternative a pick-one (or
 * pick-one-or-more when it has [or]/[and] connectors), every blank a free-text
 * field, recognizable pronoun pairs bind to the defendant. The skeleton is
 * structurally faithful but semantically naive (no shared questions, people
 * roles, agreement or computed punctuation), so a human or reviewed AI pass
 * must still finish it. Its main use in Phase 0 is measuring how much of the
 * corpus the format can represent mechanically.
 *
 *   node scripts/autodraft.ts [--out DIR] [--report FILE] [ids...]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { Document, visit } from "yaml";
import { renderSource } from "../src/source.ts";
import { theyForm } from "../src/pronouns.ts";
import type {
  Block,
  Element,
  ElementGroup,
  ElementItem,
  Inline,
  InlineNode,
  NoteBlock,
  Question,
  Template,
} from "../src/types.ts";
import { validateTemplate } from "../src/validate.ts";
import { isElement, isGroup } from "../src/walk.ts";
import { inputArb } from "../test/arbitrary.ts";
import { bodySha256, EXTRACTED_DIR, RELEASE, type ExtractedRecord } from "../test/corpus.ts";
import { renderProblems } from "../test/problems.ts";
import { enrich, type Todo } from "./enrich.ts";

class DraftError extends Error {
  category: string;
  constructor(category: string, message: string) {
    super(message);
    this.category = category;
  }
}

// ---------------------------------------------------------------------------
// Inline parsing

type Tok =
  | { t: "text"; v: string }
  | { t: "[" }
  | { t: "]" }
  | { t: "(" }
  | { t: ")" }
  | { t: "/" }
  | { t: "blank"; hint?: string }
  | { t: "note"; v: string }
  | { t: "em"; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let buf = "";
  const flush = (): void => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  while (i < s.length) {
    const c = s[i]!;
    if (s.startsWith("______", i)) {
      flush();
      i += 6;
      if (s.startsWith(" <", i)) {
        const end = matchAngle(s, i + 1);
        out.push({ t: "blank", hint: s.slice(i + 2, end) });
        i = end + 1;
      } else out.push({ t: "blank" });
      continue;
    }
    if (c === "<") {
      flush();
      const end = matchAngle(s, i);
      out.push({ t: "note", v: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === "*") {
      const end = s.indexOf("*", i + 1);
      if (end < 0) throw new DraftError("emphasis", "unbalanced emphasis");
      flush();
      out.push({ t: "em", v: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === "[" || c === "]" || c === "(" || c === ")" || c === "/") {
      flush();
      out.push({ t: c });
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

function matchAngle(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "<") depth++;
    else if (s[i] === ">" && --depth === 0) return i;
  }
  throw new DraftError("note", "unbalanced angle brackets");
}

const PRONOUN_PAIRS = new Set(["he/she", "him/her", "his/her", "his/hers", "himself/herself"]);
const SEP_RE = /^\[(or|and|nor|and\/or|,|;)\]$/;

class Drafter {
  questions: Question[] = [];
  private n = 0;
  private fields = 0;

  /** Save state so a failed speculative parse leaves no stray questions. */
  snapshot(): () => void {
    const q = this.questions.slice();
    const n = this.n;
    const f = this.fields;
    return () => {
      this.questions = q;
      this.n = n;
      this.fields = f;
    };
  }

  q(type: "boolean"): string;
  q(type: "choice" | "multi", labels: string[]): string;
  q(type: Question["type"], labels: string[] = []): string {
    const id = `q${++this.n}`;
    if (type === "boolean") this.questions.push({ id, type });
    else
      this.questions.push({
        id,
        type,
        options: labels.map((l, i) => ({ id: `o${i + 1}`, label: l || `option ${i + 1}` })),
      });
    return id;
  }

  field(hint?: string): Inline {
    const f = `text.f${++this.fields}`;
    return hint === undefined ? { field: f } : { field: f, hint };
  }

  /** Parse a paragraph's inline content. */
  inline(s: string): Inline[] {
    const toks = tokenize(s);
    let i = 0;
    const seq = (stop: Set<string>): Inline[] => {
      const out: Inline[] = [];
      while (i < toks.length) {
        const tk = toks[i]!;
        if (stop.has(tk.t)) return out;
        i++;
        switch (tk.t) {
          case "text":
            out.push(tk.v);
            break;
          case "blank":
            out.push(this.field(tk.hint));
            break;
          case "note":
            out.push({ note: tk.v });
            break;
          case "em":
            out.push({ em: tk.v });
            break;
          case "[": {
            const alts: Inline[][] = [seq(new Set(["]", "/"]))];
            while (toks[i]?.t === "/") {
              i++;
              alts.push(seq(new Set(["]", "/"])));
            }
            if (toks[i]?.t !== "]") throw new DraftError("brackets", "unclosed [");
            i++;
            const flat = alts.map((a) =>
              a.every((x) => typeof x === "string") ? a.join("") : null,
            );
            if (alts.length === 1) out.push({ opt: alts[0]!, if: this.q("boolean") });
            else if (flat.join("/") === "and/or")
              out.push({ opt: ["and/or"], if: this.q("boolean") });
            else if (flat.some((f) => f === null || /[()]/.test(f)))
              throw new DraftError("brackets", "bare alternatives with markup inside");
            else {
              // [grand/petty]: an optional pick-one printed without parentheses
              const c = this.alternatives(alts);
              const node = "pronoun" in c || "choice" in c ? { ...c, bare: true as const } : c;
              if ("any" in node)
                throw new DraftError("brackets", "connectors in bare alternatives");
              out.push({ opt: [node], if: this.q("boolean") });
            }
            break;
          }
          case "(": {
            const alts: Inline[][] = [seq(new Set([")", "/"]))];
            while (toks[i]?.t === "/") {
              i++;
              alts.push(seq(new Set([")", "/"])));
            }
            if (toks[i]?.t !== ")") throw new DraftError("parens", "unclosed (");
            i++;
            if (alts.length === 1) out.push("(", ...alts[0]!, ")");
            else out.push(this.alternatives(alts));
            break;
          }
          case "]":
          case ")":
          case "/":
            // stray closer outside a group: keep as text
            out.push(tk.t);
            break;
        }
      }
      return out;
    };
    const res = seq(new Set());
    return res;
  }

  /** Turn parsed alternatives into a choice, any or pronoun node. */
  alternatives(alts: Inline[][]): InlineNode {
    const plain = alts.map((a) => (a.every((x) => typeof x === "string") ? a.join("") : null));
    if (plain.every((p) => p !== null)) {
      const key = plain.map((p) => p!.toLowerCase()).join("/");
      if (PRONOUN_PAIRS.has(key) || /^(he\/she\/they|him\/her\/them|his\/her\/their)$/.test(key)) {
        if (theyForm(plain as string[])) return { pronoun: "defendant", forms: plain as string[] };
      }
    }
    // Connectors: an option that starts with [or]/[and]/... or ends with [,]
    let usesSep = false;
    const opts = alts.map((a) => {
      const out: Inline[] = [];
      a.forEach((x, k) => {
        if (
          typeof x === "object" &&
          "opt" in x &&
          x.opt.length === 1 &&
          typeof x.opt[0] === "string"
        ) {
          const sep = `[${x.opt[0]}]`;
          if (SEP_RE.test(sep) && (k === 0 || k === a.length - 1)) {
            this.dropQuestion(x.if);
            usesSep = true;
            out.push({ sep: x.opt[0] });
            return;
          }
        }
        out.push(x);
      });
      return out;
    });
    const labels = opts.map((o) =>
      o
        .filter((x) => typeof x === "string")
        .join("")
        .trim(),
    );
    if (usesSep) return { any: this.q("multi", labels), options: opts };
    return { choice: this.q("choice", labels), options: opts };
  }

  private dropQuestion(id: string): void {
    this.questions = this.questions.filter((q) => q.id !== id);
  }
}

// ---------------------------------------------------------------------------
// Block parsing

const EL_RE = /^(\d+[A-Z]?(?:i{1,3}v?)?|\(\d+\/\d+\)|[a-h])\. (.*)$/s;
const END_RE = /(\(;\/\.\)|[;.:])$/;
const CONJ = new Set(["AND", "[AND]", "OR", "[OR]"]);
const ALT_NOTE = /^<Alternative [^<>]*>$/;

function bracketSpan(paras: string[], start: number): number {
  // index of the paragraph that closes a bracket opened at the start of paras[start]
  let depth = 0;
  for (let p = start; p < paras.length; p++) {
    for (const ch of paras[p]!.replace(/<[^>]*>/g, "")) {
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }
    if (depth <= 0) return p;
  }
  throw new DraftError("brackets", "bracket never closes");
}

export function draftRecord(rec: ExtractedRecord): Template {
  return draft({ ...rec, body: rec.body.slice() });
}

function draft(rec: ExtractedRecord): Template {
  const d = new Drafter();
  const paras = rec.body;

  function parseElement(text: string, cond?: string, and?: string): Element {
    const m = EL_RE.exec(text);
    if (!m) throw new DraftError("elements", `not an element: ${text.slice(0, 40)}`);
    let body = m[2]!;
    const em = END_RE.exec(body);
    const end = em ? em[1]! : "";
    if (em) body = body.slice(0, -end.length);
    const e: Element = { n: m[1]!, text: d.inline(body), end };
    if (and !== undefined) e.and = and;
    if (cond !== undefined) e.if = cond;
    return e;
  }

  /**
   * A run of alternatives, each an optional "<Alternative …>" note followed by
   * one bracketed span of elements, separated by a conjunction line or printed
   * back to back. Returns null (leaving no stray questions) when the shape
   * doesn't match, so the caller can fall back.
   */
  function parseGroup(
    start: number,
    hi = paras.length,
  ): { group: ElementGroup; next: number } | null {
    const restore = d.snapshot();
    const r = tryGroup(start, hi);
    if (!r) restore();
    return r;
  }

  function tryGroup(start: number, hi: number): { group: ElementGroup; next: number } | null {
    const options: ElementGroup["options"] = [];
    let or: string | undefined;
    let p = start;
    for (;;) {
      let note: string | undefined;
      if (ALT_NOTE.test(paras[p] ?? "")) {
        note = paras[p]!.slice(1, -1);
        p++;
      }
      const first = paras[p];
      if (p >= hi || !first || !/^\[(\d+[A-Z]?(?:i{1,3}v?)?|[a-h])\. /.test(first)) return null;
      let close: number;
      try {
        close = bracketSpan(paras, p);
      } catch {
        return null;
      }
      if (close >= hi || !paras[close]!.endsWith("]")) return null;
      const lines = paras.slice(p, close + 1);
      lines[0] = lines[0]!.slice(1);
      lines[lines.length - 1] = lines[lines.length - 1]!.slice(0, -1);
      if (!lines.every((l) => EL_RE.test(l))) return null;
      try {
        options.push({
          ...(note !== undefined ? { note } : {}),
          elements: lines.map((l) => parseElement(l)),
        });
      } catch {
        return null;
      }
      p = close + 1;
      if (p >= hi) break;
      const conj = paras[p];
      if (conj && CONJ.has(conj) && p + 1 < hi && ALT_NOTE.test(paras[p + 1] ?? "")) {
        if (or !== undefined && or !== conj) return null;
        if (or === undefined && options.length > 1) return null; // mixed separators
        or = conj;
        p++;
        continue;
      }
      // alternatives printed back to back, with no conjunction between them
      if (or === undefined && ALT_NOTE.test(conj ?? "")) continue;
      break;
    }
    if (options.length < 2) return null;
    const labels = options.map((o, i) =>
      (o.note ?? `alternative ${i + 1}`).replace(/^Alternative\s*/, ""),
    );
    const alt = d.q(or ? "multi" : "choice", labels);
    const group: ElementGroup = { alt, options };
    if (or !== undefined) group.or = or as NonNullable<ElementGroup["or"]>;
    return { group, next: p };
  }

  function blocks(lo: number, hi: number): Block[] {
    const out: Block[] = [];
    let p = lo;
    let list: ElementItem[] | null = null;
    const closeList = (): void => {
      if (list && list.length) {
        // A numbered list of complete sentences (every item ends with ".", no
        // conjunctions) is a list of directions, not elements of a crime.
        const els = list.filter(isElement);
        const plain =
          els.length >= 2 &&
          list.every((it) => !isGroup(it)) &&
          els.every((e) => e.end === "." && e.and === undefined);
        out.push(plain ? { elements: list, plain: true } : { elements: list });
      }
      list = null;
    };
    while (p < hi) {
      const s = paras[p]!;
      const isEl = EL_RE.test(s) || /^\[(\d+[A-Z]?|\(\d+\/\d+\))\. /.test(s);
      // labeled alternatives: <Alternative 1A—…> [1A. …] [OR] <Alternative 1B—…> [1B. …]
      if (ALT_NOTE.test(s)) {
        const g = parseGroup(p);
        if (g) {
          list ??= [];
          list.push(g.group);
          p = g.next;
          continue;
        }
      }
      // element list items
      if (isEl || CONJ.has(s) || s === "[AND" || s === "[OR") {
        list ??= [];
        if ((s === "[AND" || s === "[OR") && ALT_NOTE.test(paras[p + 1] ?? "")) {
          // [AND <Alternative …> [3. …] <Alternative …> [3. …]]: an optional group
          let close = -1;
          try {
            close = bracketSpan(paras, p);
          } catch {
            /* reported below */
          }
          if (close > p && paras[close]!.endsWith("]]")) {
            const saved = paras[close]!;
            paras[close] = saved.slice(0, -1);
            const g = parseGroup(p + 1, close + 1);
            paras[close] = saved;
            if (g && g.next === close + 1) {
              g.group.and = s.slice(1);
              g.group.if = d.q("boolean");
              list.push(g.group);
              p = close + 1;
              continue;
            }
          }
          throw new DraftError("elements", "optional group shape not recognized");
        }
        if (s === "[AND" || s === "[OR") {
          const next = paras[p + 1];
          if (!next || !next.endsWith("]")) throw new DraftError("elements", "unclosed [AND");
          list.push(parseElement(next.slice(0, -1), d.q("boolean"), s.slice(1)));
          p += 2;
          continue;
        }
        if (CONJ.has(s) && ALT_NOTE.test(paras[p + 1] ?? "")) {
          const g = parseGroup(p + 1);
          if (!g) throw new DraftError("elements", "group after conjunction not recognized");
          g.group.and = s;
          list.push(g.group);
          p = g.next;
          continue;
        }
        if (CONJ.has(s)) {
          const next = paras[p + 1];
          if (!next || !(EL_RE.test(next) || next.startsWith("["))) {
            throw new DraftError("elements", `conjunction not followed by an element`);
          }
          if (next.startsWith("[") && next.endsWith("]") && bracketSpan(paras, p + 1) === p + 1) {
            const e = parseElement(next.slice(1, -1), d.q("boolean"), s);
            e.andOutside = true;
            list.push(e);
          } else if (EL_RE.test(next)) list.push(parseElement(next, undefined, s));
          else throw new DraftError("elements", "conjunction not followed by an element");
          p += 2;
          continue;
        }
        if (s.startsWith("[") && s.endsWith("]") && bracketSpan(paras, p) === p) {
          list.push(parseElement(s.slice(1, -1), d.q("boolean")));
        } else list.push(parseElement(s));
        p++;
        continue;
      }
      // a note between elements stays in the list if an element follows
      if (
        list &&
        /^<[^<>]*>$/.test(s) &&
        p + 1 < hi &&
        (EL_RE.test(paras[p + 1]!) || /^\[|^AND|^OR/.test(paras[p + 1]!))
      ) {
        list.push({ note: s.slice(1, -1) } as NoteBlock);
        p++;
        continue;
      }
      closeList();
      if (/^<[^<>]*>$/.test(s)) {
        out.push({ note: s.slice(1, -1) });
        p++;
        continue;
      }
      if (s.startsWith("[• ") && s.endsWith("]") && bracketSpan(paras, p) === p) {
        out.push({ opt: [{ bullet: d.inline(s.slice(3, -1)) }], if: d.q("boolean") });
        p++;
        continue;
      }
      if (s.startsWith("• ")) {
        out.push({ bullet: d.inline(s.slice(2)) });
        p++;
        continue;
      }
      if (s.startsWith("[")) {
        const close = bracketSpan(paras, p);
        if (close > p) {
          const last = paras[close]!;
          if (!last.endsWith("]"))
            throw new DraftError("brackets", "multi-paragraph bracket closes mid-paragraph");
          const inner = [paras[p]!.slice(1), ...paras.slice(p + 1, close), last.slice(0, -1)];
          const saved = paras.slice(p, close + 1);
          paras.splice(p, close - p + 1, ...inner);
          out.push({ opt: blocks(p, p + inner.length), if: d.q("boolean") });
          paras.splice(p, inner.length, ...saved);
          p = close + 1;
          continue;
        }
      }
      out.push(d.inline(s));
      p++;
    }
    closeList();
    return out;
  }

  const body = blocks(0, paras.length);
  return {
    schema: 1,
    id: rec.number,
    title: rec.title,
    source: {
      file: rec.source.file,
      release: RELEASE,
      revision_line: rec.revision_line ?? "",
      body_sha256: bodySha256(rec.body),
    },
    review: "machine-checked",
    questions: d.questions,
    body,
  };
}

// ---------------------------------------------------------------------------
// Run

export interface DraftResult {
  id: string;
  status: "pass" | "roundtrip" | "invalid" | "render" | "parse" | "enrich";
  category?: string;
  detail?: string;
  questions?: number;
  static?: boolean;
  todo?: Todo[];
}

type Stage = { status: DraftResult["status"]; category: string; detail: string } | undefined;

/** Schema, round trip and render checks; undefined when all pass. */
function verify(t: Template, rec: ExtractedRecord, runs: number): Stage {
  const issues = validateTemplate(JSON.parse(JSON.stringify(t)));
  if (issues.length)
    return {
      status: "invalid",
      category: "schema",
      detail: `${issues[0]!.path} ${issues[0]!.message}`,
    };
  const src = renderSource(t);
  if (src.join("\n") !== rec.body.join("\n")) {
    const k = src.findIndex((x, i) => x !== rec.body[i]);
    return {
      status: "roundtrip",
      category: "roundtrip",
      detail: `paragraph ${k}: ${src[k]?.slice(0, 80)}`,
    };
  }
  let problem: string | undefined;
  try {
    fc.assert(
      fc.property(inputArb(t), (input) => {
        const ps = renderProblems(t, input);
        if (ps.length) {
          problem = ps[0];
          return false;
        }
        return true;
      }),
      { numRuns: runs, seed: 1 },
    );
  } catch {
    const cat = (problem ?? "render").replace(/:.*$/s, "");
    return { status: "render", category: cat, detail: problem ?? "" };
  }
  return undefined;
}

function check(rec: ExtractedRecord, runs = 100): { t?: Template; r: DraftResult } {
  let raw: Template;
  try {
    raw = draft({ ...rec, body: rec.body.slice() });
  } catch (e) {
    const cat = e instanceof DraftError ? e.category : "crash";
    return {
      r: { id: rec.number, status: "parse", category: cat, detail: String((e as Error).message) },
    };
  }
  let t: Template;
  let todo: Todo[];
  try {
    ({ t, todo } = enrich(raw));
  } catch (e) {
    return {
      r: {
        id: rec.number,
        status: "enrich",
        category: "crash",
        detail: String((e as Error).message),
      },
    };
  }
  const bad = verify(t, rec, runs);
  if (bad) {
    // Report whether the problem comes from the skeleton or from enrichment.
    const rawBad = verify(raw, rec, runs);
    if (!rawBad)
      return {
        t,
        r: { id: rec.number, status: "enrich", category: bad.category, detail: bad.detail },
      };
    return { t, r: { id: rec.number, ...rawBad } };
  }
  return {
    t,
    r: {
      id: rec.number,
      status: "pass",
      questions: t.questions?.length ?? 0,
      static: (t.questions?.length ?? 0) === 0 && !rec.body.some((p) => p.includes("______")),
      todo,
    },
  };
}

/** Compact YAML in the style of the hand-written templates. */
export function templateYaml(t: Template): string {
  const doc = new Document(t);
  visit(doc, {
    Map(_k, node) {
      if (JSON.stringify(node.toJSON()).length <= 90) node.flow = true;
    },
    Seq(_k, node) {
      if (JSON.stringify(node.toJSON()).length <= 90) node.flow = true;
    },
  });
  const header =
    `# CALCRIM No. ${t.id}. Instruction text: Judicial Council of California, freely\n` +
    `# reproducible under Cal. Rules of Court, rule 2.1050(c). Template structure: CC0.\n`;
  return header + doc.toString({ lineWidth: 0, flowCollectionPadding: true });
}

function main(): void {
  const args = process.argv.slice(2);
  let outDir: string | undefined;
  let reportPath: string | undefined;
  let force = false;
  const skipped: string[] = [];
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") outDir = args[++i];
    else if (args[i] === "--report") reportPath = args[++i];
    else if (args[i] === "--force") force = true;
    else ids.push(args[i]!);
  }
  const all = readdirSync(EXTRACTED_DIR)
    .filter((f) => /^\d{3,4}[A-Z]?\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""));
  const results: DraftResult[] = [];
  for (const id of ids.length ? ids : all) {
    const rec = JSON.parse(
      readFileSync(join(EXTRACTED_DIR, `${id}.json`), "utf8"),
    ) as ExtractedRecord;
    const { t, r } = check(rec);
    results.push(r);
    if (outDir && t && r.status === "pass") {
      const dest = join(outDir, `${id}.yaml`);
      // Never overwrite an authored template.
      if (existsSync(dest) && !force) skipped.push(id);
      else {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(dest, templateYaml(t));
      }
    }
  }
  const by = (k: keyof DraftResult) =>
    results.reduce<Record<string, number>>((m, r) => {
      const v = String(r[k] ?? "-");
      m[v] = (m[v] ?? 0) + 1;
      return m;
    }, {});
  const summary = {
    release: RELEASE,
    total: results.length,
    status: by("status"),
    failure_categories: by("category"),
    static_instructions: results.filter((r) => r.static).length,
    questions_per_passing_template: (() => {
      const qs = results
        .filter((r) => r.status === "pass")
        .map((r) => r.questions ?? 0)
        .sort((a, b) => a - b);
      return { median: qs[Math.floor(qs.length / 2)] ?? 0, max: qs[qs.length - 1] ?? 0 };
    })(),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (skipped.length) console.log(`kept existing templates: ${skipped.join(" ")}`);
  if (reportPath) writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2) + "\n");
}

if (import.meta.filename === process.argv[1]) main();
