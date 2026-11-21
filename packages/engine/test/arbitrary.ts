/** Answer generators for property tests and golden candidates. Fictional data only. */

import fc from "fast-check";
import type { Answer, Block, Inline, Person, Pronouns, RenderInput, Template } from "../src/types.ts";
import { suggestAnswers } from "../src/suggest.ts";
import { allElements, toInlines } from "../src/walk.ts";

export interface TemplateNeeds {
  roles: Set<string>;
  textFields: Set<string>;
  usesCount: boolean;
}

export function needs(t: Template): TemplateNeeds {
  const out: TemplateNeeds = { roles: new Set(["defendant"]), textFields: new Set(), usesCount: false };
  const inl = (xs: Inline[] | string): void => {
    for (const x of toInlines(xs)) {
      if (typeof x === "string") continue;
      if ("field" in x) {
        if (x.field === "count") out.usesCount = true;
        else if (x.field.startsWith("text.")) out.textFields.add(x.field.slice(5));
        else out.roles.add(x.field.split(".")[0]!);
      } else if ("em" in x) inl(x.em);
      else if ("opt" in x) inl(x.opt);
      else if ("options" in x) x.options.forEach(inl);
      else if ("pronoun" in x) out.roles.add(x.pronoun);
      else if ("agree" in x) out.roles.add(x.agree);
    }
  };
  const blk = (bs: Block[]): void => {
    for (const b of bs) {
      if (typeof b === "string" || Array.isArray(b)) inl(b);
      else if ("p" in b) inl(b.p);
      else if ("bullet" in b) inl(b.bullet);
      else if ("opt" in b) blk(b.opt);
      else if ("elements" in b) allElements(b.elements).forEach((e) => inl(e.text));
    }
  };
  blk(t.body);
  for (const r of Object.keys(t.people ?? {})) out.roles.add(r);
  return out;
}

const FIRST = ["Avery", "Jordan", "Riley", "Casey", "Morgan", "Quinn", "Rowan", "Sage"];
const LAST = ["Example", "Sample", "Placeholder", "Testcase", "Fictional", "Doe"];
const TITLES = ["police officer", "deputy sheriff", "highway patrol officer", "game warden", "firefighter"];
const AGENCIES = ["the Exampleville Police Department", "the Sample County Sheriff’s Office", "the Department of Fish and Wildlife"];
const TEXTS = ["enforcing the law", "a fictional fact pattern", "an example description", "assault"];

const pronouns = fc.constantFrom<Pronouns>("he", "she", "they");
const name = fc.tuple(fc.constantFrom(...FIRST), fc.constantFrom(...LAST)).map(([a, b]) => `${a} ${b}`);

export function personArb(): fc.Arbitrary<Person> {
  return fc.record({
    name,
    title: fc.constantFrom(...TITLES),
    agency: fc.constantFrom(...AGENCIES),
    pronouns,
  });
}

export function answersArb(t: Template): fc.Arbitrary<Record<string, Answer>> {
  const entries: Record<string, fc.Arbitrary<Answer>> = {};
  for (const q of t.questions ?? []) {
    if (q.type === "boolean") entries[q.id] = fc.boolean();
    else if (q.type === "choice") entries[q.id] = fc.constantFrom(...q.options.map((o) => o.id));
    else {
      const ids = q.options.map((o) => o.id);
      entries[q.id] = fc
        .subarray(ids, { minLength: 1 })
        .map((xs) => ids.filter((id) => xs.includes(id)));
    }
  }
  return fc.record(entries);
}

export function inputArb(t: Template): fc.Arbitrary<RenderInput> {
  const n = needs(t);
  const people: Record<string, fc.Arbitrary<Person>> = {};
  for (const r of n.roles) people[r] = personArb();
  const text: Record<string, fc.Arbitrary<string>> = {};
  for (const f of n.textFields) text[f] = fc.constantFrom(...TEXTS);
  return fc.record({
    answers: answersArb(t),
    people: fc.record(people),
    count: fc.integer({ min: 1, max: 12 }).map(String),
    text: fc.record(text),
  });
}

/** Deterministic inputs for golden candidates. */
export function fixedInput(t: Template, kind: "minimal" | "maximal" | "mixed"): RenderInput {
  const answers: Record<string, Answer> = {};
  (t.questions ?? []).forEach((q, i) => {
    const alt = i % 2 === 0;
    if (q.type === "boolean") answers[q.id] = kind === "maximal" || (kind === "mixed" && alt);
    else if (q.type === "choice") {
      const opts = q.options;
      answers[q.id] = (kind === "minimal" ? opts[0] : kind === "maximal" ? opts[opts.length - 1] : opts[i % opts.length])!.id;
    } else {
      const ids = q.options.map((o) => o.id);
      answers[q.id] = kind === "minimal" ? [ids[0]!] : kind === "maximal" ? ids : ids.filter((_, j) => j % 2 === i % 2).slice(0, Math.max(1, ids.length - 1));
      if ((answers[q.id] as string[]).length === 0) answers[q.id] = [ids[0]!];
    }
  });
  const n = needs(t);
  const pr: Pronouns = kind === "minimal" ? "he" : kind === "maximal" ? "they" : "she";
  const people: Record<string, Person> = {};
  [...n.roles].sort().forEach((r, i) => {
    people[r] = {
      name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`,
      title: TITLES[i % TITLES.length]!,
      agency: AGENCIES[i % AGENCIES.length]!,
      pronouns: pr,
    };
  });
  const text: Record<string, string> = {};
  [...n.textFields].forEach((f, i) => {
    text[f] = `[${f.replace(/_/g, " ")} ${i + 1}]`.replace(/[[\]]/g, "");
  });
  const input: RenderInput = { answers, people, count: "1", text };
  // Apply the engine's suggestions (e.g. a/an), as the UI would offer them.
  return { ...input, answers: { ...answers, ...suggestAnswers(t, input) } };
}
