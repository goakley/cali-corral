/** Golden files: shared helpers for the golden test and the candidate generator. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, toPlainText } from "../src/render.ts";
import type { RenderInput, RenderedBlock, Template } from "../src/types.ts";
import { GOLDEN_DIR } from "./corpus.ts";

export const CANDIDATES_DIR = join(GOLDEN_DIR, "candidates");
export const CANDIDATE_KINDS = ["minimal", "maximal", "mixed"] as const;

/** The text a golden file holds: title plus jury-mode plain text. */
export function goldenText(t: Template, input: RenderInput): string {
  return toPlainText(render(t, input, "jury"), { title: true }) + "\n";
}

export interface GoldenCase {
  id: string;
  name: string;
  inputPath: string;
  textPath: string;
}

/** Cases in a directory laid out as <dir>/<id>/<name>.input.json + <name>.txt */
export function casesIn(dir: string): GoldenCase[] {
  if (!existsSync(dir)) return [];
  const out: GoldenCase[] = [];
  for (const id of readdirSync(dir)) {
    if (!/^\d{3,4}[A-Z]?$/.test(id)) continue;
    for (const f of readdirSync(join(dir, id))) {
      const m = /^(.+)\.input\.json$/.exec(f);
      if (!m) continue;
      out.push({ id, name: m[1]!, inputPath: join(dir, id, f), textPath: join(dir, id, `${m[1]}.txt`) });
    }
  }
  return out;
}

export function readInput(c: GoldenCase): RenderInput {
  return JSON.parse(readFileSync(c.inputPath, "utf8")) as RenderInput;
}

/**
 * Review notes for an attorney: things that are faithful to the official
 * markup but may need a human look.
 */
export function reviewNotes(blocks: RenderedBlock[]): string[] {
  const notes: string[] = [];
  blocks.forEach((b) => {
    const text = b.runs.map((r) => r.text).join("");
    if (b.kind === "p" && !/[.:?!”)\]]$/.test(text)) {
      notes.push(`Paragraph has no closing punctuation: “…${text.slice(-50)}”`);
    }
    if (/\p{Ll}\p{Lu}|[a-z]{3,}created/u.test(text.replace(/\b(McN|Mc|O’|de|De)\w*/g, ""))) {
      notes.push(`Possible missing space: “…${text.slice(0, 80)}…”`);
    }
  });
  return notes;
}
