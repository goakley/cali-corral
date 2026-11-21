/**
 * Property tests: render many random answer sets per template and check the
 * jury text for leftover markup, unfilled fields, spacing and punctuation
 * errors, element-list punctuation, and consistency with the official markup.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evalCondition } from "../src/condition.ts";
import { computeEnd, DEFAULT_FLAGS, includedPositions, render, toPlainText } from "../src/render.ts";
import type { Block, Element, ElementItem, RenderInput, Template } from "../src/types.ts";
import { inputArb } from "./arbitrary.ts";
import { loadTemplate, templateIds } from "./corpus.ts";

export const RUNS = 500;

const ALLOWED_SLASH = /\b(and\/or)\b/gi;

/** Problems in one rendered block's text. */
export function textProblems(text: string): string[] {
  const p: string[] = [];
  if (/[[\]<>]/.test(text)) p.push("leftover bracket markup");
  if (text.includes("______")) p.push("unfilled blank");
  if (/\w\/\w/.test(text.replace(ALLOWED_SLASH, ""))) p.push("leftover slash alternative");
  if (/\([^()]*\/[^()]*\)/.test(text.replace(ALLOWED_SLASH, ""))) p.push("leftover choice");
  if (/ {2}/.test(text)) p.push("doubled space");
  if (/^\s|\s$/.test(text)) p.push("leading or trailing space");
  if (/[,;:]\s*(?:[,;:]|\.(?!\d))|\.\s*[,;:]|(?<!\.)\.\.(?!\.)/.test(text)) p.push("doubled punctuation");
  if (/\s[,;:)]|\s\.(?!\d)/.test(text)) p.push("space before punctuation");
  if (/\p{L}[.,]\d/u.test(text)) p.push("missing space before a number");
  if (/\*/.test(text)) p.push("leftover emphasis markup");
  return p;
}

function elementLists(blocks: Block[]): ElementItem[][] {
  const out: ElementItem[][] = [];
  for (const b of blocks) {
    if (typeof b === "string" || Array.isArray(b)) continue;
    if ("elements" in b) out.push(b.elements);
    else if ("opt" in b) out.push(...elementLists(b.opt));
  }
  return out;
}

/** The computed punctuation and AND must be ones the printed markup allows. */
export function markupProblems(t: Template, input: RenderInput): string[] {
  const p: string[] = [];
  const ctx = { answers: input.answers, flags: DEFAULT_FLAGS };
  const qs = new Map((t.questions ?? []).map((q) => [q.id, q]));
  for (const list of elementLists(t.body)) {
    const pos = includedPositions(
      list,
      (e) => e.if === undefined || evalCondition(e.if, ctx),
      (g) => {
        const q = qs.get(g.alt);
        const a = input.answers[g.alt];
        if (!q || q.type === "boolean") return [];
        return q.options.map((o, i) => ((Array.isArray(a) ? a.includes(o.id) : a === o.id) ? i : -1)).filter((i) => i >= 0);
      },
    );
    pos.forEach((x, i) => {
      const last = i === pos.length - 1;
      const els: Element[] = x.kind === "element" ? [x.e] : x.selected.flatMap((k) => x.g.options[k]!.elements);
      for (const e of els) {
        const end = computeEnd(e.end, last);
        if (e.end === ";" && end !== ";") p.push(`element ${e.n}: printed ";" but it is the last element`);
        if (e.end === "." && end !== ".") p.push(`element ${e.n}: printed "." but it is not the last element`);
      }
      if (x.kind !== "element") return;
      const e = x.e;
      const conjShown = last && pos.length >= 2;
      if (conjShown && e.and === undefined) p.push(`element ${e.n}: needs AND but none is printed`);
      // An AND printed inside an optional element's brackets ("[AND 4. ...]")
      // is used only when that element is last, like "[AND]"; only an
      // unbracketed AND on a required element forces it to be last.
      if (!conjShown && e.and === "AND" && e.if === undefined) {
        p.push(`element ${e.n}: printed AND but it is not the last element`);
      }
    });
  }
  return p;
}

const ids = templateIds();

describe.each(ids)("template %s (property)", (id) => {
  const t = loadTemplate(id);

  it(`renders clean jury text for ${RUNS} random answer sets`, () => {
    fc.assert(
      fc.property(inputArb(t), (input) => {
        // Annotated mode has the same text as jury mode, plus run origins.
        const r = render(t, input, "annotated");
        const problems: string[] = [];
        if (r.unanswered.length) problems.push(`unanswered: ${r.unanswered.join(", ")}`);
        if (r.missingFields.length) problems.push(`missing: ${r.missingFields.join(", ")}`);
        for (const b of r.blocks) {
          const text = b.runs.map((x) => x.text).join("");
          for (const pr of textProblems(text)) problems.push(`${pr}: ${JSON.stringify(text)}`);
          const startsWithUserText = b.runs[0]?.origin?.field?.startsWith("text.") ?? false;
          if (b.kind !== "conj" && !startsWithUserText && !/^[\p{Lu}\p{N}“"‘]/u.test(text)) {
            problems.push(`block does not start with a capital: ${JSON.stringify(text.slice(0, 40))}`);
          }
        }
        const els = r.blocks.filter((b) => b.kind === "element");
        if (els.length) {
          const lastText = els[els.length - 1]!.runs.map((x) => x.text).join("");
          if (!lastText.endsWith(".")) problems.push(`element list does not end with a period: ${lastText}`);
        }
        problems.push(...markupProblems(t, input));
        const usesThey = Object.values(input.people).some((x) => x.pronouns === "they");
        const plain = toPlainText(r);
        if (usesThey && /\b[Tt]hey (is|was|has|does|knows|knew him)\b/.test(plain)) {
          problems.push("they/them agreement error");
        }
        // determinism
        expect(toPlainText(render(t, input, "jury"))).toBe(plain);
        expect(toPlainText(render(t, input, "annotated"))).toBe(plain);
        expect(problems).toEqual([]);
      }),
      { numRuns: RUNS, seed: 20261120 },
    );
  });
});
