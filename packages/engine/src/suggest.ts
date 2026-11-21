/**
 * Suggested answers. Suggestions are never applied silently: the UI offers
 * them as defaults the user confirms, and they are deterministic.
 */

import type { Answer, RenderInput, Template } from "./types.ts";

// Words starting with a vowel letter that take "a", and consonant letters that take "an".
const A_EXCEPTIONS = /^(uni|use|usu|uti|eu|one|once|ubiq|u\b)/i;
const AN_EXCEPTIONS = /^(hour|honest|honor|heir|[fhlmnrsx]\b|[fhlmnrsx]\.)/i;

/** "a" or "an" for the word that follows. */
export function article(next: string): "a" | "an" {
  const w = next.trim().replace(/^[“"‘']/, "");
  if (AN_EXCEPTIONS.test(w)) return "an";
  if (A_EXCEPTIONS.test(w)) return "a";
  return /^[aeiou]/i.test(w) ? "an" : "a";
}

function fieldValue(path: string, input: RenderInput): string | undefined {
  if (path === "count") return input.count;
  if (path.startsWith("text.")) return input.text?.[path.slice(5)];
  const [role, prop] = path.split(".") as [string, "name" | "title" | "agency"];
  return input.people[role]?.[prop];
}

/** Suggested answers for questions that can be inferred from case data. */
export function suggestAnswers(t: Template, input: RenderInput): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const q of t.questions ?? []) {
    if (q.type !== "choice" || q.articleFor === undefined) continue;
    const v = fieldValue(q.articleFor, input);
    if (!v) continue;
    const want = article(v);
    const opt = q.options.find((o) => o.label.toLowerCase() === want);
    if (opt) out[q.id] = opt.id;
  }
  return out;
}
