/**
 * Property tests: render many random answer sets per template and check the
 * jury text for leftover markup, unfilled fields, spacing and punctuation
 * errors, element-list punctuation, and consistency with the official markup.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { render, toPlainText } from "../src/render.ts";
import { inputArb } from "./arbitrary.ts";
import { renderProblems } from "./problems.ts";
import { loadTemplate, templateIds } from "./corpus.ts";

export const RUNS = 500;

const ids = templateIds();

describe.each(ids)("template %s (property)", (id) => {
  const t = loadTemplate(id);

  it(`renders clean jury text for ${RUNS} random answer sets`, () => {
    fc.assert(
      fc.property(inputArb(t), (input) => {
        // Annotated mode has the same text as jury mode, plus run origins.
        const r = render(t, input, "annotated");
        const problems = renderProblems(t, input, r);
        const plain = toPlainText(r);
        // determinism
        expect(toPlainText(render(t, input, "jury"))).toBe(plain);
        expect(toPlainText(render(t, input, "annotated"))).toBe(plain);
        expect(problems).toEqual([]);
      }),
      { numRuns: RUNS, seed: 20261120 },
    );
  });
});
