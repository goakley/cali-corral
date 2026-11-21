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
  | NoteNode;

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

/** Optional (bracketed) content. Source: `[...]`. */
export interface OptNode {
  opt: Inline[] | string;
  if: Condition;
}

/**
 * Pick exactly one alternative. Source: `(a/b/c)`.
 *
 * Either `choice` names a question (type "choice") whose options map to these
 * alternatives by position, or `when` gives one condition per alternative and
 * the first that holds is used (for punctuation and capitalization that
 * follow from other choices, e.g. `(./,)` or `(Y/y)ou`).
 */
export interface ChoiceNode {
  choice?: string;
  when?: Condition[];
  options: (Inline[] | string)[];
}

/**
 * Pick one or more alternatives. Source: `(a/ [or] b/ [or] c)`.
 * Connectors inside options are `sep` nodes.
 */
export interface AnyNode {
  any: string; // question id (type "multi")
  options: (Inline[] | string)[];
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
export interface OptBlock {
  opt: Block[];
  if: Condition;
}

/** A numbered element list. */
export interface ElementsBlock {
  elements: ElementItem[];
  /** Conjunction placed before the last element (default "AND"). */
  conj?: string;
}

/**
 * Labeled alternatives (`<Alternative 2A—...>` followed by `[2. ...]`) are
 * encoded as a note plus an optional element whose condition tests a choice
 * question, so no separate node type is needed.
 */
export type ElementItem = Element | NoteBlock;

export interface Element {
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
  reason?: string;
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
  /** Nesting depth (0 for body paragraphs, 1 for elements). */
  depth: number;
  runs: Run[];
}

export interface Rendered {
  id: string;
  title: string;
  blocks: RenderedBlock[];
  /** Fields that were needed but empty (rendered as a blank). */
  missingFields: string[];
  /** Questions that were needed but unanswered (rendered as source markup). */
  unanswered: string[];
}
