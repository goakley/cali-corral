/**
 * Maintainer tool: show why an instruction fails, with the offending rendered
 * text. Uses the authored template if one exists, else the auto-draft skeleton.
 *
 *   node scripts/explain.ts <ids...>
 */
import fc from "fast-check";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTemplateYaml } from "../src/load.ts";
import { render } from "../src/render.ts";
import { renderSource } from "../src/source.ts";
import type { Template } from "../src/types.ts";
import { validateTemplate } from "../src/validate.ts";
import { inputArb } from "../test/arbitrary.ts";
import { EXTRACTED_DIR, TEMPLATES_DIR, type ExtractedRecord } from "../test/corpus.ts";
import { textProblems } from "../test/problems.ts";
import { draftRecord } from "./autodraft.ts";

for (const id of process.argv.slice(2)) {
  const rec = JSON.parse(
    readFileSync(join(EXTRACTED_DIR, `${id}.json`), "utf8"),
  ) as ExtractedRecord;
  const path = join(TEMPLATES_DIR, `${id}.yaml`);
  let t: Template;
  try {
    t = existsSync(path) ? parseTemplateYaml(readFileSync(path, "utf8")) : draftRecord(rec);
  } catch (e) {
    console.log(`${id}: parse: ${(e as Error).message}`);
    continue;
  }
  const issues = validateTemplate(JSON.parse(JSON.stringify(t)));
  if (issues.length) {
    console.log(`${id}: invalid: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    continue;
  }
  const src = renderSource(t);
  const k = src.findIndex((x, i) => x !== rec.body[i]);
  if (k >= 0 || src.length !== rec.body.length) {
    console.log(`${id}: round trip, paragraph ${k}:\n  got:  ${src[k]}\n  want: ${rec.body[k]}`);
    continue;
  }
  let shown = false;
  fc.assert(
    fc.property(inputArb(t), (input) => {
      if (shown) return true;
      for (const b of render(t, input, "jury").blocks) {
        const text = b.runs.map((x) => x.text).join("");
        const ps = textProblems(text);
        if (ps.length) {
          console.log(`${id}: ${ps.join(", ")}:\n  ${text}`);
          shown = true;
        }
      }
      return true;
    }),
    { numRuns: 300, seed: 1 },
  );
  if (!shown) console.log(`${id}: no problems found`);
}
