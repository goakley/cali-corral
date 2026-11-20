# Cali Corral

A free, open-source, offline-capable web app (PWA) that turns CALCRIM (California criminal jury instructions) templates into finished, court-ready proposed instructions. Users pick instructions, answer prompts for each blank and conditional, and export a .docx.

- Product spec: `docs/SPEC.md`
- UI direction: `docs/UI.md`
- Current phase brief: `docs/PHASE-0.md`
- Decisions: `docs/decisions/` (short ADRs, `NNNN-title.md`)
- Open questions for the owner: `docs/QUESTIONS.md`

## Non-negotiables

1. **Fidelity.** Rendered text must match the official CALCRIM wording exactly. The round-trip test (source-mode render == normalized official text) must pass for every template on `main`. Never "improve" CALCRIM wording.
2. **No generative AI at runtime.** The rendering path is deterministic. AI may draft templates only in maintainer tooling, and every draft is reviewed by a human before it ships.
3. **Case data never leaves the user's device.** No telemetry, analytics or third-party scripts. The only network calls: same-origin corpus/manifest fetches, and user-initiated relay submissions (template data and a note only, never rendered text).
4. **Permissive open-source dependencies only** (MIT, Apache-2.0, BSD, ISC, MPL-2.0). Ask before adding anything GPL/AGPL or proprietary.
5. **Desktop-first UI.** Responsive layouts are welcome but secondary.
6. **CALCRIM only.** No CACI, CALJIC or any other instruction set, ever.
7. **Never imply official status.** Credit the Judicial Council of California as the source. Don't claim copyright in instruction text. Don't describe the app as "official."
8. **Source text comes only from courts.ca.gov PDFs.** Never use LexisNexis, Westlaw, Justia or other republished copies.

## Working agreements

- **Work phase by phase.** Each phase brief ends with a stop point. When you reach it, stop, summarize, and wait for review. Do not start the next phase on your own.
- **Ambiguity:** if the spec is unclear or seems wrong, add the question to `docs/QUESTIONS.md`, choose the most conservative option, and keep going.
- **Significant technical choices** (stack, formats, contracts) get a short ADR in `docs/decisions/`.
- **Tests:** every engine change ships with tests. Never weaken, skip or delete a failing round-trip or golden test to make CI pass; report it instead.
- **Fixtures use fictional names only.** Never commit real case data.
- **Secrets** live in environment variables, documented in `.env.example`. Never commit them.
- **Be polite to courts.ca.gov:** cache downloads locally, use conditional requests (ETag / If-Modified-Since), send an identifying User-Agent with a contact address, and never fetch in parallel.

## Repo map

_Filled in during Phase 0._

## Commands

_Filled in during Phase 0 (install, test, lint, extract, render)._

## Licensing

- Code: MIT
- Instruction text: the Judicial Council of California's work, freely available for use and reproduction under Cal. Rules of Court, rule 2.1050(c). Attributed, not claimed.
- Project-authored template structure and annotations: CC0
