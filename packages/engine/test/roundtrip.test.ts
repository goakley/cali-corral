/**
 * Round-trip test (CLAUDE.md non-negotiable 1): for every template, source-mode
 * output must equal the normalized official text, character for character.
 * Never weaken or skip this test to make CI pass.
 */
import { describe, expect, it } from "vitest";
import { renderSource } from "../src/source.ts";
import { validateTemplate } from "../src/validate.ts";
import { bodySha256, loadExtracted, loadTemplate, loadTemplateRaw, templateIds } from "./corpus.ts";

const ids = templateIds();

describe("corpus", () => {
  it("has templates", () => {
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe.each(ids)("template %s", (id) => {
  it("is valid", () => {
    expect(validateTemplate(loadTemplateRaw(id))).toEqual([]);
  });

  it("round-trips to the official text", () => {
    const t = loadTemplate(id);
    const official = loadExtracted(id);
    expect(renderSource(t).join("\n")).toBe(official.body.join("\n"));
  });

  it("records the source it was encoded from", () => {
    const t = loadTemplate(id);
    const official = loadExtracted(id);
    expect(t.id).toBe(official.number);
    expect(t.title).toBe(official.title);
    expect(t.source.file).toBe(official.source.file);
    expect(t.source.revision_line).toBe(official.revision_line);
    expect(t.source.body_sha256).toBe(bodySha256(official.body));
  });
});
