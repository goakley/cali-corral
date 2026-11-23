/**
 * Generate golden candidates for attorney review (fictional data only):
 *   tests/golden/candidates/<id>/{minimal,maximal,mixed}.input.json + .txt
 *   tests/golden/candidates/REVIEW.md (index) and review/<series>.md
 * Candidates are never promoted automatically. To approve one, an attorney
 * (or a maintainer on their behalf) copies both files to tests/golden/<id>/.
 * REVIEW.md marks cases whose current text matches an approved golden.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "../src/render.ts";
import { fixedInput } from "../test/arbitrary.ts";
import { GOLDEN_DIR, loadTemplate, RELEASE, templateIds } from "../test/corpus.ts";
import { CANDIDATE_KINDS, CANDIDATES_DIR, goldenText, reviewNotes } from "../test/golden.ts";

const only = process.argv.slice(2);
const ids = only.length ? only : templateIds();
if (!only.length) rmSync(CANDIDATES_DIR, { recursive: true, force: true });

const intro = [
  `Generated from templates encoded against CALCRIM release ${RELEASE}. All names and facts are fictional.`,
  "",
  "For each case, compare the rendered text with the official instruction and the answers given.",
  "To approve a case, copy its `.input.json` and `.txt` from `candidates/<id>/` to `tests/golden/<id>/`.",
  "Cases marked **Approved** already match an attorney-approved golden; only the others need review.",
  "Notes flag output that follows the official markup literally but may need a human look.",
  "",
];
const series = (id: string): string => String(Math.floor(parseInt(id, 10) / 100) * 100);
const bySeries = new Map<string, string[]>();
const index: { id: string; title: string; status: string }[] = [];

for (const id of ids) {
  const t = loadTemplate(id);
  const dir = join(CANDIDATES_DIR, id);
  mkdirSync(dir, { recursive: true });
  const review = bySeries.get(series(id)) ?? [];
  bySeries.set(series(id), review);
  review.push(`## ${id}. ${t.title}`, "");
  let approvedCases = 0;
  let changedCases = 0;
  for (const kind of CANDIDATE_KINDS) {
    const input = fixedInput(t, kind);
    writeFileSync(join(dir, `${kind}.input.json`), JSON.stringify(input, null, 2) + "\n");
    const text = goldenText(t, input);
    writeFileSync(join(dir, `${kind}.txt`), text);
    const r = render(t, input, "jury");
    const yes = Object.entries(input.answers)
      .filter(([, v]) => v !== false)
      .map(([k, v]) => (v === true ? k : `${k}=${Array.isArray(v) ? v.join("+") : v}`));
    const approved = join(GOLDEN_DIR, id, `${kind}.txt`);
    const status =
      existsSync(approved) && readFileSync(approved, "utf8") === text
        ? " — **Approved**"
        : existsSync(approved)
          ? " — **Changed since approval: needs review**"
          : "";
    if (status.includes("Approved")) approvedCases++;
    if (status.includes("Changed")) changedCases++;
    review.push(
      `### ${kind}${status}`,
      "",
      `Answers: ${yes.length ? yes.join(", ") : "(all optional text off)"}`,
      "",
    );
    const pr = Object.entries(input.people).map(([role, p]) => `${role}: ${p.pronouns}`);
    review.push(`Pronouns: ${pr.join(", ")}`, "");
    for (const n of reviewNotes(r.blocks)) review.push(`- Note: ${n}`);
    for (const id of r.errata) {
      const e = t.errata?.find((x) => x.id === id);
      if (e) review.push(`- Erratum (${e.kind}, ${e.status}): ${e.note}`);
    }
    review.push("", "```text", text.trimEnd(), "```", "");
  }
  index.push({
    id,
    title: t.title,
    status:
      changedCases > 0
        ? "changed since approval"
        : approvedCases === CANDIDATE_KINDS.length
          ? "approved"
          : t.review,
  });
}
if (!only.length) {
  mkdirSync(join(CANDIDATES_DIR, "review"), { recursive: true });
  for (const [s, lines] of bySeries) {
    writeFileSync(
      join(CANDIDATES_DIR, "review", `${s}.md`),
      [`# Golden candidates: ${s} series`, "", ...intro, ...lines].join("\n") + "\n",
    );
  }
  const rows = index.map(
    (r) =>
      `| [${r.id}](review/${series(r.id)}.md) | ${r.title.replace(/\|/g, "\\|")} | ${r.status} |`,
  );
  writeFileSync(
    join(CANDIDATES_DIR, "REVIEW.md"),
    [
      "# Golden candidates for review",
      "",
      ...intro,
      "Candidates are grouped by series under `review/`. Status: **approved** (all cases match approved goldens), **machine-checked** (not yet reviewed by a person).",
      "",
      "| No. | Title | Status |",
      "| --- | --- | --- |",
      ...rows,
    ].join("\n") + "\n",
  );
}
console.log(`wrote candidates for ${ids.length} template(s) to ${CANDIDATES_DIR}`);
