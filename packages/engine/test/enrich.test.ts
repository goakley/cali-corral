/** Tests for the maintainer enrichment heuristics and shared text checks. Fictional data only. */
import { describe, expect, it } from "vitest";
import { render, toPlainText } from "../src/render.ts";
import { renderSource } from "../src/source.ts";
import type { Template } from "../src/types.ts";
import { validateTemplate } from "../src/validate.ts";
import { enrich } from "../scripts/enrich.ts";
import { agreementProblems, pluralVerb } from "./problems.ts";

const SHA = "0".repeat(64);
const skeleton = (
  body: Template["body"],
  questions: NonNullable<Template["questions"]>,
): Template => ({
  schema: 1,
  id: "999",
  title: "Test",
  source: { file: "x", release: "x", revision_line: "x", body_sha256: SHA },
  review: "machine-checked",
  questions,
  body,
});

describe("pluralVerb", () => {
  it.each([
    ["is", "are"],
    ["was", "were"],
    ["has", "have"],
    ["does", "do"],
    ["knows", "know"],
    ["tries", "try"],
    ["watches", "watch"],
    ["Believes", "Believe"],
    ["doesn’t", "don’t"],
  ])("%s → %s", (sg, pl) => expect(pluralVerb(sg)).toBe(pl));
  it.each(["knew", "always", "process", "status", "his", "had", "would"])(
    "%s is not changed",
    (w) => expect(pluralVerb(w)).toBeUndefined(),
  );
});

describe("agreementProblems", () => {
  it("finds singular verbs after they, past adverbs", () => {
    expect(agreementProblems("They actually believes it.")).toHaveLength(1);
    expect(agreementProblems("When they was there")).toHaveLength(1);
    expect(agreementProblems("They knew. They believe it. They always act.")).toEqual([]);
  });
});

describe("enrich", () => {
  const t = skeleton(
    [
      [
        "The defendant",
        { opt: "s", if: "q1" },
        " struck ",
        { field: "text.f1", hint: "insert name of decedent" },
        " in Count ",
        { field: "text.f2" },
        ". When ",
        { pronoun: "defendant", forms: ["he", "she"] },
        " actually knows it, ",
        { choice: "q2", options: ["a knife", "a gun"] },
        " was used.",
      ],
      ["Later ", { choice: "q3", options: ["with a knife", "with a gun"] }, "."],
      ["The crime", { opt: "s", if: "q4" }, " and the crime", { opt: "s", if: "q5" }, "."],
    ],
    [
      { id: "q1", type: "boolean" },
      {
        id: "q2",
        type: "choice",
        options: [
          { id: "o1", label: "a knife" },
          { id: "o2", label: "a gun" },
        ],
      },
      {
        id: "q3",
        type: "choice",
        options: [
          { id: "o1", label: "with a knife" },
          { id: "o2", label: "with a gun" },
        ],
      },
      { id: "q4", type: "boolean" },
      { id: "q5", type: "boolean" },
    ],
  );
  const { t: e, todo } = enrich(t);

  it("keeps the source text identical and the template valid", () => {
    expect(renderSource(e)).toEqual(renderSource(t));
    expect(validateTemplate(JSON.parse(JSON.stringify(e)))).toEqual([]);
  });

  it("binds roles, the count field, plural markers and agreement", () => {
    expect(e.people).toEqual({ decedent: { label: "Decedent", uses: ["name"] } });
    const text = toPlainText(
      render(e, {
        answers: { knife_gun: "o2", crime_plural: true },
        people: { defendant: { pronouns: "they" }, decedent: { name: "Pat Doe" } },
        count: "3",
      }),
    );
    expect(text).toContain(
      "The defendant struck Pat Doe in Count 3. When they actually know it, a gun was used.",
    );
    expect(text).toContain("Later with a gun.");
    expect(text).toContain("The crimes and the crimes.");
    expect(todo.map((x) => x.kind)).toEqual(
      expect.arrayContaining(["role", "agreement", "plural", "merged"]),
    );
  });

  it("merges parallel lists into one question", () => {
    expect(e.questions!.map((q) => q.id).sort()).toEqual(["crime_plural", "knife_gun"]);
  });
});
