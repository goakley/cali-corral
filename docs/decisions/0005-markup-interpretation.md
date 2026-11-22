# 0005. How jury mode resolves underdetermined CALCRIM markup

Date: 2026-11-20 · Status: accepted — reviewed and approved by a practicing attorney, 2026-11-22

## Context

Some official markup doesn't fully determine the jury text: `[and]` printed only before the last item of a list, lowercase alternatives that can begin a sentence, `[AND` inside an optional element's brackets, alternative element groups.

## Decision

The engine applies fixed, documented rules (technical design §5.4–5.5 and §12): series connectors apply to whichever items are kept; the first letter of every paragraph and element is capitalized; an AND inside an optional element's brackets is used only when it is last; alternative groups are numbered by a fixed rule; computed punctuation renders nothing when its item is omitted. The property tests check that computed punctuation and conjunctions stay within what the printed markup allows.

## Consequences

- Output is deterministic and grammatical for every answer set.
- These rules change only letter case and the placement of printed connectors, never wording. A practicing attorney confirmed them on 2026-11-22.
- Official typos and misprints are reproduced exactly as printed, never corrected. Suspected flaws are recorded as errata and shown to the user (attorney feedback, 2026-11-22).
