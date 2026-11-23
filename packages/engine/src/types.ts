/**
 * Template format v1.
 *
 * A template is authored as YAML (corpus/templates/<number>.yaml) and has the
 * same structure as the compiled JSON. The JSON Schema in
 * `schema/template.schema.json` is the normative definition; these types
 * mirror it.
 */

export const TEMPLATE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Inline content

/** Inline content: literal text or an inline node. */
export type Inline = string | InlineNode;

export type InlineNode =
  | EmNode
  | FieldNode
  | OptNode
  | ChoiceNode
  | AnyNode
  | SepNode
  | PronounNode
  | AgreeNode
  | NoteNode
  | ErratumNode;

/** Emphasized text (italic in the official text). Source: `*text*`. */
export interface EmNode {
  em: Inline[] | string;
}

/**
 * A fill-in blank. Source: `______` followed by ` <hint>` when a hint exists.
 *
 * `field` is a binding path:
 * - `count` — the count number this instruction is given for
 * - `<role>.name` / `<role>.title` / `<role>.agency` — a person bound to a role
 *   declared in `people`
 * - `text.<id>` — free text entered for this instruction
 */
export interface FieldNode {
  field: string;
  hint?: string;
  /** Source shows only the hint, with no drawn blank (rare). */
  noBlank?: true;
}

/**
 * Attributes for markup the official text prints unbalanced. Each names a
 * "structure" erratum. Source mode leaves out the missing bracket or
 * parenthesis so the round trip still matches the official text; jury mode
 * uses the well-formed tree.
 */
export interface Unbalanced {
  /** The official text has no closing bracket/parenthesis here. */
  unclosed?: string;
  /** The official text has no opening bracket/parenthesis here. */
  unopened?: string;
}

/** Optional (bracketed) content. Source: `[...]`. */
export interface OptNode extends Unbalanced {
  opt: Inline[] | string;
  if: Condition;
}

/**
 * Pick exactly one alternative. Source: `(a/b/c)`.
 *
 * Either `choice` names a question (type "choice") whose options map to these
 * alternatives by position, or `when` gives one condition per alternative and
 * the first that holds is used (for punctuation and capitalization that
 * follow from other choices, e.g. `(./,)` or `(Y/y)ou`). If no condition
 * holds, nothing is rendered: used where the punctuation belongs to an
 * omitted optional item, as in `[or socioeconomic status] (./,)`.
 */
export interface ChoiceNode extends Unbalanced {
  choice?: string;
  when?: Condition[];
  options: (Inline[] | string)[];
  /**
   * Printed without parentheses: `a/b`. Used inside brackets for an optional
   * pick-one such as `[grand/petty] theft`.
   */
  bare?: true;
  /**
   * Linked question: when the answer to choice question `q` is one of `map`
   * (map[i] is the option id of `q` that this node's option i corresponds to;
   * "" for none), that option is used and `choice` isn't asked. Otherwise
   * `choice` is asked as usual. Avoids asking the same thing twice when an
   * element repeats a subset of an earlier list.
   */
  link?: { q: string; map: string[] };
}

/**
 * Pick one or more alternatives. Source: `(a/ [or] b/ [or] c)`.
 * Connectors inside options are `sep` nodes.
 */
export interface AnyNode extends Unbalanced {
  any: string; // question id (type "multi")
  options: (Inline[] | string)[];
  /** Printed without parentheses, inside brackets: `[a/[or] b]`. */
  bare?: true;
}

/**
 * A connector inside an `any` option, bracketed in the source: `[or]`, `[and]`,
 * `[,]`, `[and/or]`. Shown according to which options are selected (see the
 * technical design, "Series connectors").
 */
export interface SepNode {
  sep: string;
}

/**
 * A pronoun alternative bound to a person. Source: `(he/she)`, `(his/her)`,
 * `(He/She)`, etc. `forms` are the printed alternatives, masculine first.
 */
export interface PronounNode {
  pronoun: string; // role id, or "defendant"
  /** Printed alternatives: masculine, feminine, and optionally they-form. */
  forms: string[];
  /**
   * Printed without parentheses (`he/she`), as the first option of a larger
   * alternative such as `(he/she/[or] someone else)`.
   */
  bare?: true;
}

/**
 * A word whose form agrees with a person's pronouns. Source prints `sg`
 * (the official text); jury mode prints `pl` when the person uses they/them.
 */
export interface AgreeNode {
  agree: string; // role id
  sg: string;
  pl: string;
  /** The official text prints both forms as alternatives: `(sg/pl)`. */
  alt?: true;
  /**
   * Use the plural form only when this condition also holds — e.g. for
   * "(he/she/[or] someone else) was", only when "someone else" isn't selected
   * (the verb agrees with the nearer subject).
   */
  onlyIf?: Condition;
}

/**
 * Marks where a suspected typo or misprint in the official text sits. It never
 * changes jury text; the app shows the erratum beside the text. `printed` is
 * stray markup the official text prints (e.g. an unmatched `]`): source mode
 * emits it, and jury mode omits it like any other markup.
 */
export interface ErratumNode {
  erratum: string;
  printed?: string;
}

/** A drafter note inside a paragraph. Source: `<text>`. Never rendered to the jury. */
export interface NoteNode {
  note: string;
  governs?: string[];
}

// ---------------------------------------------------------------------------
// Blocks

export type Block =
  | string // a paragraph of plain text (shorthand)
  | Inline[] // a paragraph (shorthand)
  | ParagraphBlock
  | BulletBlock
  | NoteBlock
  | OptBlock
  | ElementsBlock;

export interface ParagraphBlock {
  p: Inline[] | string;
}

/**
 * A bulleted list item. Source: `• ` + content. Dropped in jury mode when its
 * content renders empty (official bullets sit outside the brackets).
 */
export interface BulletBlock {
  bullet: Inline[] | string;
}

/** A drafter note standing as its own paragraph. Source: `<text>`. */
export interface NoteBlock {
  note: string;
  governs?: string[];
}

/** Optional content spanning whole paragraphs. Source: `[` … `]` around them. */
export interface OptBlock extends Unbalanced {
  opt: Block[];
  if: Condition;
}

/** A numbered element list. */
export interface ElementsBlock {
  elements: ElementItem[];
  /** Conjunction placed before the last element (default "AND"). */
  conj?: string;
  /** Numbering: "number" (1., 2., …; default), "alpha" (a., b., …) or "upper" (A., B., …). */
  style?: "number" | "alpha" | "upper";
  /**
   * A numbered list of complete sentences (e.g. verdict-form directions), not
   * elements of a crime: printed end punctuation is kept, and a printed
   * conjunction is shown between included items (never added). Numbering is
   * still computed.
   */
  plain?: true;
}

export type ElementItem = Element | NoteBlock | ElementGroup;

/**
 * Labeled alternative versions of one element position, e.g.
 *
 *   <Alternative 1A—force with weapon>
 *   [1A. ...;]
 *   [OR]
 *   <Alternative 1B—force without weapon>
 *   [1Bi. ..., and
 *   1Bii. ...;]
 *
 * Source prints each alternative's note, then its elements in brackets, with
 * `or` (if any) printed between alternatives. `alt` names a choice question
 * (exactly one alternative) or a multi question (one or more, joined by OR).
 *
 * Jury numbering: the group occupies one element position N. With one
 * alternative selected, its elements are numbered as ordinary consecutive
 * elements. With several, each element keeps its printed label re-based on N
 * ("1A", "1Bi") and the alternatives are separated by the conjunction. When
 * the group is the last position, its final element takes the list's final
 * punctuation and the group's printed conjunction goes before it.
 */
export interface ElementGroup extends Unbalanced {
  alt: string;
  or?: string;
  options: ElementAlternative[];
  /** Conjunction printed before the group, as for an element. */
  and?: string;
  /** Conjunction printed as its own line before the group's brackets. */
  andOutside?: true;
  /** The whole group is optional: source wraps conjunction + group in brackets. */
  if?: Condition;
}

export interface ElementAlternative extends Unbalanced {
  note?: string;
  elements: Element[];
}

export interface Element extends Unbalanced {
  /** Printed element number in the official text, e.g. "4" or "2A". */
  n: string;
  text: Inline[] | string;
  /**
   * End punctuation as printed: ";", ".", "(;/.)", ":" or "" (none).
   * Jury mode computes the actual punctuation; tests check it is one the
   * printed form allows.
   */
  end: string;
  /**
   * The conjunction paragraph printed before this element, as printed:
   * "AND", "[AND]", "OR", "[OR]". For an optional element it is printed inside
   * the element's brackets.
   */
  and?: string;
  /**
   * For an optional element: the conjunction is printed as its own bracketed
   * line before the element's brackets (`[AND]` then `[3. …]`) rather than
   * inside them (`[AND` … `3. …]`). Rendering is the same.
   */
  andOutside?: true;
  /**
   * A drafter note printed after the conjunction line and before the element
   * ("[AND]", "<Give element 5 when …>", "[5. …]"). Never rendered.
   */
  note?: string;
  /** Element is optional; source wraps conjunction + element in brackets. */
  if?: Condition;
}

// ---------------------------------------------------------------------------
// Conditions: a small expression language.
//
//   felony              boolean question is true
//   !felony             negation
//   victim=firefighter  choice question equals option id
//   defenses~self       multi question includes option id
//   terms>1             multi question has more than N options selected
//   a & b, a | b, ( )   conjunction, disjunction, grouping
//   @multiple_defendants  built-in flag (always false in v1: single defendant)
export type Condition = string;

// ---------------------------------------------------------------------------
// Questions and people

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionBase {
  id: string;
  prompt?: string;
  /** Ids of notes (or verbatim note text) shown next to the question. */
  help?: string;
}

export interface BooleanQuestion extends QuestionBase {
  type: "boolean";
}

export interface ChoiceQuestion extends QuestionBase {
  type: "choice";
  options: QuestionOption[];
  /**
   * For an `(a/an)` choice: the field whose value follows the article. The
   * engine suggests "a" or "an" from it; the user can override.
   */
  articleFor?: string;
}

export interface MultiQuestion extends QuestionBase {
  type: "multi";
  options: QuestionOption[];
}

export type Question = BooleanQuestion | ChoiceQuestion | MultiQuestion;

export interface PersonRole {
  label: string;
  /** Fields the template uses for this person. */
  uses?: ("name" | "title" | "agency")[];
}

export interface Related {
  id: string;
  /**
   * - reference: the text or Bench Notes point to the instruction (2652 → 2670)
   * - definition: this instruction relies on it to define `terms` (2110 → 2241)
   * - lesser_included: it covers an offense listed in this instruction's
   *   LESSER INCLUDED OFFENSES Bench Notes (`bench_note`, verbatim)
   */
  kind?: "reference" | "definition" | "lesser_included";
  reason?: string;
  terms?: string[];
  bench_note?: string;
}

/**
 * A suspected typo or misprint in the official text, recorded and shown to the
 * user, never corrected (attorney review, 2026-11-22).
 */
export interface Erratum {
  id: string;
  kind: "spacing" | "punctuation" | "wording" | "structure" | "title" | "other";
  /** What CALCRIM prints and what it probably meant. */
  note: string;
  /** Where it was confirmed, e.g. "calcrim-2026 p. 1925". */
  evidence?: string;
  /** proposed: flagged by tooling; confirmed: a maintainer checked the PDF. */
  status: "proposed" | "confirmed";
}

export interface TemplateSource {
  /** Extracted record this template was encoded from. */
  file: string;
  release: string;
  revision_line: string;
  /** SHA-256 of the normalized body (paragraphs joined by "\n"). */
  body_sha256: string;
}

export interface Template {
  schema: number;
  id: string;
  title: string;
  source: TemplateSource;
  review: "machine-checked" | "reviewed";
  people?: Record<string, PersonRole>;
  questions?: Question[];
  related?: Related[];
  errata?: Erratum[];
  body: Block[];
}

// ---------------------------------------------------------------------------
// Render input

export type Pronouns = "he" | "she" | "they";

export interface Person {
  name?: string;
  title?: string;
  agency?: string;
  pronouns?: Pronouns;
}

export type Answer = boolean | string | string[];

export interface RenderInput {
  answers: Record<string, Answer>;
  /** People bound to the template's roles; "defendant" is always available. */
  people: Record<string, Person>;
  /** Count number for `count` fields. */
  count?: string;
  /** Free-text fields (`text.<id>`). */
  text?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Render output

export interface Origin {
  /** Question id that produced this text, if any. */
  question?: string;
  /** Field binding that produced this text, if any. */
  field?: string;
  /** Person role for pronoun/agreement text. */
  person?: string;
  /** Erratum anchored here (internal marker; collected into `errata`). */
  erratum?: string;
  /** Optional text was left out here (internal marker; never output). */
  gap?: true;
}

export interface Run {
  text: string;
  em?: true;
  origin?: Origin;
}

export interface RenderedBlock {
  kind: "p" | "bullet" | "element" | "conj";
  /** Element number in the rendered list (jury numbering). */
  number?: number;
  /** Element label when it differs from the number, e.g. "1A" or "1Bi". */
  label?: string;
  /** Nesting depth (0 for body paragraphs, 1 for elements). */
  depth: number;
  runs: Run[];
  /** Errata anchored in this block, for display beside it. */
  errata?: string[];
}

export interface Rendered {
  id: string;
  title: string;
  blocks: RenderedBlock[];
  /** Fields that were needed but empty (rendered as a blank). */
  missingFields: string[];
  /** Questions that were needed but unanswered (rendered as source markup). */
  unanswered: string[];
  /** Errata that apply to the rendered text (plus title errata), in template order. */
  errata: string[];
}
