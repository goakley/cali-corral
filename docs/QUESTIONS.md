# Open questions for the owner

Questions raised while working. Each says what was chosen in the meantime (the most conservative option). Resolved questions move to the bottom with the answer.

## Open

### Q1. BlueOak-1.0.0 dev dependencies (2026-11-20)

`minimatch` and `@isaacs/nonrecursive-glob-match` (pulled in by ESLint, dev-only) are licensed BlueOak-1.0.0, a permissive OSI-approved license that isn't on CLAUDE.md's list. Nothing GPL-like. **Meanwhile:** kept, since they're dev-only and permissive. OK to add BlueOak-1.0.0 to the allowed list?

## Resolved

- **Contact address for the User-Agent** — the owner's address, supplied through `CALI_CORRAL_CONTACT` in a local `.env` (2026-11-20).
- **Default branch** — `master`; commit to it directly (2026-11-20).
- **One repo or two** — one monorepo (ADR 0001).
- **Committing PDFs** — no; commit extracted JSON only (ADR 0002).
