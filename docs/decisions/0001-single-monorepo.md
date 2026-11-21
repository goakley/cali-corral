# 0001. One monorepo for code and corpus

Date: 2026-11-20 · Status: accepted (owner, 2026-11-20)

## Context

The spec describes a public "corpus repo" as the source of truth, plus an app, a shared rendering engine, maintainer tooling and a relay. Phase 0 puts templates (`corpus/templates/`) beside the engine.

## Decision

Keep code, templates, extracted source text and maintainer tooling in one repository, on the `master` branch.

## Consequences

- A template change and an engine change are validated together in one pull request; the round-trip test always runs the engine version that will ship with those templates.
- The relay targets a single repository.
- Community template fixes share the issue/PR queue with code changes. Use path-based labels and CODEOWNERS (`corpus/**`) to route them.
- If the corpus ever needs its own release cadence, it can be split out later; compiled corpus files are already versioned independently by `corpus_version`.
