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
import { isElement, isNoteItem, toInlines } from "./walk.ts";

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
  };
  const out: RenderedBlock[] = [];
  for (const b of t.body) renderBlock(b, ctx, out);
  const blocks = out
    .map((b) => finishBlock(b, mode))
    .filter((b) => b.kind === "conj" || hasVisibleText(b));
  return {
    id: t.id,
    title: t.title,
    blocks,
    missingFields: [...ctx.missing],
    unanswered: [...ctx.unanswered],
    relevant: [...ctx.consulted],
  };
}

function hasVisibleText(b: RenderedBlock): boolean {
  return b.runs.some((r) => /[\p{L}\p{N}]/u.test(r.text));
}

function finishBlock(b: RenderedBlock, mode: Mode): RenderedBlock {
  const cleaned = cleanJuryText(b.runs.map((r) => r.text));
  const runs: Run[] = [];
  b.runs.forEach((r, i) => {
    const text = cleaned[i]!;
    if (text === "") return;
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
  return { ...b, runs };
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
    if (cond(b.if, ctx)) for (const x of b.opt) renderBlock(x, ctx, out);
    return;
  }
  if ("elements" in b) {
    renderElements(b.elements.filter(isElement), b.conj ?? "AND", ctx, out);
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

function renderElements(els: Element[], conj: string, ctx: Ctx, out: RenderedBlock[]): void {
  const included = els.filter((e) => e.if === undefined || cond(e.if, ctx));
  included.forEach((e, i) => {
    const last = i === included.length - 1;
    if (last && included.length >= 2) {
      out.push({ kind: "conj", depth: 1, runs: [{ text: conj }] });
    }
    const runs = inlines(e.text, ctx, undefined, undefined);
    const end = computeEnd(e.end, last);
    if (end) runs.push({ text: end });
    out.push({ kind: "element", depth: 1, number: i + 1, runs });
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

function node(n: InlineNode, ctx: Ctx, origin: Origin | undefined, sep: SepState | undefined): Run[] {
  if ("em" in n) return inlines(n.em, ctx, origin, sep).map((r) => ({ ...r, em: true as const }));
  if ("field" in n) return [field(n.field, ctx)];
  if ("opt" in n) {
    if (!cond(n.if, ctx)) return [];
    const q = firstQuestion(n.if);
    return inlines(n.opt, ctx, q ? { question: q } : origin, sep);
  }
  if ("any" in n) return anyNode(n, ctx);
  if ("options" in n) return choice(n, ctx, origin, sep);
  if ("sep" in n) return sepNode(n.sep, sep, origin);
  if ("pronoun" in n) return pronoun(n.pronoun, n.forms, ctx);
  if ("agree" in n) {
    const p = person(n.agree, ctx)?.pronouns;
    if (p === undefined) {
      ctx.missing.add(`${n.agree}.pronouns`);
      return [textRun(n.alt ? `(${n.sg}/${n.pl})` : n.sg, { person: n.agree })];
    }
    return [textRun(p === "they" ? n.pl : n.sg, { person: n.agree })];
  }
  if ("note" in n) return [];
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

function pronoun(role: string, forms: string[], ctx: Ctx): Run[] {
  const p = person(role, ctx)?.pronouns;
  const text = p === undefined ? undefined : pronounText(forms, p);
  if (text === undefined) {
    ctx.missing.add(`${role}.pronouns`);
    return [textRun(`(${forms.join("/")})`, { person: role })];
  }
  return [textRun(text, { person: role })];
}

function choice(n: ChoiceNode, ctx: Ctx, origin: Origin | undefined, sep: SepState | undefined): Run[] {
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
  }
  if (idx < 0 || idx >= n.options.length) {
    return [textRun(renderInlineSource(n), o)];
  }
  return inlines(n.options[idx]!, ctx, o, sep);
}

const COMMA_SEP = /^[,;]$/;

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
  const hasCommaSeps = n.options.some((o) => toInlines(o).some((x) => typeof x === "object" && "sep" in x && COMMA_SEP.test(x.sep)));
  const runs: Run[] = [];
  selected.forEach((i, rank) => {
    if (rank > 0) runs.push(textRun(" ", origin));
    runs.push(...inlines(n.options[i]!, ctx, origin, { rank, count: selected.length, hasCommaSeps }));
  });
  return runs;
}

/**
 * Series connectors inside an `any` node:
 * - a comma-type connector (`[,]`, `[;]`) shows after every selected option
 *   except the last, when three or more options are selected;
 * - a word connector (`[or]`, `[and]`, `[and/or]`) shows before a selected
 *   option that isn't the first; when the node also has comma connectors, only
 *   before the last selected option ("A, B, or C"), otherwise before each
 *   ("A or B or C").
 */
export function sepVisible(sepText: string, s: SepState): boolean {
  if (COMMA_SEP.test(sepText)) return s.count >= 3 && s.rank < s.count - 1;
  return s.rank > 0 && (!s.hasCommaSeps || s.rank === s.count - 1);
}

function sepNode(text: string, s: SepState | undefined, origin: Origin | undefined): Run[] {
  if (!s) throw new Error(`[${text}] connector outside a pick-one-or-more alternative`);
  return sepVisible(text, s) ? [textRun(text, origin)] : [];
}

// ---------------------------------------------------------------------------
// Plain text

/** Plain-text form of a rendered instruction (for clipboard export and tests). */
export function toPlainText(r: Rendered, opts: { title?: boolean } = {}): string {
  const lines: string[] = [];
  if (opts.title) lines.push(r.title, "");
  for (const b of r.blocks) {
    const text = b.runs.map((x) => x.text).join("");
    if (b.kind === "element") lines.push(`${b.number}. ${text}`);
    else if (b.kind === "bullet") lines.push(`• ${text}`);
    else lines.push(text);
  }
  return lines.join("\n\n");
}
