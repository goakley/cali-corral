# 0007. Drafting the remaining instructions

Date: 2026-11-22 · Status: accepted (owner, 2026-11-22)

## Context

About 770 instructions need templates after the Phase 0 pilot. The spec describes AI drafts arriving as pull requests for a maintainer to merge, while CLAUDE.md says to commit to `master`. Findings §4 splits drafting into a mechanical skeleton and a semantic pass.

## Decision

- **Who drafts.** Claude, working in maintainer sessions in this repo, does the semantic pass on top of the deterministic skeleton (`scripts/autodraft.ts`). There is no API-driven drafting tool for now.
- **Where drafts land.** Templates are committed straight to `master` in batches by CALCRIM series, labeled `machine-checked`, each passing every automated check. Human review happens later, before Phase 1 ships to users (non-negotiable 2: every draft is reviewed by a human before it ships).
- **Work order.** Engine extensions first (errata, link kinds), then drafter improvements and a per-instruction to-do report, then batches by series. Each batch stops for the owner's review.
- **Errata.** Drafting proposes an erratum whenever a misprint is suspected, and never corrects official text (CLAUDE.md non-negotiable 1).

## Consequences

- `master` holds unreviewed AI drafts, labeled `machine-checked`. Before Phase 1, a human review pass must cover them. The manifest's `review` field and the app's review label make the status visible.
- The pull-request review described in the spec applies to changes after launch.
