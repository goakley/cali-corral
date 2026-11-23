/**
 * Re-serialize templates in the drafter's YAML style (after hand edits).
 * Drops YAML comments other than the license header, so don't run it on
 * templates whose comments matter.
 *
 *   node scripts/format.ts <ids...>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTemplateYaml } from "../src/load.ts";
import { TEMPLATES_DIR } from "../test/corpus.ts";
import { templateYaml } from "./autodraft.ts";

for (const id of process.argv.slice(2)) {
  const path = join(TEMPLATES_DIR, `${id}.yaml`);
  writeFileSync(path, templateYaml(parseTemplateYaml(readFileSync(path, "utf8"))));
}
