/**
 * Stamp a template's source.body_sha256 (and revision line) from the extracted
 * record — only if the template already round-trips to that text.
 *
 *   pnpm --filter @cali-corral/engine stamp 945 [2652 ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderSource } from "../src/source.ts";
import { bodySha256, loadExtracted, loadTemplate, TEMPLATES_DIR } from "../test/corpus.ts";

let failed = false;
for (const id of process.argv.slice(2)) {
  const t = loadTemplate(id);
  const rec = loadExtracted(id);
  const src = renderSource(t);
  if (src.join("\n") !== rec.body.join("\n")) {
    console.error(`${id}: does not round-trip; not stamped`);
    failed = true;
    continue;
  }
  const path = join(TEMPLATES_DIR, `${id}.yaml`);
  const text = readFileSync(path, "utf8").replace(
    /^( {2}body_sha256: ).*$/m,
    `$1"${bodySha256(rec.body)}"`,
  );
  writeFileSync(path, text);
  console.log(`${id}: stamped ${bodySha256(rec.body)}`);
}
process.exit(failed ? 1 : 0);
