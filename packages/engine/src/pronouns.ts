/**
 * Pronoun binding.
 *
 * Official text prints pronoun alternatives masculine-first: `(he/she)`,
 * `(him/her)`, `(his/her)`, `(his/hers)`, `(himself/herself)`, sometimes with
 * a they-form already included: `(he/she/they)`. The Guide for Using CALCRIM
 * allows they/them and asks courts to respect personal pronouns, so when a
 * person uses they/them and the text has no printed they-form, the engine
 * derives it from the masculine/feminine pair. Verbs that must agree are
 * annotated separately in templates (`agree` nodes).
 */

import type { Pronouns } from "./types.ts";

const THEY_FORMS: Record<string, string> = {
  "he/she": "they",
  "him/her": "them",
  "his/her": "their",
  "his/hers": "theirs",
  "himself/herself": "themselves",
};

function matchCase(model: string, word: string): string {
  if (
    model.length > 0 &&
    model[0] === model[0]!.toUpperCase() &&
    model[0] !== model[0]!.toLowerCase()
  ) {
    return word[0]!.toUpperCase() + word.slice(1);
  }
  return word;
}

/** The they-form for a printed alternative, or undefined if not derivable. */
export function theyForm(forms: string[]): string | undefined {
  if (forms.length >= 3) return forms[2];
  const key = `${forms[0]!.toLowerCase()}/${forms[1]!.toLowerCase()}`;
  const w = THEY_FORMS[key];
  return w === undefined ? undefined : matchCase(forms[0]!, w);
}

export function pronounText(forms: string[], p: Pronouns): string | undefined {
  switch (p) {
    case "he":
      return forms[0];
    case "she":
      return forms[1];
    case "they":
      return theyForm(forms);
  }
}
