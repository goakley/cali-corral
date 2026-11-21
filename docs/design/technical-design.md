# Cali Corral — Technical Design (Phase 0)

Status: draft for owner review, 2026-11-20. Covers Phase 0 deliverable 1. Decisions with lasting effect have ADRs in `docs/decisions/`.

Contents:

1. Stack and repo layout
2. Source text: fetching, extraction, record format
3. Normalization rules (canonical source text)
4. Template format v1
5. Rendering engine
6. Verification
7. Case file format v1
8. Freshness manifest v1
9. Local override patch format v1
10. Submission relay API v1 (contract only)
11. Versioning and migration
12. Interpretations of CALCRIM markup that need attorney review

---

## 1. Stack and repo layout

One monorepo for code, templates, extracted text and tooling (ADR 0001), default branch `master`.

| Part | Technology | Why |
| --- | --- | --- |
| Rendering engine | TypeScript (strict), no UI or Node dependencies in `src/` except `yaml` and `ajv` for loading/validation | Same code runs in CI and the browser |
| Tests | Vitest, fast-check | Property tests need a generator library |
| Templates | YAML in `corpus/templates/<number>.yaml`, JSON Schema 2020-12 validated with ajv | Readable diffs for reviewers; schema is normative (ADR 0003) |
| Extraction (maintainer only) | Python 3.12, pdfplumber/pdfminer.six (MIT), uv, pytest, ruff | Best-in-class PDF layout access with permissive licenses (ADR 0006) |
| CI | GitHub Actions: lint, typecheck, schema, round-trip, property, golden; Python lint and unit tests | |

Node 26 runs TypeScript directly (type stripping), so maintainer scripts need no build step.

```
.
├── CLAUDE.md
├── corpus/
│   ├── release.json            # which extracted release templates are checked against
│   └── templates/<n>.yaml      # authored templates (CC0 structure; JCC text)
├── data/extracted/<release>/   # committed: one JSON record per instruction, plus
│   ├── <n>.json                #   index.json, sources.json, report.json, markup-scan.json
├── docs/                       # spec, phase briefs, ADRs, design, questions
├── packages/engine/
│   ├── schema/template.schema.json
│   ├── src/                    # engine (types, condition, source, render, validate, ...)
│   ├── scripts/                # stamp, candidates, autodraft (maintainer tools)
│   └── test/                   # unit, round-trip, property, golden tests
├── tests/golden/               # attorney-approved goldens; candidates/ for review
└── tools/extract/              # Python extraction CLI (calcrim-extract)
```

Phase 1 adds `packages/app` (PWA) and `packages/relay`. The app will import compiled template JSON, not YAML, so `yaml` and `ajv` stay out of the shipped bundle (engine core is well under 100 KB minified without them).

## 2. Source text

### 2.1 Fetching (`calcrim-extract download`)

- Sources are listed in `tools/extract/sources.json`: the most recent full edition plus every later supplement (currently the 2026 edition, adopted February 2026, and the October 2026 supplement).
- Each request is sequential with at least 3 s between requests, conditional (ETag / If-Modified-Since against `.cache/sources/*.meta.json`) and identified: `CaliCorral-extract/<version> (open-source CALCRIM drafting tool; contact: $CALI_CORRAL_CONTACT)`. The tool refuses to fetch if `CALI_CORRAL_CONTACT` is unset.
- PDFs stay in `.cache/` (gitignored, ADR 0002); `data/extracted/<release>/sources.json` records URL and SHA-256 of each.
- `calcrim-extract extract` works only from the cache (no network); `all` refreshes first.

### 2.2 Extraction pipeline

1. **Layout** (`layout.py`). pdfplumber characters are grouped into baseline rows and re-assembled into *spans* carrying style (bold, italic, size, font). Two things plain text extraction gets wrong are handled here:
   - *Invisible text.* Both official PDFs carry invisible text layers (text render mode 3): an OCR layer in the edition and a tagged accessibility layer in the supplement that duplicates every glyph. pdfminer doesn't expose the render mode, so the tool patches `PDFLayoutAnalyzer.render_string` to drop mode-3 text.
   - *Drawn blanks.* Fill-in blanks are horizontal rules at the baseline, not characters. Rules on a text row (and shorter than a full-width separator) become explicit blank spans.
   The result is cached per PDF hash as JSON Lines (`.cache/layout/`), since parsing 2,700 pages takes ~5 minutes.
2. **Segmentation** (`segment.py`). Typography identifies structure: titles are Helvetica-Bold ~12 pt `<number>. <title>`; section headings are Helvetica-Bold uppercase (BENCH NOTES, AUTHORITY, LESSER INCLUDED OFFENSES, RELATED ISSUES, COMMENTARY, SECONDARY SOURCES); running headers sit above y = 50 and page numbers below y = 645; the revision line is italic 11 pt starting "New/Revised/…". **SECONDARY SOURCES is publisher material and is discarded** (non-negotiable 8).
3. **Paragraphs.** Within a page, a vertical gap above 14.5 pt starts a paragraph (line pitch is 13–13.5 pt; paragraph gaps are ≥ 15 pt, measured across the corpus). Across a page break, the paragraph continues unless the previous line was deliberately short (the next line's first word would have fit), the new line is dedented, or a new element/note/bracket begins after terminal punctuation.
4. **Normalization** (§3) produces one canonical string per paragraph.
5. **Reconciliation.** Tables of contents are parsed (edition: per-series and per-volume TOCs; supplement: its contents list with "(new)/(revised)") and compared with extracted titles. Reserved numbers are recorded separately.
6. **Merge.** Files are applied in order; a later file supersedes an earlier one instruction by instruction (`supersedes` and `supplement_status` record what happened).

### 2.3 Extracted record format v1 (`data/extracted/<release>/<n>.json`)

```json
{
  "record_version": 1,
  "extractor_version": "0.1.0",
  "number": "945",
  "title": "Battery Against Peace Officer (Pen. Code, §§ 242, 243(b), (c)(2))",
  "source": { "file": "calcrim-2026", "url": "…", "sha256": "…", "release": "…", "pages": [752, 755] },
  "revision_line": "New January 2006; Revised August 2006, …, February 2025",
  "revision_legend": null,
  "body": ["The defendant is charged [in Count ______] with …", "…"],
  "body_indents": [0.0, 0.0, 19.0],
  "bench_notes": {
    "bench_notes": [{ "heading": true, "text": "Instructional Duty" }, { "text": "The court has a *sua sponte* duty …" }],
    "authority": [], "lesser_included_offenses": [], "related_issues": [], "commentary": []
  },
  "excluded": { "secondary_sources_lines": 8 },
  "warnings": [],
  "supplement_status": "revised",
  "supersedes": { "file": "calcrim-2026", "revision_line": "…" }
}
```

`body` is the round-trip target. Bench Notes keep paragraph structure and headings but are not round-tripped (they are displayed, not rendered into instructions).

## 3. Normalization rules (canonical source text)

Implemented in `tools/extract/src/calcrim_extract/normalize.py`; the spacing rules are mirrored by `packages/engine/src/text.ts` (`canonicalSource`) and applied to source-mode output, so template authors don't need to reproduce layout accidents. ADR 0004 records the format.

Canonical text conventions, one string per paragraph:

| Notation | Meaning |
| --- | --- |
| `______` | a drawn fill-in blank (exactly six underscores) |
| `<…>` | drafter note or insert hint (italic officially; no other marking) |
| `*…*` | emphasis: italic text outside notes (defined terms such as *willfully*) |
| everything else | literal, including `[ ] ( ) /` |

Rules, in order:

1. **Glyphs.** Ligatures ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ are expanded. The edition's italic "fi" ligature extracts as `f` + dotless ı (U+0131); `fı` → `fi`. No-break space → space; soft hyphen removed. Unicode NFC. Curly quotes, apostrophes, dashes and § are kept exactly as published.
2. **Line joins.** Lines of a paragraph join with one space, except after `/`, `—` or `–` (no space). A line-end hyphen is kept and joined without a space: instruction text is typeset without hyphenation (every line-end hyphen in the corpus is a real compound such as "self-defense"). In Bench Notes only, a line-end hyphen is dropped when the joined word appears unhyphenated elsewhere in the corpus and never hyphenated (one case in the whole corpus: "Institu-tion").
3. **Spacing.** Whitespace runs collapse to one space. A space just after `[` or `(` is a glyph-gap artifact (`[ or]`): if the character before the bracket isn't a space, slash or another opener, the space moves before the bracket (`charged[ in` → `charged [in`); otherwise it is dropped. Spaces after `/` are not significant (officially both `a/ [or] b` and `a/[or] b` occur, sometimes only because of a line break) and are removed. Blank runs become exactly `______`; exactly one space separates a blank from its `<hint>`; a space between a blank and following `. , ; : ) ]` is a layout gap and is removed. A space before a closing bracket is kept (`[As used here, ](M/m)atter` needs it).
4. **Emphasis.** Italic runs become `*…*` only outside notes. A run that reaches a `<` closes before it and reopens after the `>` if it continues; emitted markers are always balanced. Emphasis never spans markup characters `[ ] ( ) /` (it is split around them), whitespace is moved outside, and emphasis covering only punctuation is dropped. The corpus contains no literal asterisks in instruction text (checked), so `*` is unambiguous there. Revision lines are not emphasized (they are wholly italic and the supplement uses a literal `*`).
5. **Character audit.** Characters outside the expected repertoire are reported per instruction (none in the 2026-10 corpus).

## 4. Template format v1

Normative definition: `packages/engine/schema/template.schema.json` (JSON Schema 2020-12). TypeScript mirror: `packages/engine/src/types.ts`. Semantic rules the schema can't express are enforced by `validateTemplate` (§6.1). YAML is only a friendlier spelling of the JSON (no tags or anchors).

### 4.1 Top level

```yaml
schema: 1
id: "945"
title: "Battery Against Peace Officer (Pen. Code, §§ 242, 243(b), (c)(2))"
source:
  file: calcrim-2026          # extracted record's source file key
  release: "2026-10"
  revision_line: "New January 2006; Revised …"
  body_sha256: "…"            # SHA-256 of the normalized body joined by "\n"
review: machine-checked       # or: reviewed
people:                       # roles besides the always-present "defendant"
  officer: { label: "Peace officer", uses: [name, title, agency] }
related:                      # suggestions shown in the picker
  - { id: "2670", reason: "…" }
questions: [...]
body: [...]                   # blocks
```

The maintainer helper `pnpm --filter @cali-corral/engine stamp <n>` fills `body_sha256` only if the template already round-trips.

### 4.2 Questions

```yaml
- { id: felony, type: boolean, prompt: "…" }
- id: officer_article
  type: choice                       # exactly one
  articleFor: officer.title          # optional: suggest a/an from this field
  options: [{ id: a, label: "a" }, { id: an, label: "an" }]
- id: defense_kind
  type: multi                        # one or more
  options: [{ id: self, label: "self-defense" }, { id: other, label: "defense of someone else" }]
```

Question ids are the stable contract with saved case files (§11). Every question must be used; every reference must resolve. Whether a question is *relevant* is computed, not declared: a question is relevant when rendering consults it under the current answers (`render(...).relevant`), so dependent questions appear and disappear automatically.

### 4.3 Conditions

A small expression language used by `if`, `when` and `onlyIf`:

| Form | True when |
| --- | --- |
| `q` | boolean question `q` is answered yes |
| `q=opt` | choice question `q` is answered `opt` |
| `q~opt` | multi question `q` includes `opt` |
| `q>n` | multi question `q` has more than `n` options selected |
| `!a`, `a & b`, `a \| b`, `( )` | negation, conjunction, disjunction, grouping |
| `@multiple_defendants` | built-in flag; always false in v1 (single defendant) |

Unanswered questions make atoms false and are reported as unanswered.

### 4.4 Inline nodes

| Node | Source form | Jury form |
| --- | --- | --- |
| `"text"` | literal | literal |
| `{em: …}` | `*…*` | emphasized run |
| `{field: officer.name, hint: "…"}` | `______ <hint>` (or `______`; `noBlank` → `<hint>`) | the value; missing → `______` and reported |
| `{opt: …, if: cond}` | `[…]` | content if `cond` |
| `{choice: q, options: […]}` | `(a/b/c)`; `bare: true` → `a/b` | option matching the answer (by position) |
| `{when: [c1, c2…], options: […]}` | `(a/b)` | first option whose condition holds; none → nothing |
| `{any: q, options: […]}` | `(a/[or] b)` | selected options with series punctuation (§5.4) |
| `{sep: "or"}` (inside `any`) | `[or]` | placed by the series rule |
| `{pronoun: role, forms: [he, she(, they)]}` | `(he/she)`; `bare` → `he/she` | the person's pronoun (§5.3) |
| `{agree: role, sg, pl, alt?, onlyIf?}` | `sg`, or `(sg/pl)` with `alt` | `pl` when the person uses they/them (and `onlyIf` holds) |
| `{note: "…", governs?: [q]}` | `<…>` | nothing |

Field bindings: `count`, `text.<id>` (free text), `<role>.name|title|agency`.

### 4.5 Blocks

| Block | Source form | Notes |
| --- | --- | --- |
| `"text"` / `[inline…]` / `{p: …}` | one paragraph | |
| `{bullet: …}` | `• …` | dropped in jury mode when its content is empty (official bullets sit outside the brackets) |
| `{note: "…", governs?: […]}` | `<…>` paragraph | shown beside the governed questions |
| `{opt: [blocks], if}` | `[` before the first paragraph, `]` after the last | brackets spanning paragraphs |
| `{elements: [...], conj?, style?, plain?}` | numbered paragraphs | §4.6 |

### 4.6 Element lists

```yaml
- elements:
    - { n: "1", text: [...], end: ";" }
    - { n: "3", and: "[AND]", text: [...], end: "(;/.)" }
    - { note: "Give element 4 when …", governs: [felony] }
    - { n: "4", if: felony, and: "AND", text: [...], end: "(;/.)" }   # source: "[AND" / "4. …(;/.)]"
    - alt: theory              # labeled alternatives for one element position
      or: "[OR]"
      options:
        - { note: "Alternative 1A—force with weapon", elements: [{ n: "1A", … }] }
        - { note: "Alternative 1B—force without weapon", elements: [{ n: "1Bi", … }, { n: "1Bii", … }] }
```

- `n` is the printed label (`1`, `1A`, `(4/5)`, `a`); jury numbering is computed.
- `end` is the printed end punctuation (`;`, `.`, `(;/.)`, `:` or none); `and` the printed conjunction paragraph (`AND`, `[AND]`, `OR`, `[OR]`). For an optional element the conjunction prints inside its brackets.
- `conj` sets the list's conjunction (default `AND`); `style: alpha` letters a sub-list; `plain: true` marks a numbered list of complete sentences (verdict-form directions) whose printed punctuation is kept and which gets no conjunction.

## 5. Rendering engine

### 5.1 API (`@cali-corral/engine`)

```ts
renderSource(t: Template): string[]                      // source mode, canonicalized
render(t: Template, input: RenderInput, mode?: "jury" | "annotated"): RenderResult
toPlainText(r: Rendered, opts?: { title?: boolean }): string
validateTemplate(json: unknown): ValidationIssue[]       // schema + semantics
parseTemplateYaml(text: string): Template
suggestAnswers(t: Template, input: RenderInput): Record<string, Answer>  // e.g. a/an
```

`RenderInput` is `{ answers, people: { [role]: { name, title, agency, pronouns } }, count?, text? }`. `RenderResult` has `blocks` (kind `p` / `bullet` / `element` / `conj`, with `number`, `label`, `depth` and `runs`), plus `missingFields`, `unanswered` and `relevant`. Unanswered choices render as their source markup and missing fields as `______`, so a preview never hides a gap and property tests catch any.

Annotated mode returns the same text with each run tagged `{question}`, `{field}` or `{person}` for highlighting and click-to-question in the preview. Rendering is a pure function: the property tests assert determinism and that jury and annotated text are identical.

### 5.2 Question and answer model

Answers are `boolean` (boolean questions), an option id (choice) or an array of option ids in any order (multi; rendered in template order). Case facts (people, count, free text) are not answers; they come from the case model and are bound to template roles per instruction (§7).

### 5.3 Pronoun binding and agreement

A pronoun node renders the bound person's pronoun: `he` → first form, `she` → second, `they` → a printed third form if present (`(he/she/they)`), else derived: he/she → they, him/her → them, his/her → their, his/hers → theirs, himself/herself → themselves (capitalization preserved). Validation rejects pronoun nodes whose they-form can't be derived. Verbs that must change for they/them are annotated with `agree` nodes (`(he/she) was` → `they were`); `onlyIf` handles "(he/she/[or] someone else) was", which stays singular when another subject is selected. A property check flags "they is/was/has/does".

### 5.4 Element lists, separators and "AND"

- Included positions are the elements whose `if` holds plus groups with at least one selected alternative. They are numbered 1…n.
- An end of `;`, `.` or `(;/.)` becomes `;` on every position but the last and `.` on the last; other printed ends are kept.
- The conjunction paragraph goes before the last position when there are at least two.
- Groups: with one alternative selected, its elements are numbered as ordinary consecutive elements; with several, each element keeps its printed label re-based on the group's number (`1A`, `1Bi`) and alternatives are separated by the group's conjunction. Groups can't be last (validated).
- Series connectors in `any` nodes (§12, item 1): the conjunction precedes the last selected item when the node has comma connectors (commas after each non-last item when three or more are selected) and precedes every non-first item otherwise.

### 5.5 Jury text cleanup

Spaces left by omitted content are collapsed; no space is kept before `. , ; : ) ] ? ! ” ’` (except a period starting a number, ".50 BMG") or after `( [ “ ‘ /`; paragraphs are trimmed; the first letter of every paragraph and element is capitalized (§12, item 2). Paragraphs with no letters or digits left are dropped.

## 6. Verification

1. **Validation**: JSON Schema, then semantics: unique ids; every reference resolves; condition syntax and types (`q=opt` on choice questions, etc.); option counts match; connectors only inside `any`; derivable they-forms; declared roles; groups never last; unused questions rejected.
2. **Round-trip** (`test/roundtrip.test.ts`): `renderSource(t)` equals the extracted body exactly; title, source file, revision line and `body_sha256` match the record.
3. **Property tests** (`test/property.test.ts`): 500 random answer sets per template (fixed seed, fictional data, random he/she/they), each checked for leftover `[ ] < >`, slash alternatives or choices, blanks, `*`; doubled spaces or punctuation; space before punctuation; letter directly before `.5`-style numbers; every block starting with a capital; every element list ending with `.` (or `:` introducing a sub-list); no unanswered questions or missing fields; they/them agreement; determinism. Plus **markup consistency**: every computed `;`/`.` and AND placement must be one the printed markup allows (`;` never last, `.` always last, an unbracketed `AND` on a required element only when it is last, every last element having a printed conjunction).
4. **Goldens** (`test/golden.test.ts`): approved renders in `tests/golden/<n>/<case>.{input.json,txt}` must match exactly. `pnpm --filter @cali-corral/engine candidates` writes minimal, maximal and mixed candidates to `tests/golden/candidates/` with a `REVIEW.md` for attorneys (including review notes such as paragraphs lacking closing punctuation). Candidates are never promoted automatically; the test also checks candidates are current.
5. **Extraction unit tests** (pytest) cover normalization and segmentation rules.

## 7. Case file format v1

A case file is UTF-8 JSON, saved and opened as a real file (`.calcorral.json`), optionally encrypted. Browser storage holds a working copy only.

```json
{
  "format": "cali-corral/case",
  "version": 1,
  "id": "9b2f…",                       // random UUID
  "created_at": "2026-11-20T18:00:00Z",
  "updated_at": "2026-11-20T19:30:00Z",
  "app_version": "1.0.0",
  "corpus": { "release": "2026-10", "corpus_version": "2026-10.4" },
  "caption": null,                      // asked only at export:
  // { "court": "…", "case_number": "…", "title": "People v. …", "proposing_party": "Defendant" }
  "people": {
    "p1": { "name": "Avery Example", "pronouns": "they" },
    "p2": { "name": "Jordan Sample", "title": "deputy sheriff", "agency": "…", "pronouns": "she", "doe": false }
  },
  "defendant": "p1",
  "counts": [{ "id": "c1", "number": "1", "charge": "Pen. Code, § 243(b)" }],
  "instructions": [
    {
      "uid": "i-1", "id": "945",
      "template_hash": "sha256 of compiled template JSON",
      "source_revision": "New January 2006; Revised … February 2025",
      "count": "c1",
      "bindings": { "officer": "p2" },
      "answers": { "felony": true, "defense_kind": ["self"] },
      "text": { "duties": "…" },
      "status": "in_progress",          // derived but cached: complete | in_progress
      "edit": null,                     // { "base_text_sha256": "…", "text": "…", "citations": ["…"] }
      "override": null                  // id of a local override applied (§9)
    }
  ],
  "special_instructions": [{ "uid": "s-1", "title": "…", "text": "…", "citations": ["…"] }],
  "order": ["i-1", "s-1"]
}
```

- People are entered once and bound per instruction (`bindings`); `doe: true` marks protected names (rendered as entered, e.g. "Jane Doe").
- `edit` stores the user's hand-edited plain text and the hash of the generated text it was based on, so the app can show a diff and the "modified" flag; when present, the app flags a possible special instruction (rule 2.1055) and asks for citations.
- Unknown fields are preserved on save (forward compatibility).
- Encrypted envelope (WebCrypto): `{ "format": "cali-corral/case-encrypted", "version": 1, "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<b64>" }, "cipher": { "name": "AES-GCM", "iv": "<b64>" }, "ciphertext": "<b64 of the JSON above>" }`. A wrong passphrase fails authentication; there is no recovery.

## 8. Freshness manifest v1

Served from the app's origin at a stable URL (`/corpus/manifest.json`) with a short cache lifetime, plus a detached signature (`manifest.json.sig`).

```json
{
  "format": "cali-corral/manifest",
  "version": 1,
  "corpus_version": "2026-10.4",
  "published_at": "2026-11-20T18:00:00Z",
  "source_release": {
    "id": "2026-10",
    "label": "CALCRIM 2026 edition with October 2026 supplement",
    "files": [{ "url": "https://courts.ca.gov/…/calcrim-2026.pdf", "sha256": "…" }]
  },
  "expected_next_release": { "meeting": "2027-02", "warn_after": "2027-03-31" },
  "engine": { "template_schema": 1, "min_app_version": "1.0.0" },
  "instructions": [
    {
      "number": "945",
      "title": "Battery Against Peace Officer (Pen. Code, §§ 242, 243(b), (c)(2))",
      "status": "current",              // current | superseded | revoked | not_encoded | reserved
      "review": "machine-checked",      // machine-checked | reviewed
      "open_flags": 0,
      "source_revision": "New January 2006; Revised … February 2025",
      "body_sha256": "…",               // official text hash: detects text-only changes precisely
      "template_hash": "…",
      "file": "t/945.3f9c1a.json"       // content-hashed compiled template
    }
  ],
  "flags_file": "flags.8a1b.json",
  "pending_fixes_file": "pending.77c2.json"
}
```

Signature: Ed25519 over the exact manifest bytes (minisign-compatible), verified in the app with WebCrypto; the app ships a small list of trusted public keys to allow rotation. Template files are covered transitively by `template_hash`. (Sigstore was considered; it needs online verification infrastructure that doesn't fit an offline PWA. Final choice in Phase 1.)

Status rules (spec §7): if `body_sha256` of a newer release differs from the encoded template's, the instruction is `superseded` and export is blocked until the user overrides; a supplement revision marked as bench-notes-only (the supplement's `*` legend) leaves `body_sha256` unchanged, so the instruction stays current. Offline, the app compares its corpus date with `expected_next_release.warn_after`.

## 9. Local override patch format v1

A local fix to a template, stored in the browser and exportable:

```json
{
  "format": "cali-corral/override",
  "version": 1,
  "id": "o-…",
  "instruction": "945",
  "base_template_hash": "…",
  "created_at": "…",
  "patch": [{ "op": "replace", "path": "/body/3/0", "value": "…" }],
  "note": "Element 2 should also offer …",
  "upstream": { "report_id": null, "status": null }
}
```

- `patch` is RFC 6902 JSON Patch against the compiled template JSON. It applies only when `base_template_hash` matches the installed template; the result must pass `validateTemplate` and the round-trip check against the installed extracted text before it is used. (Overrides that intentionally diverge from the official text, e.g. user-edited wording, belong in the case file's `edit`, not here.)
- When the upstream template changes, the app offers: keep mine (re-base if the patch still applies), switch to upstream, or compare.
- The same patch body is what "Propose the fix" sends to the relay.

## 10. Submission relay API v1 (contract only)

Same-origin JSON over HTTPS; written against the Fetch API; GitHub is an implementation detail behind it. Requests never contain rendered text or case data: the schemas below have no field that could hold them, and the relay rejects unknown fields.

| Method and path | Body | Success |
| --- | --- | --- |
| `GET /api/v1/challenge` | — | `200 { algorithm, challenge, salt, signature, maxnumber }` (ALTCHA proof of work) |
| `POST /api/v1/flags` | `{ instruction, template_hash, corpus_version, category: "wording" \| "missing_option" \| "wrong_condition" \| "other", note, contact_email?, pow }` | `201 { report_id }` |
| `POST /api/v1/fixes` | `{ instruction, base_template_hash, corpus_version, patch, note, contact_email?, pow }` | `201 { report_id }` |
| `POST /api/v1/encoding-requests` | `{ instruction, corpus_version, note?, pow }` | `201 { report_id }` |
| `GET /api/v1/reports/{report_id}` | — | `200 { report_id, status: "open" \| "fixed" \| "declined", url? }` |

Limits: body ≤ 64 KB, `note` ≤ 4,000 characters, `patch` ≤ 200 operations. Errors: `400` schema, `403` bad proof of work, `413` too large, `422` patch doesn't apply or fails validation, `429` rate limited (`Retry-After`). Fixes that pass automated checks appear in `pending_fixes_file`; report status is also published in `flags_file`, so the app can poll without calling the relay.

## 11. Versioning and migration

- **Template schema** (`schema: 1`). The engine declares the schema versions it supports; the manifest says which one a corpus uses. Because all templates live in this repo, a breaking schema change ships with a migration script and a single PR converting every template, and bumps `schema`.
- **Question ids** are the contract with saved answers. Changing a question's meaning requires a new id; removed questions are dropped from answers with a notice; new questions start unanswered so the instruction shows as incomplete. A future `aliases` field can map renamed ids.
- **Case files** carry `version`; the app runs an ordered chain of migrations (v1→v2→…) on open and never deletes unknown fields. Each instruction records `template_hash` and `source_revision`, so after a corpus update the app can show which instructions changed and the before/after text.
- **Extracted records** carry `record_version`; the layout cache is versioned (`layout-v1-…`). Extraction is reproducible from the PDF hashes in `sources.json`.
- **Corpus version** is `<release>.<n>`, incremented on every published change.

## 12. Interpretations of CALCRIM markup that need attorney review

Rendering must produce text the official markup allows. In a few places the markup underdetermines the result, and the engine applies a rule (ADR 0005). Each should be confirmed by a practicing attorney before Gate 0:

1. **Series connectors.** `[,]`, `[or]`, `[and]` are treated as punctuation for whichever items are kept, not as tied to the item they are printed beside (`[and]` is often printed only before the last item). Without comma connectors, the conjunction repeats ("A or B or C").
2. **Capitalization.** The first letter of every paragraph and element is capitalized, so a lowercase alternative chosen first reads correctly ("Defense of another is a defense to …").
3. **AND inside an optional element** (`[AND` / `4. …]`) is used only when that element is last, like `[AND]`.
4. **Alternative groups**: numbering as described in §5.4 (with only 1B chosen, its two parts become elements 1 and 2).
5. **Computed punctuation with nothing selected**: `[or socioeconomic status] (./,)` renders no punctuation when the item is omitted.
6. **Pronoun they-forms**, especially "themselves" for one person (QUESTIONS.md Q3).
7. **Literal faithfulness where the official text has a flaw** (missing space in 2670, sentence ending inside an optional bracket in 3517, repeated "or" in 200): reproduced as printed, flagged in the review notes.
