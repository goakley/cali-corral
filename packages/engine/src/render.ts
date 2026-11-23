/**
 * Jury and annotated rendering.
 *
 * Jury mode produces final text with no markup. Annotated mode is the same
 * text with each run tagged with the question, field or person it came from,
 * for the preview. Both are deterministic functions of (template, input).
 */

import { conditionRefs, evalCondition, type EvalContext } from "./condition.ts";
import { pronounText } from "./pronouns.ts";
import { renderInlineSource } from "./source.ts";
import { BLANK, cleanJuryText } from "./text.ts";
import type {
  AnyNode,
  Block,
  ChoiceNode,
  Element,
  ElementGroup,
  ElementItem,
  Inline,
  InlineNode,
  Origin,
  Person,
  Question,
  RenderInput,
  Rendered,
  RenderedBlock,
  Run,
  Template,
} from "./types.ts";
import { isElement, isGroup, toInlines } from "./walk.ts";

export type Mode = "jury" | "annotated";

/** Built-in flags available to conditions. v1 supports a single defendant. */
export const DEFAULT_FLAGS: Record<string, boolean> = { multiple_defendants: false };

interface Ctx {
  t: Template;
  input: RenderInput;
  questions: Map<string, Question>;
  ev: EvalContext;
  missing: Set<string>;
  unanswered: Set<string>;
  consulted: Set<string>;
  /** Errata of unbalanced markup that was included in the output. */
  structural: Set<string>;
}

interface SepState {
  rank: number; // rank of this option among the selected ones
  count: number; // number of selected options
  hasCommaSeps: boolean;
}

export interface RenderResult extends Rendered {
  /** Every question consulted while rendering (i.e. currently relevant). */
  relevant: string[];
}

export function render(t: Template, input: RenderInput, mode: Mode = "jury"): RenderResult {
  const ctx: Ctx = {
    t,
    input,
    questions: new Map((t.questions ?? []).map((q) => [q.id, q])),
    ev: { answers: input.answers, flags: DEFAULT_FLAGS },
    missing: new Set(),
    unanswered: new Set(),
    consulted: new Set(),
    structural: new Set(),
  };
  const out: RenderedBlock[] = [];
  for (const b of t.body) renderBlock(b, ctx, out);
  const blocks = out
    .map((b) => finishBlock(b, mode))
    .filter((b) => b.kind === "conj" || hasVisibleText(b));
  const seen = new Set([...ctx.structural, ...blocks.flatMap((b) => b.errata ?? [])]);
  const errata = (t.errata ?? [])
    .filter((e) => e.kind === "title" || seen.has(e.id))
    .map((e) => e.id);
  return {
    id: t.id,
    title: t.title,
    blocks,
    missingFields: [...ctx.missing],
    unanswered: [...ctx.unanswered],
    relevant: [...ctx.consulted],
    errata,
  };
}

function hasVisibleText(b: RenderedBlock): boolean {
  return b.runs.some((r) => /[\p{L}\p{N}]/u.test(r.text));
}

/**
 * Official paragraphs and elements always begin with a capital letter. When a
 * lowercase alternative ends up first ("(Self-defense/[or] defense of
 * another)" with only the second chosen, or a field value), capitalize its
 * first letter. Only letter case changes, never wording.
 */
function capitalizeFirst(parts: string[]): string[] {
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i]!;
    const m = /\p{L}/u.exec(s);
    if (m) {
      parts[i] = s.slice(0, m.index) + s[m.index]!.toUpperCase() + s.slice(m.index + 1);
      return parts;
    }
    if (/[\p{N}]/u.test(s)) return parts; // starts with a number: leave as is
  }
  return parts;
}

function finishBlock(b: RenderedBlock, mode: Mode): RenderedBlock {
  const anchored = [
    ...new Set(b.runs.flatMap((r) => (r.origin?.erratum ? [r.origin.erratum] : []))),
  ];
  const cleaned = cleanJuryText(b.runs.map((r) => r.text));
  if (b.kind !== "conj") capitalizeFirst(cleaned);
  const runs: Run[] = [];
  b.runs.forEach((r, i) => {
    const text = cleaned[i]!;
    if (text === "" || r.origin?.erratum) return;
    const run: Run = { text };
    if (r.em) run.em = true;
    if (mode === "annotated" && r.origin) run.origin = r.origin;
    const prev = runs[runs.length - 1];
    if (prev && !!prev.em === !!run.em && sameOrigin(prev.origin, run.origin)) {
      prev.text += run.text;
    } else {
      runs.push(run);
    }
  });
  const done: RenderedBlock = { ...b, runs };
  if (anchored.length) done.errata = anchored;
  else delete done.errata;
  return done;
}

/** Record an included node whose official markup is unbalanced. */
function noteUnbalanced(u: { unclosed?: string; unopened?: string }, ctx: Ctx): void {
  if (u.unclosed) ctx.structural.add(u.unclosed);
  if (u.unopened) ctx.structural.add(u.unopened);
}

function sameOrigin(a: Origin | undefined, b: Origin | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---------------------------------------------------------------------------
// Conditions

function cond(src: string, ctx: Ctx): boolean {
  for (const r of conditionRefs(src)) {
    ctx.consulted.add(r.q);
    if (ctx.input.answers[r.q] === undefined) ctx.unanswered.add(r.q);
  }
  return evalCondition(src, ctx.ev);
}

function firstQuestion(src: string): string | undefined {
  return conditionRefs(src)[0]?.q;
}

// ---------------------------------------------------------------------------
// Blocks

function renderBlock(b: Block, ctx: Ctx, out: RenderedBlock[]): void {
  if (typeof b === "string" || Array.isArray(b)) {
    out.push({ kind: "p", depth: 0, runs: inlines(b, ctx, undefined, undefined) });
    return;
  }
  if ("p" in b) {
    out.push({ kind: "p", depth: 0, runs: inlines(b.p, ctx, undefined, undefined) });
    return;
  }
  if ("bullet" in b) {
    out.push({ kind: "bullet", depth: 1, runs: inlines(b.bullet, ctx, undefined, undefined) });
    return;
  }
  if ("note" in b) return;
  if ("opt" in b) {
    if (cond(b.if, ctx)) {
      noteUnbalanced(b, ctx);
      for (const x of b.opt) renderBlock(x, ctx, out);
    }
    return;
  }
  if ("elements" in b) {
    renderElements(b.elements, b.conj ?? "AND", b.style ?? "number", b.plain === true, ctx, out);
    return;
  }
  const never: never = b;
  throw new Error(`unknown block ${JSON.stringify(never)}`);
}

/** End punctuation forms the engine computes (others are kept as printed). */
const COMPUTED_ENDS = new Set([";", ".", "(;/.)"]);

export function computeEnd(printed: string, isLast: boolean): string {
  return COMPUTED_ENDS.has(printed) ? (isLast ? "." : ";") : printed;
}

type Position =
  { kind: "element"; e: Element } | { kind: "group"; g: ElementGroup; selected: number[] };

/** Which alternatives of a group are selected (in template order). */
function groupSelection(g: ElementGroup, ctx: Ctx): number[] {
  ctx.consulted.add(g.alt);
  const qd = ctx.questions.get(g.alt);
  const ans = ctx.input.answers[g.alt];
  let sel: number[] = [];
  if (qd?.type === "choice" && typeof ans === "string") {
    sel = [qd.options.findIndex((o) => o.id === ans)].filter((i) => i >= 0);
  } else if (qd?.type === "multi" && Array.isArray(ans)) {
    sel = qd.options.map((o, i) => (ans.includes(o.id) ? i : -1)).filter((i) => i >= 0);
  }
  if (sel.length === 0) ctx.unanswered.add(g.alt);
  return sel;
}

/** The positions of an element list that are included under the answers. */
export function includedPositions(
  items: ElementItem[],
  includeElement: (e: Element) => boolean,
  selectGroup: (g: ElementGroup) => number[],
): Position[] {
  const out: Position[] = [];
  for (const it of items) {
    if (isElement(it)) {
      if (includeElement(it)) out.push({ kind: "element", e: it });
    } else if (isGroup(it)) {
      const selected = selectGroup(it);
      if (selected.length) out.push({ kind: "group", g: it, selected });
    }
  }
  return out;
}

const unbracket = (s: string): string => s.replace(/^\[|\]$/g, "");

function renderElements(
  items: ElementItem[],
  conj: string,
  style: "number" | "alpha",
  plain: boolean,
  ctx: Ctx,
  out: RenderedBlock[],
): void {
  const depth = style === "alpha" ? 2 : 1;
  const positions = includedPositions(
    items,
    (e) => e.if === undefined || cond(e.if, ctx),
    (g) => groupSelection(g, ctx),
  );
  let n = 0;
  const push = (e: Element, number: number, last: boolean, label?: string): void => {
    noteUnbalanced(e, ctx);
    const runs = inlines(e.text, ctx, undefined, undefined);
    const end = plain ? e.end : computeEnd(e.end, last);
    if (end) runs.push({ text: end });
    const b: RenderedBlock = { kind: "element", depth, number, runs };
    const l = label ?? (style === "alpha" ? String.fromCharCode(96 + number) : undefined);
    if (l !== undefined) b.label = l;
    out.push(b);
  };
  positions.forEach((p, i) => {
    const last = i === positions.length - 1;
    if (p.kind === "element") {
      // The conjunction goes before the last element only where CALCRIM prints
      // one before it (AND, [AND], or AND inside the element's brackets).
      if (!plain && last && positions.length >= 2 && p.e.and !== undefined)
        out.push({ kind: "conj", depth, runs: [{ text: conj }] });
      push(p.e, ++n, last);
      return;
    }
    // Groups are never last (enforced by validation).
    const g = p.g;
    for (const oi of p.selected) noteUnbalanced(g.options[oi]!, ctx);
    if (p.selected.length === 1) {
      for (const e of g.options[p.selected[0]!]!.elements) push(e, ++n, false);
      return;
    }
    n++;
    p.selected.forEach((oi, k) => {
      if (k > 0) out.push({ kind: "conj", depth, runs: [{ text: unbracket(g.or ?? "OR") }] });
      for (const e of g.options[oi]!.elements) push(e, n, false, `${n}${e.n.replace(/^\d+/, "")}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Inline

function inlines(
  xs: Inline[] | string,
  ctx: Ctx,
  origin: Origin | undefined,
  sep: SepState | undefined,
): Run[] {
  return toInlines(xs).flatMap((x) => inline(x, ctx, origin, sep));
}

function textRun(text: string, origin: Origin | undefined, em?: boolean): Run {
  const r: Run = { text };
  if (em) r.em = true;
  if (origin) r.origin = origin;
  return r;
}

function inline(n: Inline, ctx: Ctx, origin: Origin | undefined, sep: SepState | undefined): Run[] {
  if (typeof n === "string") return [textRun(n, origin)];
  return node(n, ctx, origin, sep);
}

function node(
  n: InlineNode,
  ctx: Ctx,
  origin: Origin | undefined,
  sep: SepState | undefined,
): Run[] {
  if ("em" in n) return inlines(n.em, ctx, origin, sep).map((r) => ({ ...r, em: true as const }));
  if ("field" in n) return [field(n.field, ctx)];
  if ("opt" in n) {
    if (!cond(n.if, ctx)) return [];
    noteUnbalanced(n, ctx);
    const q = firstQuestion(n.if);
    return inlines(n.opt, ctx, q ? { question: q } : origin, sep);
  }
  if ("any" in n) {
    noteUnbalanced(n, ctx);
    return anyNode(n, ctx);
  }
  if ("options" in n) {
    noteUnbalanced(n, ctx);
    return choice(n, ctx, origin, sep);
  }
  if ("sep" in n) return sepNode(n.sep, sep);
  if ("pronoun" in n) return pronoun(n.pronoun, n.forms, ctx, n.bare === true);
  if ("agree" in n) {
    const p = person(n.agree, ctx)?.pronouns;
    if (p === undefined) {
      ctx.missing.add(`${n.agree}.pronouns`);
      return [textRun(n.alt ? `(${n.sg}/${n.pl})` : n.sg, { person: n.agree })];
    }
    const plural = p === "they" && (n.onlyIf === undefined || cond(n.onlyIf, ctx));
    return [textRun(plural ? n.pl : n.sg, { person: n.agree })];
  }
  if ("note" in n) return [];
  if ("erratum" in n) return [{ text: "", origin: { erratum: n.erratum } }];
  const never: never = n;
  throw new Error(`unknown inline node ${JSON.stringify(never)}`);
}

function person(role: string, ctx: Ctx): Person | undefined {
  return ctx.input.people[role];
}

function field(path: string, ctx: Ctx): Run {
  let value: string | undefined;
  if (path === "count") value = ctx.input.count;
  else if (path.startsWith("text.")) value = ctx.input.text?.[path.slice(5)];
  else {
    const [role, prop] = path.split(".") as [string, "name" | "title" | "agency"];
    value = person(role, ctx)?.[prop];
  }
  if (value === undefined || value.trim() === "") {
    ctx.missing.add(path);
    return textRun(BLANK, { field: path });
  }
  return textRun(value.trim(), { field: path });
}

function pronoun(role: string, forms: string[], ctx: Ctx, bare: boolean): Run[] {
  const p = person(role, ctx)?.pronouns;
  const text = p === undefined ? undefined : pronounText(forms, p);
  if (text === undefined) {
    ctx.missing.add(`${role}.pronouns`);
    return [textRun(bare ? forms.join("/") : `(${forms.join("/")})`, { person: role })];
  }
  return [textRun(text, { person: role })];
}

function choice(
  n: ChoiceNode,
  ctx: Ctx,
  origin: Origin | undefined,
  sep: SepState | undefined,
): Run[] {
  let idx = -1;
  let o: Origin | undefined = origin;
  if (n.choice !== undefined) {
    const q = n.choice;
    ctx.consulted.add(q);
    o = { question: q };
    const ans = ctx.input.answers[q];
    const qd = ctx.questions.get(q);
    if (qd && qd.type === "choice" && typeof ans === "string") {
      idx = qd.options.findIndex((opt) => opt.id === ans);
    }
    if (idx < 0) ctx.unanswered.add(q);
  } else if (n.when !== undefined) {
    idx = n.when.findIndex((c) => cond(c, ctx));
    // No condition holds: the punctuation belongs to an omitted optional item
    // (e.g. "[or socioeconomic status] (./,)"), so nothing is rendered.
    if (idx < 0) return [];
  }
  if (idx < 0 || idx >= n.options.length) {
    return [textRun(renderInlineSource(n), o)];
  }
  return inlines(n.options[idx]!, ctx, o, sep);
}

const COMMA_SEP = /^[,;]$/;

function sepsOf(o: Inline[] | string): string[] {
  return toInlines(o).flatMap((x) => (typeof x === "object" && "sep" in x ? [x.sep] : []));
}

/**
 * Pick-one-or-more alternatives with series connectors.
 *
 * CALCRIM's bracketed connectors (`[,]`, `[or]`, `[and]`) are series
 * punctuation for whichever items are kept, not properties of the item they
 * happen to be printed next to (`[and]` is often printed only before the last
 * item). So the engine treats them as describing the series:
 * - the conjunction is an option's own word connector, or else the first word
 *   connector printed anywhere in the node;
 * - with comma connectors, commas follow every selected item but the last when
 *   three or more are selected, and the conjunction precedes the last;
 * - without comma connectors, the conjunction precedes every selected item but
 *   the first ("A or B or C").
 */
function anyNode(n: AnyNode, ctx: Ctx): Run[] {
  const q = n.any;
  ctx.consulted.add(q);
  const origin: Origin = { question: q };
  const qd = ctx.questions.get(q);
  const ans = ctx.input.answers[q];
  if (!qd || qd.type !== "multi" || !Array.isArray(ans) || ans.length === 0) {
    ctx.unanswered.add(q);
    return [textRun(renderInlineSource(n), origin)];
  }
  const selected = qd.options
    .map((opt, i) => (ans.includes(opt.id) ? i : -1))
    .filter((i) => i >= 0 && i < n.options.length);
  const allSeps = n.options.flatMap(sepsOf);
  const hasComma = allSeps.some((x) => COMMA_SEP.test(x));
  const comma = allSeps.find((x) => COMMA_SEP.test(x)) ?? ",";
  const seriesWord = allSeps.find((x) => !COMMA_SEP.test(x));
  const runs: Run[] = [];
  selected.forEach((i, rank) => {
    const opt = n.options[i]!;
    const word = sepsOf(opt).find((x) => !COMMA_SEP.test(x)) ?? seriesWord;
    const count = selected.length;
    if (rank > 0) {
      runs.push(textRun(" ", origin));
      if (word !== undefined && (!hasComma || rank === count - 1))
        runs.push(textRun(word + " ", origin));
    }
    runs.push(...inlines(opt, ctx, origin, { rank, count, hasCommaSeps: hasComma }));
    if (hasComma && count >= 3 && rank < count - 1) runs.push(textRun(comma, origin));
  });
  return runs;
}

/** Connector nodes render nothing themselves; `anyNode` places the series punctuation. */
function sepNode(text: string, s: SepState | undefined): Run[] {
  if (!s) throw new Error(`[${text}] connector outside a pick-one-or-more alternative`);
  return [];
}

// ---------------------------------------------------------------------------
// Plain text

/** Plain-text form of a rendered instruction (for clipboard export and tests). */
export function toPlainText(r: Rendered, opts: { title?: boolean } = {}): string {
  const lines: string[] = [];
  if (opts.title) lines.push(r.title, "");
  for (const b of r.blocks) {
    const text = b.runs.map((x) => x.text).join("");
    if (b.kind === "element") lines.push(`${b.label ?? b.number}. ${text}`);
    else if (b.kind === "bullet") lines.push(`• ${text}`);
    else lines.push(text);
  }
  return lines.join("\n\n");
}
