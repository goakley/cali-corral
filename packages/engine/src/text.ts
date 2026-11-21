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
  const text = parts.join("");
  const keep: boolean[] = new Array<boolean>(text.length).fill(true);
  const ws = (c: string | undefined): boolean => c === " " || c === "\n" || c === "\t";
  let lastKept = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (ws(c)) {
      const prev = lastKept < 0 ? undefined : text[lastKept];
      if (prev === undefined || ws(prev) || NO_SPACE_AFTER.has(prev)) {
        keep[i] = false;
        continue;
      }
      lastKept = i;
      continue;
    }
    if (NO_SPACE_BEFORE.has(c) && lastKept >= 0 && ws(text[lastKept])) keep[lastKept] = false;
    lastKept = i;
  }
  for (let i = text.length - 1; i >= 0 && (ws(text[i]) || !keep[i]); i--) keep[i] = false;
  // Map the kept characters back onto the parts, normalizing whitespace to " ".
  const out: string[] = [];
  let pos = 0;
  for (const s of parts) {
    let r = "";
    for (let k = 0; k < s.length; k++, pos++) if (keep[pos]) r += ws(s[k]) ? " " : s[k]!;
    out.push(r);
  }
  return out;
}
