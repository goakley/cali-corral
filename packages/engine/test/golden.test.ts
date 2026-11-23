/**
 * Golden tests: attorney-approved renders in tests/golden/<id>/ must match
 * exactly. Candidates in tests/golden/candidates/ are generated for review
 * and must exist (at least minimal, maximal and mixed) and be current.
 * Never edit a golden to make this test pass; report the difference instead.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOLDEN_DIR, loadTemplate, templateIds } from "./corpus.ts";
import { CANDIDATE_KINDS, CANDIDATES_DIR, casesIn, goldenText, readInput } from "./golden.ts";

const goldens = casesIn(GOLDEN_DIR);
const candidates = casesIn(CANDIDATES_DIR);

describe("golden renders (attorney-approved)", () => {
  it("lists the approved goldens", () => {
    // 24 approved 2026-11-22 (200, 220, 226, 860, 926, 945, 1800, 3470 × minimal/maximal/mixed).
    // Goldens are never deleted to make CI pass, so the count only grows.
    expect(goldens.length).toBeGreaterThanOrEqual(24);
  });
  it.each(goldens.map((c) => [`${c.id}/${c.name}`, c] as const))("%s matches", (_n, c) => {
    expect(goldenText(loadTemplate(c.id), readInput(c))).toBe(readFileSync(c.textPath, "utf8"));
  });
});

describe.each(templateIds())("candidates for %s", (id) => {
  it.each(CANDIDATE_KINDS)("has a current %s candidate", (kind) => {
    const c = candidates.find((x) => x.id === id && x.name === kind);
    expect(c, `run: pnpm --filter @cali-corral/engine candidates`).toBeDefined();
    if (!c) return;
    expect(existsSync(c.textPath)).toBe(true);
    expect(goldenText(loadTemplate(id), readInput(c))).toBe(readFileSync(c.textPath, "utf8"));
  });
});
