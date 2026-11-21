/** Test helpers: load templates and the extracted official text. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTemplateYaml } from "../src/load.ts";
import type { Template } from "../src/types.ts";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const TEMPLATES_DIR = join(REPO, "corpus/templates");
export const GOLDEN_DIR = join(REPO, "tests/golden");

/** The extracted release templates are checked against. */
export const RELEASE: string = JSON.parse(
  readFileSync(join(REPO, "corpus/release.json"), "utf8"),
).extracted;
export const EXTRACTED_DIR = join(REPO, "data/extracted", RELEASE);

export interface ExtractedRecord {
  number: string;
  title: string;
  revision_line: string | null;
  body: string[];
  source: { file: string; release: string; sha256: string };
}

export function templateIds(): string[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export function loadTemplateRaw(id: string): unknown {
  return parseTemplateYaml(readFileSync(join(TEMPLATES_DIR, `${id}.yaml`), "utf8"));
}

export function loadTemplate(id: string): Template {
  return loadTemplateRaw(id) as Template;
}

export function loadExtracted(id: string): ExtractedRecord {
  return JSON.parse(readFileSync(join(EXTRACTED_DIR, `${id}.json`), "utf8")) as ExtractedRecord;
}

export function bodySha256(body: string[]): string {
  return createHash("sha256").update(body.join("\n"), "utf8").digest("hex");
}
