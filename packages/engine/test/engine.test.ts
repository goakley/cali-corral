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

describe("errata", () => {
  const structure = (id: string): NonNullable<Template["errata"]>[number] => ({
    id,
    kind: "structure",
    note: "Closing bracket missing in the official text.",
    status: "confirmed",
  });

  it("leaves out a missing closer in source mode but renders a well-formed tree", () => {
    const t = tpl(
      [["The defendant ", { opt: "willfully", if: "w", unclosed: "e1" }, " acted."]],
      [bool("w")],
    );
    t.errata = [structure("e1")];
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)).toEqual(["The defendant [willfully acted."]);
    const r = render(t, { answers: { w: true }, people: {} });
    expect(toPlainText(r)).toBe("The defendant willfully acted.");
    expect(r.errata).toEqual(["e1"]);
    // Omitted optional text: the erratum no longer applies to the output.
    expect(render(t, { answers: { w: false }, people: {} }).errata).toEqual([]);
  });

  it("leaves out a missing opener on an optional block and an optional element", () => {
    const t = tpl(
      [
        { opt: ["First.", "Second."], if: "a", unopened: "e1" },
        {
          elements: [
            { n: "1", text: "One", end: ";" },
            { n: "2", text: "Two", end: "(;/.)", if: "b", and: "AND", unclosed: "e2" },
          ],
        },
      ],
      [bool("a"), bool("b")],
    );
    t.errata = [structure("e1"), structure("e2")];
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)).toEqual(["First.", "Second.]", "1. One;", "[AND", "2. Two(;/.)"]);
  });

  it("anchors a suspected typo without changing jury text, and reports it on its block", () => {
    const t = tpl([
      "Nothing here.",
      [
        "the crime of ",
        { field: "text.felony", hint: "insert name of felony" },
        { erratum: "e1" },
        "created a risk",
      ],
    ]);
    t.errata = [
      { id: "e1", kind: "spacing", note: "No space before “created”.", status: "confirmed" },
    ];
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)[1]).toBe("the crime of ______ <insert name of felony>created a risk");
    const r = render(t, { answers: {}, people: {}, text: { felony: "robbery" } });
    expect(toPlainText(r)).toBe("Nothing here.\n\nThe crime of robberycreated a risk");
    expect(r.blocks.map((b) => b.errata)).toEqual([undefined, ["e1"]]);
    expect(r.errata).toEqual(["e1"]);
    // Annotated mode carries no empty marker runs.
    const a = render(t, { answers: {}, people: {}, text: { felony: "robbery" } }, "annotated");
    expect(a.blocks[1]!.runs.every((x) => x.text !== "")).toBe(true);
  });

  it("prints stray markup in source mode only", () => {
    const t = tpl([["The defendant acted.", { erratum: "e1", printed: "]" }]]);
    t.errata = [structure("e1")];
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)).toEqual(["The defendant acted.]"]);
    expect(jury(t, {})).toBe("The defendant acted.");
  });

  it("always reports title errata", () => {
    const t = tpl(["Text."]);
    t.errata = [{ id: "e1", kind: "title", note: "TOC says “Material”.", status: "confirmed" }];
    expect(validateTemplate(t)).toEqual([]);
    expect(render(t, { answers: {}, people: {} }).errata).toEqual(["e1"]);
  });

  it("rejects unknown, unanchored, duplicate and mis-kinded errata", () => {
    const t = tpl(
      [
        [
          { opt: "x", if: "a", unclosed: "e1" },
          { erratum: "nope" },
          { erratum: "e2", printed: "]" },
        ],
      ],
      [bool("a")],
    );
    t.errata = [
      { id: "e1", kind: "spacing", note: "n", status: "proposed" },
      { id: "e2", kind: "wording", note: "n", status: "proposed" },
      { id: "e3", kind: "wording", note: "n", status: "proposed" },
      { id: "e3", kind: "title", note: "n", status: "proposed" },
    ];
    const msgs = validateTemplate(t).map((i) => i.message);
    expect(msgs).toContain(`erratum "e1" marks unbalanced markup, so its kind must be "structure"`);
    expect(msgs).toContain(`unknown erratum "nope" (declare it under errata)`);
    expect(msgs).toContain(`erratum "e2" marks unbalanced markup, so its kind must be "structure"`);
    expect(msgs).toContain(`duplicate erratum id "e3"`);
    expect(msgs).toContain(`erratum "e3" is never anchored in the body`);
  });

  it("rejects unbalanced markup on a required element and non-markup stray text", () => {
    const t = tpl([{ elements: [{ n: "1", text: "One", end: ".", unclosed: "e1" }] }]);
    t.errata = [structure("e1")];
    expect(validateTemplate(t).map((i) => i.message)).toContain(
      "only an optional (bracketed) element can have unbalanced brackets",
    );
    const u = tpl([[{ erratum: "e1", printed: "oops" }]]);
    u.errata = [structure("e1")];
    expect(validateTemplate(u).length).toBeGreaterThan(0);
  });
});

describe("related links", () => {
  it("accepts reference, definition and lesser_included links", () => {
    const t = tpl(["Text."]);
    t.related = [
      { id: "2670", kind: "reference", reason: "lawful performance" },
      { id: "2241", kind: "definition", terms: ["driver", "driving"] },
      {
        id: "875",
        kind: "lesser_included",
        bench_note: "• Assault With a Deadly Weapon. Pen. Code, § 245.",
      },
      { id: "100" },
    ];
    expect(validateTemplate(t)).toEqual([]);
  });

  it("rejects links missing their kind-specific fields or pointing at themselves", () => {
    const t = tpl(["Text."]);
    t.related = [
      { id: "2241", kind: "definition" },
      { id: "875", kind: "lesser_included" },
      { id: "100", kind: "reference", terms: ["x"], bench_note: "y" },
      { id: "999" },
    ];
    const msgs = validateTemplate(t).map((i) => i.message);
    expect(msgs).toEqual([
      "a definition link names the terms it defines",
      "a lesser_included link quotes its Bench Notes entry",
      `"terms" belongs on a definition link`,
      `"bench_note" belongs on a lesser_included link`,
      "an instruction can't be related to itself",
    ]);
  });
});

describe("conjunction printed outside an optional element", () => {
  it("prints [AND] on its own line before the element's brackets and renders like [AND]", () => {
    const t = tpl(
      [
        {
          elements: [
            { n: "1", text: "One", end: ";" },
            { n: "2", text: "Two", end: ";" },
            { n: "3", text: "Three", end: ".", if: "c", and: "[AND]", andOutside: true },
          ],
        },
      ],
      [bool("c")],
    );
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)).toEqual(["1. One;", "2. Two;", "[AND]", "[3. Three.]"]);
    expect(jury(t, { answers: { c: true } })).toBe("1. One;\n\n2. Two;\n\nAND\n\n3. Three.");
    expect(jury(t, { answers: { c: false } })).toBe("1. One;\n\n2. Two.");
  });

  it("rejects andOutside on a required element", () => {
    const t = tpl([
      { elements: [{ n: "1", text: "One", end: ".", and: "AND", andOutside: true }] },
    ]);
    expect(validateTemplate(t).map((i) => i.message)).toContain(
      "andOutside needs an optional element with a conjunction",
    );
  });
});

describe("alternative groups with conjunctions and conditions", () => {
  const group = (extra: object) => ({
    alt: "g",
    options: [
      { note: "Alternative 2A—first", elements: [{ n: "2", text: "Two A", end: "(;/.)" }] },
      { note: "Alternative 2B—second", elements: [{ n: "2", text: "Two B", end: "(;/.)" }] },
    ],
    ...extra,
  });

  it("prints a conjunction before a group and ends the list with it when it is last", () => {
    const t = tpl(
      [
        {
          elements: [
            { n: "1", text: "One", end: ";" },
            group({ and: "[AND]" }),
            { n: "3", text: "Three", end: "(;/.)", if: "c", and: "AND" },
          ],
        },
      ],
      [choiceQ("g", "a", "b"), bool("c")],
    );
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)).toEqual([
      "1. One;",
      "[AND]",
      "<Alternative 2A—first>",
      "[2. Two A(;/.)]",
      "<Alternative 2B—second>",
      "[2. Two B(;/.)]",
      "[AND",
      "3. Three(;/.)]",
    ]);
    expect(jury(t, { answers: { g: "b", c: false } })).toBe("1. One;\n\nAND\n\n2. Two B.");
    expect(jury(t, { answers: { g: "a", c: true } })).toBe(
      "1. One;\n\n2. Two A;\n\nAND\n\n3. Three.",
    );
  });

  it("brackets an optional group together with its conjunction", () => {
    const t = tpl(
      [{ elements: [{ n: "1", text: "One", end: "(;/.)" }, group({ and: "AND", if: "o" })] }],
      [choiceQ("g", "a", "b"), bool("o")],
    );
    expect(validateTemplate(t)).toEqual([]);
    expect(renderSource(t)).toEqual([
      "1. One(;/.)",
      "[AND",
      "<Alternative 2A—first>",
      "[2. Two A(;/.)]",
      "<Alternative 2B—second>",
      "[2. Two B(;/.)]]",
    ]);
    expect(jury(t, { answers: { g: "a", o: false } })).toBe("1. One.");
    expect(jury(t, { answers: { g: "a", o: true } })).toBe("1. One;\n\nAND\n\n2. Two A.");
  });
});

describe("linked questions", () => {
  const t = tpl(
    [
      ["Assault with ", { choice: "weapon", options: ["force", "a knife", "a gun"] }, "."],
      [
        "Used ",
        {
          choice: "weapon_1a",
          link: { q: "weapon", map: ["knife", "gun"] },
          options: ["a knife", "a gun"],
        },
        ".",
      ],
    ],
    [choiceQ("weapon", "force", "knife", "gun"), choiceQ("weapon_1a", "knife", "gun")],
  );

  it("takes the answer from the linked question when it maps, without asking", () => {
    expect(validateTemplate(t)).toEqual([]);
    const r = render(t, { answers: { weapon: "gun" }, people: {} });
    expect(toPlainText(r)).toBe("Assault with a gun.\n\nUsed a gun.");
    expect(r.relevant).not.toContain("weapon_1a");
    expect(r.unanswered).toEqual([]);
  });

  it("asks its own question when the linked answer doesn't map", () => {
    const r = render(t, { answers: { weapon: "force" }, people: {} });
    expect(r.unanswered).toEqual(["weapon_1a"]);
    expect(jury(t, { answers: { weapon: "force", weapon_1a: "knife" } })).toBe(
      "Assault with force.\n\nUsed a knife.",
    );
  });

  it("validates the map", () => {
    const u = tpl(
      [[{ choice: "b", link: { q: "a", map: ["x", "nope"] }, options: ["1", "2", "3"] }]],
      [choiceQ("a", "x", "y"), choiceQ("b", "p", "q", "r")],
    );
    const msgs = validateTemplate(u).map((i) => i.message);
    expect(msgs).toContain("link map needs one entry per option");
    expect(msgs).toContain(`question "a" has no option "nope"`);
  });
});

describe("commas around omitted optional text", () => {
  const t = tpl(
    [["Of the crime, ", { opt: "or of the allegation", if: "a" }, ", that person acted."]],
    [bool("a")],
  );
  it("drops the second comma when the optional text between them is left out", () => {
    expect(jury(t, { answers: { a: false } })).toBe("Of the crime, that person acted.");
    expect(jury(t, { answers: { a: true } })).toBe(
      "Of the crime, or of the allegation, that person acted.",
    );
  });
  it("keeps a doubled comma that CALCRIM prints itself", () => {
    expect(jury(tpl(["Odd,, but printed."]), {})).toBe("Odd,, but printed.");
  });
});
