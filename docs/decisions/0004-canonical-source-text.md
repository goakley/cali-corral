# 0004. Canonical source text for the round-trip test

Date: 2026-11-20 · Status: accepted (owner, 2026-11-22)

## Context

The round-trip test compares source-mode output with "the normalized official text". Plain PDF text loses information that matters (which `<…>` is a drafter note, which words are emphasized, where blanks are) and contains layout accidents (glyph gaps, line breaks).

## Decision

Normalized text is one string per paragraph using: `______` for a drawn blank, `<…>` for notes (italic officially), `*…*` for emphasis outside notes, and literal markup otherwise. Spacing that is a layout accident (after `/`, just inside an opening bracket, between a blank and punctuation) is canonicalized by the same rules in the extractor and in the engine's source mode. Emphasis is split around markup characters. Rules are listed in the technical design, §3.

## Consequences

- The round-trip verifies wording, markup, blanks and emphasis — not only words.
- The two implementations (Python normalizer, TypeScript `canonicalSource`) must stay in sync; both have unit tests for each rule.
- Emphasis inside an alternative is recorded per word (`(*M*/*m*)*atter*`), which is faithful but slightly verbose in templates.
