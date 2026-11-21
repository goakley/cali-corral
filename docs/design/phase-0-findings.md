# Phase 0 Findings

2026-11-20 · Source: CALCRIM 2026 edition (Judicial Council, February 2026) plus the October 2026 supplement, both from courts.ca.gov.

## Summary

- **Extraction works end to end on the whole corpus.** 780 of 780 edition instructions and 29 of 29 supplement instructions were found and reconciled against the tables of contents, with no warnings and no unexpected characters: 782 current instructions after merging.
- **The template format and engine handle the pilot.** All 12 pilot templates validate and round-trip character for character against the official text, including notes, blanks and emphasis. Each passes 500 random answer sets per run, and computed punctuation and AND placement always stay within what the printed markup allows.
- **Most of the corpus is mechanically representable.** A deterministic auto-drafter (no AI) turned 580 of 782 instructions (74%) into skeleton templates that pass schema, round-trip and render checks. A skeleton is not a finished template, though: shared questions, people roles, pronoun targets, agreement and computed punctuation still need a reviewed semantic pass.
- **Harder than the spec assumed:**
  - Both PDFs carry invisible duplicate text layers, and blanks are drawn lines rather than characters.
  - Bracketed series connectors and some lowercase alternatives underdetermine the jury text, so the engine needs documented interpretation rules that an attorney should confirm.
  - 47 instructions have unbalanced brackets or parentheses in the official text, which a tree format can't reproduce without an erratum mechanism.
  - The official text has typos (2670) that fidelity forces us to reproduce.
  - they/them support needs per-template agreement annotations.

## 1. Extraction reliability

| | Edition | Supplement |
| --- | --- | --- |
| File | `calcrim-2026.pdf`, 2,680 pages, SHA-256 `32cde18a…` | `calcrim_2026_supplement.pdf`, 116 pages, SHA-256 `4cbb8a86…` |
| TOC entries | 787 (7 single numbers marked "Reserved for Future Use", plus 549 reserved ranges) | 29 (27 revised, 2 new: 2903, 3237) |
| Expected instructions | 780 | 29 |
| Extracted | 784 records = 780 instructions + 4 reserved placeholder pages (762, 1934, 3401, 3473) | 29 |
| Missing / unexpected | 0 / 0 | 0 / 0 |

Merged corpus: 782 instructions (`data/extracted/2026-10/`, 6.6 MB including Bench Notes). Full report: `data/extracted/2026-10/report.json`.

**Title check.** 776 of 782 extracted titles match the TOC. The 6 mismatches are inconsistencies inside the official PDF, where the TOC differs from the heading on the instruction itself. We use the instruction's own heading.

| No. | TOC | Instruction heading |
| --- | --- | --- |
| 1142 | …Obscene Material… | …Obscene Matter… |
| 1202 | …Extortion or to Exact… | …Extortion, or to Exact… |
| 1242 | (Pen. Code, §§ 236, 237(a)) | (Pen. Code, § 236) |
| 1244 | Causing Minor to Engage in Commercial Sex Act | Human Trafficking of a Minor for Commercial Sex Act |
| 1801 | …490.2, 491) | …490.2, 490.3, 491) |
| 2500 | Illegal Possession, etc., of Weapon | Illegal Possession, Etc. of Weapon |

**Recurring artifacts and how they're handled** (details in the technical design, §2–3):

| Artifact | Where | Handling |
| --- | --- | --- |
| Invisible OCR text layer (`GlyphLessFont`, render mode 3) | Edition | Dropped at the pdfminer level |
| Invisible tagged-text layer duplicating every glyph (Helvetica, render mode 3, added by pdf-lib) | Supplement | Same; without this every character appears twice |
| Blanks drawn as rules, not characters | Both | Recovered from baseline rules → `______` |
| Italic "fi" ligature extracted as `f` + dotless ı ("offıcer") | Edition | `fı` → `fi` |
| Standard ligatures (ﬁ, ﬂ) | Both | Expanded |
| Word spacing missing with default tolerances | Both | Character-gap word detection |
| Glyph-gap artifacts: `[ or]`, `charged[ in`, `______ .` | Both | Canonical spacing rules |
| Emphasis runs crossing markup (`*(great bodily injury[,]/…*`) | Both | Split at markup characters |
| Soft hyphenation | Bench Notes only, 1 case | Dictionary rule; instruction text has none |
| Literal `*` in revision lines (supplement legend: "Denotes changes only to bench notes") | Supplement | Kept in `revision_line`; legend in `revision_legend` |
| Publisher's SECONDARY SOURCES section | Both | Excluded |

**Not yet verified:**
- Bench Notes headings are detected heuristically and haven't been reviewed beyond spot checks.
- Paragraph breaks at page boundaries rely on a heuristic. The round trip validates it for the 12 pilot instructions only.

## 2. Pilot templates

All 12 pilot numbers and titles exist unchanged in the 2026 edition. None were revoked, renumbered, or revised in the October 2026 supplement, so no substitutions were needed.

| No. | Questions | Features exercised |
| --- | --- | --- |
| 200 | 6 | Computed list punctuation `(./,)`; multi-defendant `[s]` |
| 220 | 1 | Printed they-forms `(he/she/they)`, `(is/are)` |
| 226 | 10 | Bullets outside brackets; nested optional |
| 860 | 34 | Alternative element groups 1A / [OR] / 1Bi–1Bii; `[either]`; series connectors; inner `.50 BMG` list; `term[s] … (is/are)` by count |
| 926 | 15 | Labeled alternatives 2A/2B; `(4/5).` element number |
| 945 | 18 | Repeated name blanks; optional element 4; `(;/.)`, `[AND]`, `[AND` inside brackets |
| 1800 | 10 | Bracketed bare choice `[grand/petty]` |
| 2652 | 11 | Note pointing to 2670; shared pick-one-or-more with different connectors |
| 2670 | 30 | Long conditional sections; OR list with lettered sub-list; unbracketed paragraphs inside optional sections |
| 3470 | 16 | Pronoun inside a larger alternative `(he/she/[or] someone else/[or] ______)`; conditional agreement |
| 3517 | 16 | `(Y/y)ou` capitalization; plain numbered directions; three repeat-as-needed slots; count references |
| 3550 | 13 | `(, a dictionary/[, or ______])`; retrial note |

Golden candidates (minimal, maximal, mixed; fictional data; he, they and she pronouns respectively) are in `tests/golden/candidates/`, with `REVIEW.md` for attorney review. None have been promoted.

## 3. Markup patterns across the corpus

From `data/extracted/2026-10/markup-scan.json` (`calcrim-extract scan`), covering all 782 instructions. 20 instructions have no markup at all (e.g. 106, 223, 300).

| Pattern | Instructions | Occurrences | Handled by schema v1? |
| --- | --- | --- | --- |
| Optional `[ ]` | 748 | 13,390 | Yes |
| Pick-one `( / )` | 721 | 5,925 | Yes |
| Element paragraphs | 574 | 2,729 | Yes |
| Blanks without hint / with hint | 532 / 518 | 733 / 2,005 | Yes |
| Emphasis | 529 | 2,221 | Yes |
| Series connectors `[or] [and] [,]` | 492 | 5,578 | Yes (interpretation rule, §6) |
| Nested brackets | 490 | — | Yes |
| Pronoun alternatives | 484 | 1,507 | Yes; target person must be chosen per occurrence |
| Unbracketed AND/OR | 451 | 556 | Yes |
| Standalone notes | 368 | 847 | Yes |
| Plural markers `[s]` | 290 | 1,055 | As booleans; see recommendations |
| Brackets spanning paragraphs | 246 | 278 | Yes |
| `[AND]`/`[OR]` | 177 | 237 | Yes, except when printed outside an optional element's own brackets (42 instructions) |
| `(;/.)` | 158 | 244 | Yes |
| Nested alternatives | 146 | — | Yes |
| `[AND` inside optional element | 133 | 144 | Yes |
| Labeled alternatives | 111 | 302 | Yes (groups) |
| Verb agreement alternatives `(is/are)` | 84 | 149 | Yes (`agree`) |
| Inline notes (not blank hints) | 60 | 148 | Yes |
| Repeat-as-needed identical paragraphs | 50 | 56 | Only as fixed copies; see recommendations |
| **Unbalanced `[ ]` or `( )`** | **47** | 47 | **No**: needs an erratum attribute |
| Other computed punctuation (`(./,)`, `(; [or]/.)`) | 41 | 73 | Yes (`when`) |
| Sub-element labels (1A, 1Bi, a.) | 40 | 105 | Yes |
| Multi-defendant markers | 32 | 79 | Flagged off in v1 |
| `(4/5).` element numbers | 28 | 34 | Yes |
| Bare alternatives in brackets `[a/b]` | 25 | 48 | Yes (`bare`) |
| Bullets | 15 | 104 | Yes |
| Printed they-forms | 13 | 32 | Yes |
| `(Y/y)` capitalization choices | 10 | 12 | Yes (`when`) |

**Unbalanced markup.** The 47 instructions (e.g. 1142, 1810, 2572, 3218, 917) have more opening than closing brackets or parentheses, or the reverse, in the extracted text. Spot checks show closers missing in the official text itself, e.g. 2572 `[in or near a (theater[,]/…/[or] private habitation](; [or]/.)` and 3218 `(sell[,]/[or] exchange[,]/[or] return property]`. Each case needs visual confirmation against the PDF before an erratum is recorded.

**Other flaws in the official text** (reproduced faithfully; flagged in candidate review notes):
- **2670:** `<insert name of felony>created` with no space (the glyph gap is zero on p. 1925; the same sentence in 2671 is correct), so jury text reads "…the crime of robberycreated a risk…". Logged as QUESTIONS.md Q2.
- **3517:** the sentence's period sits inside the optional `[charged in Count ______.]`, so without a count the sentence has no period.
- **200:** with both optional bias items, the markup reads "…age, or socioeconomic status, or [other]".
- **2670:** "*Totality of the circumstances* means…" and "______ is (a/an) (felony/misdemeanor/infraction)." are unbracketed, so they are always included even though they only make sense with the optional sections around them.

## 4. Automatic vs. hand drafting

**Measurement.** `pnpm --filter @cali-corral/engine autodraft` parses every instruction's normalized text into a skeleton template and runs schema validation, the round trip and 100 random renders. Results are in `docs/design/phase-0-autodraft.json`.

| Result | Instructions | Main causes |
| --- | --- | --- |
| Pass | 580 (74%) | — |
| Parse failure | 108 | Conjunction followed by a labeled-alternative group (57); unbalanced official markup (~25); other element shapes |
| Render failure | 67 | Computed punctuation encoded as independent questions (41); bare `[a/b]` alternatives (21); stray markup |
| Round-trip failure | 27 | `[AND]` printed outside an optional element's brackets |

10 of the 12 pilot instructions auto-draft cleanly. The three that need hand work (200, 860, 1800) need exactly the constructs the parser doesn't infer.

**Estimate for the remaining ~770 instructions:**
- **Mechanical skeleton:** about 74% today. With parser support for groups after conjunctions, bare alternatives and AND outside brackets, about 85–88%. The remaining ~12% (unbalanced markup, computed punctuation, unusual list shapes) needs hand or reviewed-AI drafting, after the format gains an erratum attribute.
- **Semantic pass:** every instruction needs one, whether drafted mechanically or by hand:
  - merging repeated alternatives into shared questions (the skeleton median is 10 questions per template, maximum 116)
  - assigning people roles and field bindings
  - picking the target person of each pronoun (484 instructions)
  - adding agreement annotations for they/them
  - writing prompts
  - encoding computed punctuation

  This is where AI drafting fits under non-negotiable #2, with the skeleton as a structural check. The deterministic skeleton already guarantees the round trip, so the AI pass changes only semantics, and the property tests (markup consistency, agreement) catch most mistakes.
- **Effort tiers:**
  - **Tier A, 40 instructions:** static or near-static (≤ 3 questions, no pronouns or blanks). Auto-draft plus light review.
  - **Tier B, 540:** the skeleton passes, plus a semantic pass and review.
  - **Tier C, 202:** hand or AI drafting, plus format extensions for about 47 of them.

## 5. Interpretations that need attorney review

See technical design §12: series connectors, first-letter capitalization, AND inside optional elements, alternative-group numbering, empty computed punctuation, the they-form of reflexives, and literal reproduction of official flaws. These should be part of the Gate 0 attorney review together with the golden candidates.

## 6. Measured storage

| Item | Measured |
| --- | --- |
| Hand-encoded pilot template (compiled JSON) | ~7.2 KB average, ~2.3 KB gzipped |
| Projected corpus of 782 templates | ~5.6 MB raw, ~1.8 MB gzipped |
| Bench Notes, all instructions | 2.5 MB raw, 1.0 MB gzipped |
| Engine bundle including ajv and yaml | 249 KB minified, 78 KB gzipped (the app doesn't need ajv or yaml) |

The full corpus is about 8 MB raw and about 3 MB gzipped, well under the spec's 10–30 MB estimate.

## 7. Recommended changes to `docs/SPEC.md`

1. **Template format.** Replace the illustrative sketch with the v1 node set:
   - computed choices (`when`)
   - pick-one-or-more with series connectors (`any` / `sep`)
   - alternative element groups
   - plain and lettered lists
   - bare alternatives
   - agreement nodes (`agree`, with `onlyIf`)
   - bullets
   - the condition language
   - `articleFor` suggestions

   Point to the JSON Schema as normative.
2. **Add an erratum mechanism** before encoding the 47 unbalanced instructions: a reviewed attribute that omits a missing closer in source mode only, or fixes a spacing-only typo in jury mode (Q2), always visible in the app's highlighted-template view.
3. **Add repeatable blocks** (a "repeat as needed" slot with a count), for the 50 instructions that print identical copies of a paragraph.
4. **Linked questions.** Allow a choice node to map its options onto a subset of another question's options (860's element 1A lists six weapons, the intro seven). This avoids asking the same thing twice.
5. **Verification.**
   - Define "normalized official text" as the canonical source text (notes, blanks, emphasis, canonical spacing).
   - Add the markup-consistency property.
   - State that Bench Notes are extracted and displayed but not round-tripped.
6. **Rendering rules.** Document the interpretation rules (ADR 0005) in the spec and require attorney sign-off at Gate 0.
7. **Pronouns.** Clarify that v1's they/them support requires per-template agreement annotations (single person). The Phase 3 roadmap item then covers only multi-defendant agreement. 84 instructions print `(is/are)`-style alternatives, and many more have unmarked verbs that need annotating.
8. **Review tiers.** "Machine-checked" should mean the semantic pass is done and passes the property tests, not just that a skeleton round-trips. Consider a third label for skeletons, which should not ship.
9. **Freshness.**
   - Add the official body hash per instruction to the manifest, so a release that changes only Bench Notes (marked with `*` in the supplement) doesn't mark templates superseded.
   - Note that supplements contain only revised and new instructions.
10. **Gotcha 2** (extraction artifacts): add invisible text layers and drawn blanks; both would silently corrupt text without the filters.
11. **Storage budget:** replace the estimates with the measurements above.
12. **Counts and plurals:** 290 instructions use `[s]` plural markers, often tied to counts or crimes. The multi-count phase should model plurality from the case data rather than one question per marker.
13. **Corpus size:** "~800 instructions" is 782 in the current release, plus 7 reserved numbers.

## 8. Open questions

All resolved (`docs/QUESTIONS.md`): BlueOak-1.0.0 allowed; spacing-only errata approved pending legal advice; reflexive they-form is "themselves".
