import { describe, expect, it } from "vitest";
import { canonicalSource, cleanJuryText } from "../src/text.ts";

const clean = (parts: string[]): string => cleanJuryText(parts).join("");

describe("cleanJuryText", () => {
  it("collapses spaces left by omitted content", () => {
    expect(clean(["The defendant is charged ", "", " with battery", " ", "."])).toBe(
      "The defendant is charged with battery.",
    );
  });
  it("removes space after an opening parenthesis and before closing punctuation", () => {
    expect(clean(["( ", "a", " )", " ;"])).toBe("(a);");
  });
  it("trims", () => {
    expect(clean(["  a ", " "])).toBe("a");
  });
  it("keeps the part structure", () => {
    expect(cleanJuryText(["a ", " b"])).toEqual(["a ", "b"]);
  });
});

describe("canonicalSource", () => {
  it("mirrors the extractor's spacing rules", () => {
    expect(canonicalSource("(a/ [or] b)")).toBe("(a/[or] b)");
    expect(canonicalSource("charged[ in Count ____ ]")).toBe("charged [in Count ______]");
    expect(canonicalSource("______<insert>")).toBe("______ <insert>");
    expect(canonicalSource("of ______ .")).toBe("of ______.");
    expect(canonicalSource("[[ For")).toBe("[[For");
  });
});
