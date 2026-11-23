/**
 * Semantic enrichment of an auto-drafted skeleton (maintainer tooling; no AI).
 *
 * The skeleton (scripts/autodraft.ts) is structurally faithful but naive:
 * every bracket is its own yes/no question, every blank its own free-text
 * field, every pronoun bound to the defendant. This pass applies conservative
 * heuristics that never change source text, so the round trip still holds:
 *
 * - blanks: people roles from name hints ("insert name of decedent" →
 *   decedent.name), the count field for "Count ______", shared fields for
 *   identical hints
 * - plural markers: defendant[s] → @multiple_defendants; other noun[s] share
 *   one question per noun
 * - pronouns: bound to the nearest person mentioned earlier in the paragraph
 * - agreement: present-tense verbs after a subject pronoun get `agree` nodes;
 *   printed (is/are)-style choices become `agree` alternatives
 * - questions: identical alternatives and identical optional phrases share one
 *   question; readable ids and prompts; notes govern the question that follows
 * - (a/an) choices suggest from the following field
 *
 * Every guess that needs a human look is reported in `todo`. The drafter
 * (a maintainer, possibly AI-assisted) reviews the to-do list as part of the
 * semantic pass; nothing here is final.
 */
import { renderInlineSource } from "../src/source.ts";
import type {
  Block,
  ChoiceNode,
  Element,
  ElementItem,
  Inline,
  InlineNode,
  PersonRole,
  Question,
  Template,
} from "../src/types.ts";
import { isElement, isGroup, isNoteItem, toInlines } from "../src/walk.ts";
import { ADVERB, pluralVerb } from "../test/problems.ts";

/** Singular/plural word pairs that follow a plural marker ("crime[s] … (that/those)"). */
const SG_PL: Record<string, string[]> = {
  that: ["those"],
  this: ["these"],
  it: ["they", "them"],
  its: ["their"],
  is: ["are"],
  was: ["were"],
  has: ["have"],
  does: ["do"],
};

export interface Todo {
  kind:
    | "role"
    | "generic-name"
    | "pronoun-target"
    | "agreement"
    | "plural"
    | "merged"
    | "questions"
    | "unbound-note";
  detail: string;
}

// ---------------------------------------------------------------------------
// Text helpers

/** Split " actually knows that…" into " actually ", "knows", " that…" when the verb changes for they. */
function splitVerb(
  s: string,
): { before: string; verb: string; pl: string; after: string } | undefined {
  if (!/^\s/.test(s)) return undefined;
  let before = /^\s*/.exec(s)![0];
  let rest = s.slice(before.length);
  for (;;) {
    const m = /^(\S+)(\s+)/.exec(rest);
    if (!m || !ADVERB.test(m[1]!)) break;
    before += m[0];
    rest = rest.slice(m[0].length);
  }
  const vm = /^[A-Za-z’']+/.exec(rest);
  if (!vm) return undefined;
  const pl = pluralVerb(vm[0]);
  if (!pl) return undefined;
  return { before, verb: vm[0], pl, after: rest.slice(vm[0].length) };
}

function slug(s: string, words = 4): string {
  const all = s
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const kept = all
    .filter((x) => !["the", "a", "an", "of", "to", "and", "or"].includes(x))
    .slice(0, words);
  const id = (kept.length ? kept : all.slice(0, words)).join("_") || "choice";
  return /^[a-z]/.test(id) ? id : `q_${id}`;
}

function plainText(xs: Inline[] | string): string {
  return toInlines(xs)
    .map((x) => (typeof x === "string" ? x : renderInlineSource(x)))
    .join("");
}

/** Readable prompt text: blanks shown as "___", notes and emphasis markers removed. */
function clip(s: string, n = 70): string {
  const t = s
    .replace(/______ <[^<>]*>/g, "___")
    .replace(/______/g, "___")
    .replace(/<[^<>]*>/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

// ---------------------------------------------------------------------------
// Roles from blank hints

interface Binding {
  path: string;
  role?: { id: string; label: string; use: "name" | "title" | "agency" };
  generic?: boolean;
}

function bindHint(hint: string | undefined, before: string): Binding | undefined {
  if (hint === undefined) {
    if (/\bCount $/.test(before)) return { path: "count" };
    return undefined;
  }
  const h = hint.replace(/\s+/g, " ").trim();
  if (/\[s\]|\[es\]|children|felonies|\bor more\b/.test(h)) return undefined;
  const agency = /^insert name of agency that employs (police|peace|custodial) officer/i.exec(h);
  if (agency)
    return { path: "officer.agency", role: { id: "officer", label: "Officer", use: "agency" } };
  const title = /^insert (?:the )?(\w[\w ]*?)[’']s title/i.exec(h);
  if (title) return roleBinding(title[1]!, "title");
  const own = /^insert (?:the )?(\w[\w ]*?)[’']s name/i.exec(h);
  if (own) return roleBinding(own[1]!, "name");
  const of = /^insert name (?:or description |\/description )?of (?:the )?(.+?)(?:,.*)?$/i.exec(h);
  if (of) return roleBinding(of[1]!, "name");
  if (/^insert name$/i.test(h)) return { path: "", generic: true };
  return undefined;
}

const PERSON = new Set(
  (
    "officer decedent person witness victim adult respondent felon minor recipient expert party " +
    "child petitioner accomplice perpetrator guardian father mother principal employer employee " +
    "man woman driver owner spouse parent juror inmate prisoner patient informant agent " +
    "firefighter attorney physician buyer seller participant provocateur defendant"
  ).split(" "),
);
const NOT_PERSON =
  /\b(?:code|offense|substance|drug|felony|court|facility|theory|city|county|state|institution|college|country|language|crime|agency|business|vehicle|weapon|place|document)\b/;

function roleBinding(noun: string, use: "name" | "title" | "agency"): Binding | undefined {
  let n = noun.toLowerCase().trim();
  if (n.split(" ").length > 5 || /\bif\b|\bwho\b|\bthat\b|\bwhen\b/.test(n)) return undefined;
  // Only people get roles; "name of language other than English" is free text.
  if (NOT_PERSON.test(n) || !n.split(/[\s/]+/).some((w) => PERSON.has(w))) return undefined;
  n = n.replace(/^(?:alleged|purported) /, "");
  if (n === "defendant") return use === "name" ? { path: "defendant.name" } : undefined;
  if (/^(?:police|peace|custodial) officer$/.test(n)) n = "officer";
  const id = slug(n, 3);
  const label = n[0]!.toUpperCase() + n.slice(1);
  return { path: `${id}.${use}`, role: { id, label, use } };
}

// ---------------------------------------------------------------------------
// Enrichment

export function enrich(input: Template): { t: Template; todo: Todo[] } {
  const t = JSON.parse(JSON.stringify(input)) as Template;
  const todo: Todo[] = [];
  const questions = new Map((t.questions ?? []).map((q) => [q.id, q]));
  const people: Record<string, PersonRole> = { ...(t.people ?? {}) };
  const rename = new Map<string, string>(); // old question id -> new id (merges, renames)
  const dropped = new Set<string>();

  // --- fields -------------------------------------------------------------
  const hintField = new Map<string, string>();
  let genericNames = 0;
  const fieldPass = (xs: Inline[]): void => {
    xs.forEach((x, i) => {
      if (typeof x === "string") return;
      if ("field" in x && x.field.startsWith("text.f")) {
        const prev = xs[i - 1];
        const before = typeof prev === "string" ? prev : "";
        const b = bindHint(x.hint, before);
        if (b?.generic) genericNames++;
        if (b && !b.generic) {
          x.field = b.path;
          if (b.role) {
            const r = (people[b.role.id] ??= { label: b.role.label, uses: [] });
            if (!r.uses!.includes(b.role.use)) r.uses!.push(b.role.use);
          }
        } else if (x.hint !== undefined) {
          const key = x.hint.replace(/\s+/g, " ").trim().toLowerCase();
          let f = hintField.get(key);
          if (!f) {
            f = `text.${uniqueField(slug(x.hint.replace(/^insert /i, ""), 4), hintField)}`;
            hintField.set(key, f);
          }
          x.field = f;
        }
      }
      forChildren(x, fieldPass);
    });
  };
  walkAllInlines(t.body, fieldPass);
  for (const [id, r] of Object.entries(people)) {
    if (!input.people?.[id])
      todo.push({
        kind: "role",
        detail: `person role "${id}" (${r.uses!.join(", ")}) guessed from blank hints`,
      });
  }
  if (genericNames)
    todo.push({
      kind: "generic-name",
      detail: `${genericNames} “insert name” blank(s) left as free text; bind to a person if one is meant`,
    });
  if (Object.keys(people).length) t.people = people;
  else delete t.people;

  // --- plural markers -----------------------------------------------------
  const pluralQ = new Map<string, string>();
  const pluralPass = (xs: Inline[]): void => {
    xs.forEach((x, i) => {
      if (typeof x !== "string" && "opt" in x && /^(s|es|’s|s’)$/.test(plainText(x.opt))) {
        const prev = xs[i - 1];
        const noun = typeof prev === "string" ? /(\w+)$/.exec(prev)?.[1] : undefined;
        if (noun) {
          const old = x.if;
          if (/^defendant$/i.test(noun)) {
            x.if = "@multiple_defendants";
            dropped.add(old);
          } else {
            const key = noun.toLowerCase().replace(/(ie)?$/, "");
            let q = pluralQ.get(key);
            if (!q) {
              q = `${slug(noun, 1)}_plural`;
              pluralQ.set(key, q);
              questions.set(q, {
                id: q,
                type: "boolean",
                prompt: `More than one ${noun.toLowerCase()}?`,
              });
            }
            x.if = q;
            dropped.add(old);
          }
        }
      }
      if (typeof x !== "string") forChildren(x, pluralPass);
    });
  };
  walkAllInlines(t.body, pluralPass);
  if (pluralQ.size)
    todo.push({
      kind: "plural",
      detail: `plural markers share questions: ${[...pluralQ.values()].join(", ")} (check each refers to the same thing)`,
    });

  // --- pronoun targets and agreement --------------------------------------
  const roleWords = Object.entries(people).map(([id, r]) => ({
    id,
    re: new RegExp(`\\b${r.label.toLowerCase().split(" ").pop()!}\\b`, "i"),
  }));
  let agreeAdded = 0;
  let pluralTied = 0;
  let untiedAlt = 0;
  let guessedTargets = 0;
  const paragraphPass = (xs: Inline[]): void => {
    // Pronoun targets are decided per sentence: the defendant if the sentence
    // mentions the defendant, else the last other person it mentions, else
    // whoever the previous sentence was about.
    let mentions: string[] = [];
    let carry = "defendant";
    let pluralConds: string[] = [];
    const subject = (): string =>
      mentions.includes("defendant") ? "defendant" : (mentions[mentions.length - 1] ?? carry);
    const scan = (text: string): void => {
      const parts = text.split(/(?<=[.?!])\s+(?=[A-Z“(])/);
      parts.forEach((part, k) => {
        if (k > 0) {
          carry = subject();
          mentions = [];
          pluralConds = [];
        }
        const found: { at: number; who: string }[] = [];
        for (const m of part.matchAll(/\bdefendant/gi))
          found.push({ at: m.index, who: "defendant" });
        for (const r of roleWords)
          for (const m of part.matchAll(new RegExp(r.re.source, "gi")))
            found.push({ at: m.index, who: r.id });
        found.sort((p1, p2) => p1.at - p2.at).forEach((f) => mentions.push(f.who));
      });
    };
    const visit = (arr: Inline[]): void => {
      for (let i = 0; i < arr.length; i++) {
        const x = arr[i]!;
        if (typeof x === "string") {
          scan(x);
          continue;
        }
        if ("field" in x) {
          const role = x.field.split(".")[0]!;
          if (role in people || role === "defendant") mentions.push(role);
          continue;
        }
        if ("pronoun" in x) {
          const who = subject();
          if (who !== "defendant") x.pronoun = who;
          if (roleWords.length) guessedTargets++;
          if (/^he$/i.test(x.forms[0]!)) {
            const next = arr[i + 1];
            const split = typeof next === "string" ? splitVerb(next) : undefined;
            if (split) {
              arr.splice(
                i + 1,
                1,
                split.before,
                { agree: x.pronoun, sg: split.verb, pl: split.pl },
                split.after,
              );
              agreeAdded++;
            }
          }
          continue;
        }
        if ("options" in x && !("any" in x) && x.choice !== undefined && x.options.length === 2) {
          const a = plainText(x.options[0]!);
          const b = plainText(x.options[1]!);
          const pairSg = pluralVerb(a) === b;
          const pairNoun = SG_PL[a.toLowerCase()]?.includes(b.toLowerCase()) ?? false;
          if (pairSg || pairNoun) {
            // Right after a pronoun: agrees with that person's pronouns.
            let k = i - 1;
            while (k >= 0 && typeof arr[k] === "string" && (arr[k] as string).trim() === "") k--;
            const prev = arr[k];
            if (pairSg && typeof prev === "object" && "pronoun" in prev) {
              dropped.add(x.choice);
              arr[i] = { agree: prev.pronoun, sg: a, pl: b, alt: true };
              agreeAdded++;
              continue;
            }
            // A demonstrative modifies the noun after it: "(that/those) day[s]".
            // A pronoun or verb refers back: "attorney[s] who (is/are)" — tied
            // only when the sentence so far has exactly one plural noun.
            const demonstrative = /^(that|this)$/i.test(a);
            const back = new Set(pluralConds);
            const c = demonstrative
              ? forwardPlural(arr, i)
              : back.size === 1
                ? [...back][0]
                : undefined;
            if (c !== undefined) {
              dropped.add(x.choice);
              arr[i] = { when: [`!${c}`, c], options: [a, b] };
              pluralTied++;
              continue;
            }
            untiedAlt++;
          }
        }
        if ("opt" in x && /^(s|es|’s|s’)$/.test(plainText(x.opt))) pluralConds.push(x.if);
        forChildren(x, visit);
      }
    };
    visit(xs);
  };
  walkParagraphs(t.body, paragraphPass);
  if (agreeAdded)
    todo.push({
      kind: "agreement",
      detail: `${agreeAdded} they/them agreement annotation(s) added; check each verb and any unmarked verbs`,
    });
  if (pluralTied)
    todo.push({
      kind: "agreement",
      detail: `${pluralTied} printed singular/plural verb choice(s) tied to the plural marker before them; check each`,
    });
  if (untiedAlt)
    todo.push({
      kind: "agreement",
      detail: `${untiedAlt} printed singular/plural verb choice(s) left as questions; tie to a pronoun or plural marker if possible`,
    });
  if (guessedTargets)
    todo.push({
      kind: "pronoun-target",
      detail: `${guessedTargets} pronoun(s) in an instruction with other people: check who each refers to`,
    });

  // --- article suggestions ------------------------------------------------
  walkAllInlines(t.body, function art(xs: Inline[]): void {
    xs.forEach((x, i) => {
      if (typeof x === "string") return;
      if ("choice" in x && x.choice !== undefined) {
        const labels = x.options.map((o) => plainText(o).toLowerCase()).join("/");
        const f = xs[i + 2];
        if (labels === "a/an" && xs[i + 1] === " " && typeof f === "object" && "field" in f) {
          const q = questions.get(x.choice);
          if (q?.type === "choice") q.articleFor = f.field;
        }
      }
      forChildren(x, art);
    });
  });

  // --- merge identical alternatives and optional phrases ------------------
  const seenChoice = new Map<string, string>();
  const seenOpt = new Map<string, string>();
  let merges = 0;
  walkAllInlines(t.body, function merge(xs: Inline[]): void {
    for (const x of xs) {
      if (typeof x === "string") continue;
      if ("choice" in x && x.choice !== undefined && !rename.has(x.choice)) {
        const key = x.options.map(plainText).join("/");
        // Punctuation choices ("(./,)") depend on their neighbors: never merged.
        const punct = x.options.some((o) => !/\p{L}/u.test(plainText(o)));
        if (key.toLowerCase() !== "a/an" && !punct) {
          const prev = seenChoice.get(key);
          if (prev && prev !== x.choice) {
            rename.set(x.choice, prev);
            merges++;
          } else seenChoice.set(key, x.choice);
        }
      }
      if ("any" in x && !rename.has(x.any)) {
        const key = "any:" + x.options.map(plainText).join("/");
        const prev = seenChoice.get(key);
        if (prev && prev !== x.any) {
          rename.set(x.any, prev);
          merges++;
        } else seenChoice.set(key, x.any);
      }
      if ("opt" in x && !x.if.startsWith("@") && /^q\d+$/.test(x.if)) {
        const key = plainText(x.opt);
        if (key.length >= 3) {
          const prev = seenOpt.get(key);
          if (prev && prev !== x.if) {
            rename.set(x.if, prev);
            merges++;
          } else seenOpt.set(key, x.if);
        }
      }
      forChildren(x, merge);
    }
  });
  // Parallel lists: the same alternatives repeated with different wording
  // ("a firearm" / "with a firearm") share one question; a later list that
  // repeats a subset of an earlier one is linked to it.
  const lists: { node: ChoiceNode; q: string; cores: string[] }[] = [];
  let linked = 0;
  walkAllInlines(t.body, function parallel(xs: Inline[]): void {
    for (const x of xs) {
      if (typeof x === "string") continue;
      if ("choice" in x && x.choice !== undefined && !x.link) {
        const q = resolve(x.choice);
        const cores = optionLabels(x.options).map(core);
        if (cores.every((c) => c.length >= 3) && cores.join("/") !== "a/an") {
          for (const a of lists) {
            if (a.q === q) break;
            const m = correspond(a.cores, cores);
            if (!m) continue;
            if (m.length === a.cores.length && m.every((j, i) => j === i)) {
              rename.set(q, a.q);
              merges++;
            } else {
              const aq = questions.get(a.q);
              if (aq?.type === "choice") {
                x.link = { q: a.q, map: m.map((j) => aq.options[j]!.id) };
                linked++;
              }
            }
            break;
          }
          if (!rename.has(q) && !x.link) lists.push({ node: x, q, cores });
        }
      }
      forChildren(x, parallel);
    }
  });
  if (linked)
    todo.push({
      kind: "merged",
      detail: `${linked} list(s) linked to an earlier list they repeat a subset of; check the correspondence`,
    });
  if (merges)
    todo.push({
      kind: "merged",
      detail: `${merges} repeated alternative(s)/optional phrase(s) now share a question; split any that should be asked separately`,
    });

  // --- readable ids and prompts -------------------------------------------
  const used = new Set<string>([...questions.keys()].filter((id) => !/^q\d+$/.test(id)));
  const describe = new Map<string, { id: string; prompt: string; labels?: string[] }>();
  const name = (q: string, base: string, prompt: string, labels?: string[]): void => {
    if (describe.has(q) || !/^q\d+$/.test(q)) return;
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}_${k}`;
    used.add(id);
    describe.set(q, { id, prompt, ...(labels ? { labels } : {}) });
  };
  const nameInlines = (xs: Inline[]): void => {
    for (const x of xs) {
      if (typeof x === "string") continue;
      if ("opt" in x) {
        const txt = plainText(x.opt);
        name(resolve(x.if), slug(txt), `Include “${clip(txt)}”?`);
      } else if ("any" in x) {
        name(
          resolve(x.any),
          slug(plainText(x.options[0]!), 3),
          "Which apply? (one or more)",
          optionLabels(x.options),
        );
      } else if ("choice" in x && x.choice !== undefined) {
        name(
          resolve(x.choice),
          slug(x.options.map(plainText).join(" or "), 4),
          "Choose one",
          optionLabels(x.options),
        );
      }
      forChildren(x, nameInlines);
    }
  };
  const nameBlocks = (bs: Block[]): void => {
    for (const b of bs) {
      if (typeof b === "string") continue;
      if (Array.isArray(b)) nameInlines(b);
      else if ("p" in b) nameInlines(toInlines(b.p));
      else if ("bullet" in b) nameInlines(toInlines(b.bullet));
      else if ("opt" in b) {
        const first = firstText(b.opt);
        name(resolve(b.if), slug(first, 4), `Give the paragraph beginning “${clip(first, 60)}”?`);
        nameBlocks(b.opt);
      } else if ("elements" in b) {
        for (const it of b.elements) {
          if (isElement(it)) {
            if (it.if !== undefined)
              name(
                resolve(it.if),
                `element_${slug(it.n, 1).replace(/^q_/, "")}`,
                `Include element ${it.n} (“${clip(plainText(it.text), 50)}”)?`,
              );
            nameInlines(toInlines(it.text));
          } else if (isGroup(it)) {
            const labels = it.options.map((o) => (o.note ?? "").replace(/^Alternative\s*/, ""));
            const n = it.options[0]?.elements[0]?.n.replace(/\D.*$/, "") ?? "";
            name(
              it.alt,
              `element_${n || "x"}_alternative`,
              `Which alternative for element ${n}?`,
              labels,
            );
            if (it.if !== undefined)
              name(resolve(it.if), `element_${n || "x"}_group`, `Include element ${n}?`);
            for (const o of it.options) for (const e of o.elements) nameInlines(toInlines(e.text));
          }
        }
      }
    }
  };
  nameBlocks(t.body);
  const finalId = (q: string): string => describe.get(resolve(q))?.id ?? resolve(q);

  // Apply renames to the tree and question list.
  rewriteRefs(t.body, finalId);
  const listPunct = computeListPunctuation(t.body);
  if (listPunct)
    todo.push({
      kind: "agreement",
      detail: `${listPunct} list item(s) now compute their end punctuation from which later items are kept; check`,
    });
  const outQs: Question[] = [];
  const emitted = new Set<string>();
  for (const q of t.questions ?? []) {
    if (dropped.has(q.id) || rename.has(q.id)) continue;
    const d = describe.get(q.id);
    const nq: Question = { ...q, id: d?.id ?? q.id };
    if (d && !q.prompt) nq.prompt = d.prompt;
    if (nq.type !== "boolean" && d?.labels) {
      nq.options = nq.options.map((o, i) => ({ ...o, label: d.labels![i] || o.label }));
    }
    if (!emitted.has(nq.id)) outQs.push(nq);
    emitted.add(nq.id);
  }
  for (const [id, q] of questions)
    if (!emitted.has(id) && !(t.questions ?? []).some((x) => x.id === id)) outQs.push(q);
  // Keep only questions still referenced.
  const refs = collectRefs(t.body);
  t.questions = outQs.filter((q) => refs.has(q.id));
  function resolve(q: string): string {
    let r = q;
    while (rename.has(r)) r = rename.get(r)!;
    return r;
  }

  // --- notes govern the question that follows -----------------------------
  let unbound = 0;
  bindNotes(t.body, () => unbound++);
  if (unbound)
    todo.push({
      kind: "unbound-note",
      detail: `${unbound} drafter note(s) not tied to a question; tie any that govern a choice`,
    });
  if ((t.questions?.length ?? 0) > 25)
    todo.push({
      kind: "questions",
      detail: `${t.questions!.length} questions: look for repeated choices that should be one question`,
    });
  return { t, todo };
}

/**
 * Optional list items printed as separate paragraphs, each ending with a
 * punctuation choice ("[The defendant was …](./; or)"): an item takes the
 * continuing form ("; or") when a later item is kept, and the final form
 * (".") otherwise. Returns how many items were converted.
 */
function computeListPunctuation(bs: Block[]): number {
  let converted = 0;
  const tail = (b: Block): { cond: string; node: ChoiceNode } | undefined => {
    if (!Array.isArray(b) || b.length < 2) return undefined;
    const o = b[b.length - 2];
    const c = b[b.length - 1];
    if (typeof o !== "object" || !("opt" in o)) return undefined;
    if (typeof c !== "object" || !("options" in c) || "any" in c || c.options.length !== 2)
      return undefined;
    if (c.options.some((x) => /\p{L}/u.test(plainText(x).replace(/\b(or|and)\b/g, ""))))
      return undefined;
    return { cond: o.if, node: c };
  };
  let run: { cond: string; node: ChoiceNode }[] = [];
  const flush = (): void => {
    if (run.length >= 2) {
      run.forEach((item, k) => {
        const opts = item.node.options.map((o) => plainText(o).trim());
        const fin = opts.indexOf(".") >= 0 ? opts.indexOf(".") : opts.indexOf("");
        if (fin < 0) return;
        const own = /^[a-z][a-z0-9_]*$/.test(item.cond) ? item.cond : `(${item.cond})`;
        const later = run
          .slice(k + 1)
          .map((x) => (/^[a-z][a-z0-9_]*$/.test(x.cond) ? x.cond : `(${x.cond})`));
        const any = later.length ? `(${later.join(" | ")})` : undefined;
        const when = ["", ""];
        when[fin] = any ? `${own} & !${any}` : own;
        when[1 - fin] = any ? `${own} & ${any}` : `${own} & !${own}`;
        delete item.node.choice;
        item.node.when = when;
        converted++;
      });
    }
    run = [];
  };
  for (const b of bs) {
    if (typeof b === "object" && !Array.isArray(b) && "note" in b) continue; // notes between items
    const tl = tail(b);
    if (tl) run.push(tl);
    else flush();
    if (typeof b === "object" && !Array.isArray(b) && "opt" in b)
      converted += computeListPunctuation(b.opt);
  }
  flush();
  return converted;
}

/** The plural condition of "<word>[s]" right after position i ("(that/those) day[s]"). */
function forwardPlural(arr: Inline[], i: number): string | undefined {
  const word = arr[i + 1];
  const marker = arr[i + 2];
  if (typeof word !== "string" || !/^\s+[\w’']+$/.test(word)) return undefined;
  if (typeof marker === "object" && "opt" in marker && /^(s|es)$/.test(plainText(marker.opt)))
    return marker.if;
  return undefined;
}

function uniqueField(base: string, taken: Map<string, string>): string {
  const vals = new Set([...taken.values()].map((v) => v.slice(5)));
  let id = base.replace(/^q_/, "f_");
  for (let k = 2; vals.has(id); k++) id = `${base}_${k}`;
  return id;
}

/** An option's core words for comparing parallel lists ("with a firearm" → "firearm"). */
function core(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/^(?:\s*(?:with|by|of|for|to|in|a|an|the)\b)+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * For each option of `b`, the index of the matching option of `a` (equal cores
 * or one containing the other), strictly increasing; undefined if any option
 * has no match.
 */
function correspond(a: string[], b: string[]): number[] | undefined {
  if (b.length > a.length) return undefined;
  const out: number[] = [];
  let from = 0;
  for (const c of b) {
    let j = from;
    while (j < a.length && !(a[j] === c || a[j]!.includes(c) || c.includes(a[j]!))) j++;
    if (j >= a.length) return undefined;
    out.push(j);
    from = j + 1;
  }
  return out;
}

/** Option labels for the questionnaire: the option's words, without connectors or markup. */
function optionLabels(opts: (Inline[] | string)[]): string[] {
  return opts.map((o) =>
    clip(
      toInlines(o)
        .filter((x) => typeof x === "string" || !("sep" in x))
        .map((x) => (typeof x === "string" ? x : renderInlineSource(x)))
        .join(""),
      80,
    ),
  );
}

function firstText(bs: Block[]): string {
  for (const b of bs) {
    if (typeof b === "string") return b;
    if (Array.isArray(b)) return plainText(b);
    if ("p" in b) return plainText(b.p);
    if ("bullet" in b) return plainText(b.bullet);
    if ("opt" in b) return firstText(b.opt);
    if ("elements" in b) {
      const e = b.elements.find(isElement);
      if (e) return plainText(e.text);
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Tree walking

function forChildren(x: InlineNode, f: (xs: Inline[]) => void): void {
  const fix = (v: Inline[] | string, set: (a: Inline[]) => void): void => {
    if (typeof v === "string") return;
    f(v);
    set(v);
  };
  if ("em" in x) fix(x.em, (a) => (x.em = a));
  else if ("opt" in x) {
    if (typeof x.opt === "string") return;
    fix(x.opt, (a) => (x.opt = a));
  } else if ("options" in x) {
    x.options.forEach((o, i) => fix(o, (a) => ((x as ChoiceNode).options[i] = a)));
  }
}

/** Visit every top-level inline array of each paragraph/element/bullet. */
function walkParagraphs(bs: Block[], f: (xs: Inline[]) => void): void {
  bs.forEach((b, i) => {
    if (typeof b === "string") {
      const arr: Inline[] = [b];
      f(arr);
      if (arr.length !== 1 || arr[0] !== b) bs[i] = arr;
      return;
    }
    if (Array.isArray(b)) return f(b);
    if ("p" in b) {
      const arr = toInlines(b.p);
      f(arr);
      b.p = arr;
    } else if ("bullet" in b) {
      const arr = toInlines(b.bullet);
      f(arr);
      b.bullet = arr;
    } else if ("opt" in b) walkParagraphs(b.opt, f);
    else if ("elements" in b) {
      const el = (e: Element): void => {
        const arr = toInlines(e.text);
        f(arr);
        e.text = arr;
      };
      for (const it of b.elements) {
        if (isElement(it)) el(it);
        else if (isGroup(it)) it.options.forEach((o) => o.elements.forEach(el));
      }
    }
  });
}

function walkAllInlines(bs: Block[], f: (xs: Inline[]) => void): void {
  walkParagraphs(bs, f);
}

function rewriteRefs(bs: Block[], map: (q: string) => string): void {
  const cond = (c: string): string =>
    c.replace(/(?<![=~>\w@])([a-z][a-z0-9_]*)/g, (_m, id: string) => map(id));
  walkParagraphs(bs, function rw(xs: Inline[]): void {
    for (const x of xs) {
      if (typeof x === "string") continue;
      if ("opt" in x) x.if = cond(x.if);
      if ("choice" in x && x.choice !== undefined) x.choice = map(x.choice);
      if ("link" in x && x.link) x.link.q = map(x.link.q);
      if ("any" in x) x.any = map(x.any);
      if ("when" in x && x.when) x.when = x.when.map(cond);
      if ("agree" in x && x.onlyIf) x.onlyIf = cond(x.onlyIf);
      if ("note" in x && x.governs) x.governs = x.governs.map(map);
      forChildren(x, rw);
    }
  });
  const blocks = (list: Block[]): void => {
    for (const b of list) {
      if (typeof b !== "object" || Array.isArray(b)) continue;
      if ("opt" in b) {
        b.if = cond(b.if);
        blocks(b.opt);
      } else if ("note" in b && b.governs) b.governs = b.governs.map(map);
      else if ("elements" in b) {
        for (const it of b.elements) {
          if (isElement(it) && it.if !== undefined) it.if = cond(it.if);
          if (isGroup(it)) {
            it.alt = map(it.alt);
            if (it.if !== undefined) it.if = cond(it.if);
          }
          if (isNoteItem(it) && it.governs) it.governs = it.governs.map(map);
        }
      }
    }
  };
  blocks(bs);
}

function collectRefs(bs: Block[]): Set<string> {
  const out = new Set<string>();
  const cond = (c: string): void => {
    for (const m of c.matchAll(/(?<![=~>\w@])([a-z][a-z0-9_]*)/g)) out.add(m[1]!);
  };
  walkParagraphs(bs, function c(xs: Inline[]): void {
    for (const x of xs) {
      if (typeof x === "string") continue;
      if ("opt" in x) cond(x.if);
      if ("choice" in x && x.choice !== undefined) out.add(x.choice);
      if ("link" in x && x.link) out.add(x.link.q);
      if ("any" in x) out.add(x.any);
      if ("when" in x && x.when) x.when.forEach(cond);
      if ("agree" in x && x.onlyIf) cond(x.onlyIf);
      forChildren(x, c);
    }
  });
  const blocks = (list: Block[]): void => {
    for (const b of list) {
      if (typeof b !== "object" || Array.isArray(b)) continue;
      if ("opt" in b) {
        cond(b.if);
        blocks(b.opt);
      } else if ("elements" in b) {
        for (const it of b.elements) {
          if (isElement(it) && it.if !== undefined) cond(it.if);
          if (isGroup(it)) {
            out.add(it.alt);
            if (it.if !== undefined) cond(it.if);
          }
        }
      }
    }
  };
  blocks(bs);
  return out;
}

/** A note immediately before an optional block/element/group governs its question. */
function bindNotes(bs: Block[], unbound: () => void): void {
  const condQ = (c: string | undefined): string | undefined =>
    c && /^[a-z][a-z0-9_]*$/.test(c) ? c : undefined;
  bs.forEach((b, i) => {
    if (typeof b !== "object" || Array.isArray(b)) return;
    if ("note" in b && !("text" in b)) {
      const next = bs[i + 1];
      const q =
        next && typeof next === "object" && !Array.isArray(next) && "opt" in next
          ? condQ(next.if)
          : undefined;
      if (q && !b.governs) b.governs = [q];
      else if (!b.governs) unbound();
    }
    if ("opt" in b) bindNotes(b.opt, unbound);
    if ("elements" in b) {
      b.elements.forEach((it: ElementItem, j) => {
        if (!isNoteItem(it) || it.governs) return;
        const next = b.elements[j + 1];
        const q = next
          ? isElement(next)
            ? condQ(next.if)
            : isGroup(next)
              ? (condQ(next.if) ?? next.alt)
              : undefined
          : undefined;
        if (q) it.governs = [q];
        else unbound();
      });
    }
  });
}
