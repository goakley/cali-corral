/**
 * Text canonicalization shared by source mode and the round-trip test.
 *
 * These rules mirror `tools/extract/src/calcrim_extract/normalize.py`
 * (`canonical_spacing`). Keep them in sync; the technical design lists them.
 */

export const BLANK = "______";

/** Canonical spacing for source-mode text (mirrors the extractor). */
export function canonicalSource(text: string): string {
  return text
    .replace(/[ \t\n]+/g, " ")
    .replace(/([^\s/([])([([]) +/g, "$1 $2")
    .replace(/([([]) +/g, "$1")
    .replace(/\/ +/g, "/")
    .replace(/_{2,}/g, BLANK)
    .replace(new RegExp(BLANK + " *(?=<)", "g"), BLANK + " ")
    .replace(new RegExp(BLANK + " +(?=[.,;:)\\]])", "g"), BLANK)
    .trim();
}

/** Characters after which a following space is removed in jury text. */
const NO_SPACE_AFTER = new Set(["(", "[", "“", "‘", "—", "–", "/"]);
/** Characters before which a preceding space is removed in jury text. */
const NO_SPACE_BEFORE = new Set([".", ",", ";", ":", ")", "]", "?", "!", "”", "’", "—", "–"]);

/**
 * Whitespace cleanup for jury text: when optional content is left out, the
 * spaces around it would otherwise double up or sit before punctuation.
 * Official text never has a space before `.,;:)]?!` or after `(`, so these
 * rules don't alter official wording.
 */
export function cleanJuryText(parts: string[]): string[] {
  const out = parts.slice();
  const text = out.join("");
  // Work on the concatenation, then map edits back onto parts.
  const keep: boolean[] = new Array(text.length).fill(true);
  let lastKept = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === " " || c === "\n" || c === "\t") {
      if (lastKept < 0) {
        keep[i] = false; // leading
        continue;
      }
      const prev = text[lastKept]!;
      if (prev === " " || NO_SPACE_AFTER.has(prev)) {
        keep[i] = false;
        continue;
      }
      continue;
    }
    if (NO_SPACE_BEFORE.has(c) && lastKept >= 0 && text[lastKept] === " ") {
      // Keep the space before an em/en dash only if the official text spaced it;
      // CALCRIM sets dashes closed, so remove.
      keep[lastKept] = false;
    }
    lastKept = i;
  }
  // trailing whitespace
  for (let i = text.length - 1; i >= 0 && /\s/.test(text[i]!); i--) keep[i] = false;
  // Normalize remaining whitespace characters to a single space.
  let pos = 0;
  for (let p = 0; p < out.length; p++) {
    const s = out[p]!;
    let r = "";
    for (let k = 0; k < s.length; k++, pos++) {
      if (keep[pos]) r += /\s/.test(s[k]!) ? " " : s[k]!;
    }
    out[p] = r;
  }
  return out;
}
