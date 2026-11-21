/** Unit tests for the engine, independent of the corpus. Fictional data only. */
import { describe, expect, it } from "vitest";
import { ConditionError, evalCondition, parseCondition } from "../src/condition.ts";
import { theyForm } from "../src/pronouns.ts";
import { render, toPlainText } from "../src/render.ts";
import { renderSource } from "../src/source.ts";
import type { Block, Question, RenderInput, Template } from "../src/types.ts";
import { validateTemplate } from "../src/validate.ts";

const SHA = "0".repeat(64);

function tpl(body: Block[], questions: Question[] = [], people: Template["people"] = {}): Template {
  return {
    schema: 1,
    id: "999",
    title: "Test",
    source: { file: "x", release: "x", revision_line: "x", body_sha256: SHA },
    review: "machine-checked",
    people,
    questions,
    body,
  };
}

const bool = (id: string): Question => ({ id, type: "boolean" });
const choiceQ = (id: string, ...ids: string[]): Question => ({
  id,
  type: "choice",
  options: ids.map((x) => ({ id: x, label: x })),
});
const multiQ = (id: string, ...ids: string[]): Question => ({
  id,
  type: "multi",
  options: ids.map((x) => ({ id: x, label: x })),
});

function jury(t: Template, input: Partial<RenderInput>): string {
  return toPlainText(render(t, { answers: {}, people: {}, ...input }));
}

describe("conditions", () => {
  const ctx = (answers: Record<string, boolean | string | string[]>) => ({
    answers,
    flags: { multiple_defendants: false },
  });
  it("evaluates booleans, choices, multis, counts and flags", () => {
    expect(evalCondition("a & !b", ctx({ a: true, b: false }))).toBe(true);
    expect(evalCondition("k=x | k=y", ctx({ k: "y" }))).toBe(true);
    expect(evalCondition("m~p", ctx({ m: ["p", "q"] }))).toBe(true);
    expect(evalCondition("m>1", ctx({ m: ["p", "q"] }))).toBe(true);
    expect(evalCondition("m>1", ctx({ m: ["p"] }))).toBe(false);
    expect(evalCondition("!(a | b)", ctx({}))).toBe(true);
    expect(evalCondition("@multiple_defendants", ctx({}))).toBe(false);
  });
  it("rejects malformed expressions", () => {
    expect(() => parseCondition("a &")).toThrow(ConditionError);
    expect(() => parseCondition("a b")).toThrow(ConditionError);
    expect(() => parseCondition("m>x")).toThrow(ConditionError);
  });
});

describe("source mode", () => {
  it("re-emits official markup", () => {
    const t = tpl(
      [
        [
          "A ",
          { opt: "b", if: "q" },
          " ",
          { choice: "c", options: ["x", "y"] },
          " ",
          { field: "text.f", hint: "insert f" },
          " ",
          { em: "term" },
          " ",
          { pronoun: "defendant", forms: ["he", "she"] },
          { note: "drafter note" },
        ],
        { note: "Give the next paragraph when…" },
        { opt: ["Para one.", "Para two."], if: "q" },
        { bullet: [{ opt: "Bullet?", if: "q" }] },
      ],
      [bool("q"), choiceQ("c", "x", "y")],
    );
    expect(renderSource(t)).toEqual([
      "A [b] (x/y) ______ <insert f> *term* (he/she)<drafter note>",
      "<Give the next paragraph when…>",
      "[Para one.",
      "Para two.]",
      "• [Bullet?]",
    ]);
  });

  it("prints elements with their printed numbers, ends and conjunctions", () => {
    const t = tpl(
      [
        {
          elements: [
            { n: "1", text: "One", end: ";" },
            { n: "2", and: "[AND]", text: "Two", end: "(;/.)" },
            { note: "Give element 3 when…" },
            { n: "3", if: "q", and: "AND", text: "Three", end: "." },
          ],
        },
      ],
      [bool("q")],
    );
    expect(renderSource(t)).toEqual([
      "1. One;",
      "[AND]",
      "2. Two(;/.)",
      "<Give element 3 when…>",
      "[AND",
      "3. Three.]",
    ]);
  });
});

describe("jury mode", () => {
  it("drops omitted options and cleans spacing", () => {
    const t = tpl(
      [
        [
          "The defendant is charged ",
          { opt: ["in Count ", { field: "count" }], if: "q" },
          " with theft.",
        ],
      ],
      [bool("q")],
    );
    expect(jury(t, { answers: { q: false } })).toBe("The defendant is charged with theft.");
    expect(jury(t, { answers: { q: true }, count: "3" })).toBe(
      "The defendant is charged in Count 3 with theft.",
    );
  });

  it("numbers elements and places AND before the last included element", () => {
    const t = tpl(
      [
        {
          elements: [
            { n: "1", text: "One", end: ";" },
            { n: "2", and: "[AND]", text: "Two", end: "(;/.)" },
            { n: "3", if: "q", and: "AND", text: "Three", end: "." },
          ],
        },
      ],
      [bool("q")],
    );
    expect(jury(t, { answers: { q: false } })).toBe("1. One;\n\nAND\n\n2. Two.");
    expect(jury(t, { answers: { q: true } })).toBe("1. One;\n\n2. Two;\n\nAND\n\n3. Three.");
  });

  it("renders element groups with re-based labels and OR", () => {
    const t = tpl(
      [
        {
          elements: [
            {
              alt: "g",
              or: "[OR]",
              options: [
                { note: "Alt A", elements: [{ n: "1A", text: "Ay", end: ";" }] },
                {
                  note: "Alt B",
                  elements: [
                    { n: "1Bi", text: "Bee one, and", end: "" },
                    { n: "1Bii", text: "Bee two", end: ";" },
                  ],
                },
              ],
            },
            { n: "2", and: "AND", text: "Last", end: "." },
          ],
        },
      ],
      [multiQ("g", "a", "b")],
    );
    expect(renderSource(t)).toEqual([
      "<Alt A>",
      "[1A. Ay;]",
      "[OR]",
      "<Alt B>",
      "[1Bi. Bee one, and",
      "1Bii. Bee two;]",
      "AND",
      "2. Last.",
    ]);
    expect(jury(t, { answers: { g: ["b"] } })).toBe(
      "1. Bee one, and\n\n2. Bee two;\n\nAND\n\n3. Last.",
    );
    expect(jury(t, { answers: { g: ["a", "b"] } })).toBe(
      "1A. Ay;\n\nOR\n\n1Bi. Bee one, and\n\n1Bii. Bee two;\n\nAND\n\n2. Last.",
    );
  });

  it("applies series connectors to whichever items are selected", () => {
    const t = tpl(
      [
        [
          "Terms ",
          {
            any: "m",
            options: [
              ["alpha", { sep: "," }],
              ["beta", { sep: "," }],
              [{ sep: "and" }, " gamma"],
            ],
          },
          ".",
        ],
        ["Either ", { any: "n", options: ["x", "y", [{ sep: "or" }, " z"]] }, "."],
      ],
      [multiQ("m", "a", "b", "c"), multiQ("n", "x", "y", "z")],
    );
    const r = (m: string[], n: string[]) => jury(t, { answers: { m, n } }).split("\n\n");
    expect(r(["a"], ["x"])).toEqual(["Terms alpha.", "Either x."]);
    expect(r(["a", "b"], ["x", "y"])).toEqual(["Terms alpha and beta.", "Either x or y."]);
    expect(r(["a", "b", "c"], ["x", "y", "z"])).toEqual([
      "Terms alpha, beta, and gamma.",
      "Either x or y or z.",
    ]);
  });

  it("computes choices from conditions, rendering nothing when none holds", () => {
    const t = tpl(
      [
        [
          "age ",
          { when: ["!s", "s"], options: [".", ","] },
          " ",
          { opt: "or status", if: "s" },
          " ",
          { when: ["s"], options: ["."] },
        ],
      ],
      [bool("s")],
    );
    expect(jury(t, { answers: { s: false } })).toBe("Age.");
    expect(jury(t, { answers: { s: true } })).toBe("Age, or status.");
  });

  it("binds pronouns, including they/them with agreement", () => {
    const t = tpl([
      [
        { pronoun: "defendant", forms: ["he", "she"] },
        " ",
        { agree: "defendant", sg: "was", pl: "were" },
        " sure of ",
        { pronoun: "defendant", forms: ["himself", "herself"] },
        ".",
      ],
    ]);
    const say = (p: "he" | "she" | "they") => jury(t, { people: { defendant: { pronouns: p } } });
    expect(say("he")).toBe("He was sure of himself.");
    expect(say("she")).toBe("She was sure of herself.");
    expect(say("they")).toBe("They were sure of themselves.");
  });

  it("keeps the space before numbers that start with a period", () => {
    const t = tpl(
      [["a ", { choice: "w", options: ["rifle", ".50 BMG rifle"] }, "."]],
      [choiceQ("w", "r", "bmg")],
    );
    expect(jury(t, { answers: { w: "bmg" } })).toBe("A .50 BMG rifle.");
  });

  it("reports unanswered questions and missing fields instead of guessing", () => {
    const t = tpl(
      [["X ", { choice: "c", options: ["a", "b"] }, " ", { field: "officer.name" }, "."]],
      [choiceQ("c", "a", "b")],
      { officer: { label: "Officer" } },
    );
    const r = render(t, { answers: {}, people: {} });
    expect(r.unanswered).toEqual(["c"]);
    expect(r.missingFields).toEqual(["officer.name"]);
    expect(toPlainText(r)).toBe("X (a/b) ______.");
  });

  it("tags runs with their origin in annotated mode only", () => {
    const t = tpl([["X ", { opt: "y", if: "q" }]], [bool("q")]);
    const input = { answers: { q: true }, people: {} };
    expect(render(t, input, "annotated").blocks[0]!.runs).toEqual([
      { text: "X " },
      { text: "y", origin: { question: "q" } },
    ]);
    expect(render(t, input, "jury").blocks[0]!.runs).toEqual([{ text: "X y" }]);
  });
});

describe("pronouns", () => {
  it("derives they-forms and keeps capitalization", () => {
    expect(theyForm(["his", "her"])).toBe("their");
    expect(theyForm(["His", "Her"])).toBe("Their");
    expect(theyForm(["he", "she", "they"])).toBe("they");
    expect(theyForm(["patrolman", "patrolwoman"])).toBeUndefined();
  });
});

describe("validation", () => {
  it("accepts a well-formed template", () => {
    expect(validateTemplate(tpl([["X ", { opt: "y", if: "q" }]], [bool("q")]))).toEqual([]);
  });
  it("catches semantic errors", () => {
    const issues = validateTemplate(
      tpl(
        [
          [
            { opt: "y", if: "nope" },
            { choice: "c", options: ["a", "b", "c"] },
            { pronoun: "ghost", forms: ["he", "she"] },
            { sep: "or" },
          ],
        ],
        [choiceQ("c", "a", "b"), bool("unused")],
      ),
    ).map((i) => i.message);
    expect(issues).toEqual(
      expect.arrayContaining([
        'condition refers to unknown question "nope"',
        '"c" has 2 options but the node has 3',
        'unknown person role "ghost" (declare it under people)',
        '[or] connector must be inside an "any" node',
        'question "unused" is never used',
      ]),
    );
  });
  it("catches schema errors", () => {
    expect(validateTemplate({ schema: 1, id: "x" }).length).toBeGreaterThan(0);
  });
});
