/** Checks on rendered jury text, shared by property tests and maintainer tools. */

const ALLOWED_SLASH = /\b(and\/or)\b/gi;

/** Problems in one rendered block's text. */
export function textProblems(text: string): string[] {
  const p: string[] = [];
  if (/[[\]<>]/.test(text)) p.push("leftover bracket markup");
  if (text.includes("______")) p.push("unfilled blank");
  if (/\w\/\w/.test(text.replace(ALLOWED_SLASH, ""))) p.push("leftover slash alternative");
  if (/\([^()]*\/[^()]*\)/.test(text.replace(ALLOWED_SLASH, ""))) p.push("leftover choice");
  if (/ {2}/.test(text)) p.push("doubled space");
  if (/^\s|\s$/.test(text)) p.push("leading or trailing space");
  if (/[,;:]\s*(?:[,;:]|\.(?!\d))|\.\s*[,;:]|(?<!\.)\.\.(?!\.)/.test(text))
    p.push("doubled punctuation");
  if (/\s[,;:)]|\s\.(?!\d)/.test(text)) p.push("space before punctuation");
  if (/\p{L}[.,]\d/u.test(text)) p.push("missing space before a number");
  if (/\*/.test(text)) p.push("leftover emphasis markup");
  return p;
}
