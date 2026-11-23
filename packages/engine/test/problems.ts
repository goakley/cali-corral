/** Checks on rendered jury text, shared by property tests and maintainer tools. */
import { evalCondition } from "../src/condition.ts";
import {
  computeEnd,
  DEFAULT_FLAGS,
  includedPositions,
  render,
  toPlainText,
  type RenderResult,
} from "../src/render.ts";
import type { Block, Element, ElementItem, RenderInput, Template } from "../src/types.ts";

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

/** Words that can sit between a subject pronoun and its verb. */
export const ADVERB =
  /^(?:\w+ly|also|not|still|then|only|never|always|already|again|now|just|even)$/i;

const NOT_VERB = new Set([
  "always",
  "perhaps",
  "sometimes",
  "as",
  "his",
  "this",
  "its",
  "unless",
  "less",
  "thus",
  "himself",
  "herself",
  "themselves",
  "yes",
  "us",
]);

/** Plural (they) form of a third-person singular present verb, or undefined. */
export function pluralVerb(v: string): string | undefined {
  const lower = v.toLowerCase();
  const fixed: Record<string, string> = {
    is: "are",
    was: "were",
    has: "have",
    does: "do",
    goes: "go",
    "doesn’t": "don’t",
    "isn’t": "aren’t",
    "wasn’t": "weren’t",
    "hasn’t": "haven’t",
    "doesn't": "don't",
    "isn't": "aren't",
    "wasn't": "weren't",
    "hasn't": "haven't",
  };
  let out: string | undefined = fixed[lower];
  if (out === undefined) {
    if (NOT_VERB.has(lower) || !/^[a-z]{3,}s$/.test(lower) || /(ss|us|is|ous)$/.test(lower))
      return undefined;
    if (/[^aeiou]ies$/.test(lower)) out = lower.slice(0, -3) + "y";
    else if (/(sh|ch|x|z|ss)es$/.test(lower)) out = lower.slice(0, -2);
    else out = lower.slice(0, -1);
  }
  return v[0] === v[0]!.toUpperCase() ? out[0]!.toUpperCase() + out.slice(1) : out;
}

/**
 * They/them agreement: "they" followed by a singular present verb
 * ("they knows", "they actually believes", "they was").
 */
export function agreementProblems(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b[Tt]hey\b/g)) {
    const words = text
      .slice(m.index + 4)
      .trimStart()
      .split(/\s+/)
      .slice(0, 6);
    let k = 0;
    while (k < words.length && ADVERB.test(words[k]!)) k++;
    const verb = words[k]?.replace(/[.,;:)\]”]+$/, "");
    if (verb && pluralVerb(verb) !== undefined)
      out.push(`they/them agreement: “they ${words.slice(0, k + 1).join(" ")}”`);
  }
  return out;
}

function elementLists(blocks: Block[]): ElementItem[][] {
  const out: ElementItem[][] = [];
  for (const b of blocks) {
    if (typeof b === "string" || Array.isArray(b)) continue;
    if ("elements" in b) {
      if (!b.plain) out.push(b.elements); // plain lists keep printed punctuation
    } else if ("opt" in b) out.push(...elementLists(b.opt));
  }
  return out;
}

/** The computed punctuation and AND must be ones the printed markup allows. */
export function markupProblems(t: Template, input: RenderInput): string[] {
  const p: string[] = [];
  const ctx = { answers: input.answers, flags: DEFAULT_FLAGS };
  const qs = new Map((t.questions ?? []).map((q) => [q.id, q]));
  for (const list of elementLists(t.body)) {
    const pos = includedPositions(
      list,
      (e) => e.if === undefined || evalCondition(e.if, ctx),
      (g) => {
        if (g.if !== undefined && !evalCondition(g.if, ctx)) return [];
        const q = qs.get(g.alt);
        const a = input.answers[g.alt];
        if (!q || q.type === "boolean") return [];
        return q.options
          .map((o, i) => ((Array.isArray(a) ? a.includes(o.id) : a === o.id) ? i : -1))
          .filter((i) => i >= 0);
      },
    );
    pos.forEach((x, i) => {
      const last = i === pos.length - 1;
      const els: Element[] =
        x.kind === "element" ? [x.e] : x.selected.flatMap((k) => x.g.options[k]!.elements);
      // In a group, only the final element of the final alternative can end the list.
      els.forEach((e, k) => {
        const end = computeEnd(e.end, last && k === els.length - 1);
        if (e.end === ";" && end !== ";")
          p.push(`element ${e.n}: printed ";" but it is the last element`);
        if (e.end === "." && end !== ".")
          p.push(`element ${e.n}: printed "." but it is not the last element`);
      });
      if (x.kind !== "element") return;
      const e = x.e;
      // The engine shows a conjunction only where one is printed.
      const conjShown = last && pos.length >= 2 && e.and !== undefined;
      // An AND printed inside an optional element's brackets ("[AND 4. ...]")
      // is used only when that element is last, like "[AND]"; only an
      // unbracketed AND on a required element forces it to be last.
      if (!conjShown && e.and === "AND" && e.if === undefined) {
        p.push(`element ${e.n}: printed AND but it is not the last element`);
      }
    });
  }
  return p;
}

/** Every problem the property tests look for in one rendering. */
export function renderProblems(
  t: Template,
  input: RenderInput,
  r: RenderResult = render(t, input, "annotated"),
): string[] {
  const problems: string[] = [];
  if (r.unanswered.length) problems.push(`unanswered: ${r.unanswered.join(", ")}`);
  if (r.missingFields.length) problems.push(`missing: ${r.missingFields.join(", ")}`);
  for (const b of r.blocks) {
    const text = b.runs.map((x) => x.text).join("");
    for (const pr of textProblems(text)) problems.push(`${pr}: ${JSON.stringify(text)}`);
    if (b.kind !== "conj" && !/^[\p{Lu}\p{N}“"‘]/u.test(text)) {
      problems.push(`block does not start with a capital: ${JSON.stringify(text.slice(0, 40))}`);
    }
  }
  // Every element list (a run of element blocks) must end with a period
  // unless its last item introduces a sub-list (":").
  r.blocks.forEach((b, i) => {
    if (b.kind !== "element") return;
    const next = r.blocks.slice(i + 1).find((x) => x.kind !== "conj");
    if (next && next.kind === "element" && next.depth === b.depth) return;
    // A sub-list's last item continues its parent list ("…; or" then the next element).
    if (next && next.kind === "element" && next.depth < b.depth) return;
    const text = b.runs.map((x) => x.text).join("");
    if (!/[.:?]$/.test(text)) problems.push(`element list does not end with a period: ${text}`);
  });
  problems.push(...markupProblems(t, input));
  if (Object.values(input.people).some((x) => x.pronouns === "they"))
    problems.push(...agreementProblems(toPlainText(r)));
  return problems;
}
