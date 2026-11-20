# Phase 0: Foundations

**Goal:** prove the hard parts (extraction, template format, rendering fidelity) on a small pilot set before any UI is built. If something here turns out to be much harder than the spec assumes, that is a valuable result. Report it rather than working around it silently.

Read `CLAUDE.md` and `docs/SPEC.md` first.

## Inputs

- `docs/SPEC.md`, especially "Background: how CALCRIM is written," "Template format," "Rendering modes," "Verification" and "Ingestion pipeline."
- The official CALCRIM PDFs, linked from the Judicial Council's advisory committee page: https://courts.ca.gov/advisory-body/criminal-jury-instructions-advisory-committee
  - Use the most recent full edition **plus every later supplement**. The current text of an instruction is its latest version across those files; record which file each instruction came from.
  - Download once and cache locally (see the politeness rules in `CLAUDE.md`).
- The pilot list below.

## Out of scope

UI, the submission relay, hosting and deployment, .docx export, the source watcher, automated AI drafting, multiple defendants. You may encode the pilot templates directly.

## Deliverables

1. **Technical design** at `docs/design/technical-design.md`, covering:
   - Stack and repo layout (suggested defaults below; deviate only with an ADR)
   - Template format: authoring format plus a JSON Schema
   - Normalization rules for official text (ligatures, hyphenation, whitespace, quotes, page headers and footers)
   - Rendering engine API: jury, annotated and source modes; the question and answer model; pronoun binding; element-list numbering, separators and "AND"
   - Case file format v1 (versioned), manifest format, local-override patch format, and the relay API contract (contract only, no implementation)
   - Versioning and migration strategy for templates and case files
2. **Repo scaffold:** monorepo, lint and format, GitHub Actions CI running every test.
3. **Extraction prototype** (CLI): download with caching, split the PDFs into per-instruction records (number, title, instruction body, Bench Notes sections, revision line), normalize, and write one JSON file per instruction under `data/extracted/<release>/`. Run it on the whole corpus, not just the pilot.
4. **Rendering engine** (library, no UI dependencies) implementing the schema and all three modes.
5. **Pilot templates** for every instruction in the pilot list, each passing the round-trip test against the extracted text.
6. **Tests:**
   - Round-trip for every template
   - Property tests: at least 500 random answer sets per template. Fail on leftover markup (`[ ] < >` or slash alternatives), unfilled fields, doubled spaces or punctuation, or element lists that don't end with a period.
   - Golden-test harness that compares renders to files in `tests/golden/`. Generate **candidate** renders into `tests/golden/candidates/` (at least 3 answer sets per pilot template, including all-minimal and all-maximal) for attorney review. Do not promote candidates to goldens yourself.
7. **Findings report** at `docs/design/phase-0-findings.md`:
   - Extraction reliability across the full corpus: instructions detected vs. expected, failures, and recurring artifacts
   - Markup patterns found anywhere in the corpus that the schema doesn't handle yet (scan all extracted text, not just the pilot)
   - An estimate of how much of the remaining ~800 instructions can be drafted automatically vs. by hand
   - Recommended changes to `docs/SPEC.md`

## Suggested defaults

- pnpm workspace monorepo; TypeScript in strict mode; Vitest; fast-check for property tests
- Templates authored as YAML in `corpus/templates/<number>.yaml`, validated with JSON Schema (ajv)
- Extraction in Python 3.12 with pdfplumber / pdfminer.six (both MIT), pytest, uv for the environment
- The round-trip test runs the TypeScript engine against the extracted JSON, so the code that passes it is the code the app will run

## Pilot instructions

Verify every number and title against the current edition. If one has been revoked or renumbered, substitute a similar instruction and note it in the findings report.

| No. | Title | Why it's in the pilot |
| --- | --- | --- |
| 200 | Duties of Judge and Jury | Mostly static; optional paragraphs |
| 220 | Reasonable Doubt | Near-static baseline |
| 226 | Witnesses | Long list of optional bracketed factors |
| 860 | Assault on Firefighter or Peace Officer With Deadly Weapon or Force Likely to Produce Great Bodily Injury | Long alternative lists; agency and title blanks; definitional paragraphs |
| 926 | Battery Against Specified Victim Not a Peace Officer | Labeled alternatives (2A / 2B) |
| 945 | Battery Against Peace Officer | Repeated name blanks; optional element 4; `(;/.)` and `[AND]` |
| 1800 | Theft by Larceny | Common offense |
| 2652 | Resisting an Executive Officer in Performance of Duty | Cross-reference note pointing to 2670 |
| 2670 | Lawful Performance: Peace Officer | Target of cross-references; long conditional sections |
| 3470 | Right to Self-Defense or Defense of Another (Non-Homicide) | Common defense; many optional paragraphs |
| 3517 | Deliberations and completion of verdict forms (greater and lesser offenses) | Lesser-included-offense structure; count references |
| 3550 | Pre-Deliberation Instructions | Concluding instruction; mostly static |

## Acceptance criteria

- [ ] Technical design doc covers every item in deliverable 1
- [ ] CI is green: lint, schema validation, round-trip for all pilot templates, property tests
- [ ] Extraction runs end to end on the current edition and its supplements, and the report gives detected vs. expected counts
- [ ] Candidate renders exist for every pilot template
- [ ] Findings report is written

## Stop point

When the acceptance criteria are met, **stop**. In your final message, summarize what works, what doesn't, open questions, and the changes you recommend before Phase 1. Do not start Phase 1.
