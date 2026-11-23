# Open questions for the owner

Questions raised while working. Each says what was chosen in the meantime (the most conservative option). Resolved questions move to the bottom with the answer.

## Open

_None._

## Resolved

- **Q1. BlueOak-1.0.0 dev dependencies** — acceptable; added to CLAUDE.md's allowed licenses (owner, 2026-11-20).
- **Q2. Obvious typos in the official text** — settled by legal review (2026-11-22). The earlier owner approval of spacing-only corrections (2026-11-20) is superseded. **Never correct the official text, even an apparent typo**: 2670's missing space stays in jury text. Errata are used heavily to *record and display* suspected typos and misprints, never to change rendered text. See the spec, Template format: Errata.
- **Q3. They-form of reflexive pronouns** — "themselves" (owner, 2026-11-20). Already the engine's behavior.
- **Q4. Consolidating repeated definitions** — dropped (owner, after talking with the attorney, 2026-11-22). The app won't move repeated definitions to a shared section; each instruction keeps its own definitions.
- **Contact address for the User-Agent** — the owner's address, supplied through `CALI_CORRAL_CONTACT` in a local `.env` (2026-11-20).
- **Default branch** — `master`; commit to it directly (2026-11-20).
- **One repo or two** — one monorepo (ADR 0001).
- **Committing PDFs** — no; commit extracted JSON only (ADR 0002).
