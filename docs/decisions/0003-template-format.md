# 0003. Templates: YAML tree, JSON Schema, typed nodes

Date: 2026-11-20 · Status: proposed (Phase 0)

## Context

Templates must reproduce official text exactly (round-trip), drive a questionnaire, and be reviewable by maintainers and volunteer attorneys on GitHub.

## Decision

- One file per instruction, `corpus/templates/<number>.yaml`, whose structure is exactly the compiled JSON (no YAML tags or anchors).
- The body is a tree of typed nodes (text, emphasis, field, optional, choice/computed choice, pick-one-or-more with connectors, pronoun, agreement, note; paragraph, bullet, note, optional block, element list with groups).
- `packages/engine/schema/template.schema.json` (JSON Schema 2020-12) is the normative definition; semantic rules (references, option counts, derivable pronouns) are enforced in `validateTemplate`.
- Questions are declared explicitly with stable ids; relevance is computed from the tree rather than declared.
- Conditions use a tiny expression language (`q`, `q=opt`, `q~opt`, `q>n`, `! & | ( )`, `@flags`).

## Consequences

- Reviewers read YAML diffs; CI validates every template.
- The format is a tree, so markup that isn't properly nested in the official text (47 instructions have unbalanced brackets or parentheses) needs an explicit erratum mechanism before those templates can round-trip (see findings).
- Compiled JSON is what the app loads; YAML and ajv stay out of the app bundle.
