import { describe, expect, it } from "vitest";
import { article } from "../src/suggest.ts";

describe("article", () => {
  it.each([
    ["deputy sheriff", "a"],
    ["officer", "an"],
    ["emergency medical technician", "an"],
    ["university police officer", "a"],
    ["honorary", "an"],
    ["“executive officer”", "an"],
  ])("%s → %s", (w, a) => {
    expect(article(w)).toBe(a);
  });
});
