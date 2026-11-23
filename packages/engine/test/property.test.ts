/**
 * Property tests: render many random answer sets per template and check the
 * jury text for leftover markup, unfilled fields, spacing and punctuation
 * errors, element-list punctuation, and consistency with the official markup.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evalCondition } from "../src/condition.ts";
import {
  computeEnd,
  DEFAULT_FLAGS,
  includedPositions,
  render,
  toPlainText,
} from "../src/render.ts";
import type { Block, Element, ElementItem, RenderInput, Template } from "../src/types.ts";
import { inputArb } from "./arbitrary.ts";
import { textProblems } from "./problems.ts";
import { loadTemplate, templateIds } from "./corpus.ts";

export const RUNS = 500;

function elementLists(blocks: Block[]): ElementItem[][] {
  const out: ElementItem[][] = [];
  for (const b of blocks) {
    if (typeof b === "string" || Array.isArray(b)) continue;
    if ("elements" in b) {
      if (!b.plain) out.push(b.elements); // plain lists keep printed punctuation
    } else if ("opt" in b) out.push(...elementLists(b.opt));
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
        return q.options
          .map((o, i) => ((Array.isArray(a) ? a.includes(o.id) : a === o.id) ? i : -1))
          .filter((i) => i >= 0);
      },
    );
    pos.forEach((x, i) => {
      const last = i === pos.length - 1;
      const els: Element[] =
        x.kind === "element" ? [x.e] : x.selected.flatMap((k) => x.g.options[k]!.elements);
      for (const e of els) {
        const end = computeEnd(e.end, last);
        if (e.end === ";" && end !== ";")
          p.push(`element ${e.n}: printed ";" but it is the last element`);
        if (e.end === "." && end !== ".")
          p.push(`element ${e.n}: printed "." but it is not the last element`);
      }
      if (x.kind !== "element") return;
      const e = x.e;
      // The engine shows a conjunction only where one is printed.
      const conjShown = last && pos.length >= 2 && e.and !== undefined;
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
          if (b.kind !== "conj" && !/^[\p{Lu}\p{N}“"‘]/u.test(text)) {
            problems.push(
              `block does not start with a capital: ${JSON.stringify(text.slice(0, 40))}`,
            );
          }
        }
        // Every element list (a run of element blocks) must end with a period
        // unless its last item introduces a sub-list (":").
        r.blocks.forEach((b, i) => {
          if (b.kind !== "element") return;
          const next = r.blocks.slice(i + 1).find((x) => x.kind !== "conj");
          if (next && next.kind === "element" && next.depth === b.depth) return;
          const text = b.runs.map((x) => x.text).join("");
          if (!/[.:]$/.test(text))
            problems.push(`element list does not end with a period: ${text}`);
        });
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
