# Open questions for the owner

Questions raised while working. Each says what was chosen in the meantime (the most conservative option). Resolved questions move to the bottom with the answer.

## Open

- **Q4. Consolidated definitions under rule 2.1055** (raised by the reviewing attorney, 2026-11-22; feature planned for Phase 2). When repeated definitions move to one section at the front of the set, how should the export present it? Specifically: does each instruction that loses its copy count as "modified" in the index checklist, and is the definitions section numbered as a special instruction with citations to the instructions it came from? *Meanwhile (most conservative):* the option is off by default. When on, affected instructions are marked modified, and the definitions section is a special instruction citing its source instructions. Nothing is built until Phase 2.

## Resolved

- **Q1. BlueOak-1.0.0 dev dependencies** — acceptable; added to CLAUDE.md's allowed licenses (owner, 2026-11-20).
- **Q2. Obvious typos in the official text** — settled by legal review (2026-11-22). The earlier owner approval of spacing-only corrections (2026-11-20) is superseded. **Never correct the official text, even an apparent typo**: 2670's missing space stays in jury text. Errata are used heavily to *record and display* suspected typos and misprints, never to change rendered text. See the spec, Template format: Errata.
- **Q3. They-form of reflexive pronouns** — "themselves" (owner, 2026-11-20). Already the engine's behavior.
- **Contact address for the User-Agent** — the owner's address, supplied through `CALI_CORRAL_CONTACT` in a local `.env` (2026-11-20).
- **Default branch** — `master`; commit to it directly (2026-11-20).
- **One repo or two** — one monorepo (ADR 0001).
- **Committing PDFs** — no; commit extracted JSON only (ADR 0002).
