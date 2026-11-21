# Open questions for the owner

Questions raised while working. Each says what was chosen in the meantime (the most conservative option). Resolved questions move to the bottom with the answer.

## Open

### Q1. BlueOak-1.0.0 dev dependencies (2026-11-20)

`minimatch` and `@isaacs/nonrecursive-glob-match` (pulled in by ESLint, dev-only) are licensed BlueOak-1.0.0, a permissive OSI-approved license that isn't on CLAUDE.md's list. Nothing GPL-like. **Meanwhile:** kept, since they're dev-only and permissive. OK to add BlueOak-1.0.0 to the allowed list?

### Q2. Obvious typos in the official text (2026-11-20)

CALCRIM 2670 (2026 edition, p. 1925) prints `<insert name of felony>created` with no space; the same sentence in 2671 has the space. Fidelity means we reproduce it, so jury text reads "…the crime of robberycreated a risk…". **Meanwhile:** reproduced exactly and listed in the findings report. Should templates be allowed a documented, reviewed "erratum" annotation that fixes spacing-only typos in jury mode (source mode still matching the official text)?

### Q3. They-form of reflexive pronouns (2026-11-20)

When a person uses they/them, `(himself/herself)` renders as "themselves". Some style guides prefer "themself" for one person. **Meanwhile:** "themselves". Preference?

## Resolved

- **Contact address for the User-Agent** — the owner's address, supplied through `CALI_CORRAL_CONTACT` in a local `.env` (2026-11-20).
- **Default branch** — `master`; commit to it directly (2026-11-20).
- **One repo or two** — one monorepo (ADR 0001).
- **Committing PDFs** — no; commit extracted JSON only (ADR 0002).
