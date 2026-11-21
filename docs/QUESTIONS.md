# Open questions for the owner

Questions raised while working. Each says what was chosen in the meantime (the most conservative option). Resolved questions move to the bottom with the answer.

## Open

_None._

## Resolved

- **Q1. BlueOak-1.0.0 dev dependencies** — acceptable; added to CLAUDE.md's allowed licenses (owner, 2026-11-20).
- **Q2. Obvious typos in the official text** — approved in principle: templates may carry a documented, reviewed erratum for spacing-only typos (source mode still matches the official text). The owner will confirm with the legal advisor before errata ship (owner, 2026-11-20). Not yet implemented; see findings §7 item 2.
- **Q3. They-form of reflexive pronouns** — "themselves" (owner, 2026-11-20). Already the engine's behavior.
- **Contact address for the User-Agent** — the owner's address, supplied through `CALI_CORRAL_CONTACT` in a local `.env` (2026-11-20).
- **Default branch** — `master`; commit to it directly (2026-11-20).
- **One repo or two** — one monorepo (ADR 0001).
- **Committing PDFs** — no; commit extracted JSON only (ADR 0002).
