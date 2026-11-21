# 0006. Extraction with pdfplumber and an invisible-text filter

Date: 2026-11-20 · Status: accepted (Phase 0)

## Context

The official PDFs encode structure typographically (bold instruction text, italic notes, Helvetica headings, drawn blanks) and both carry invisible text layers (an OCR layer in the edition; a tagged accessibility layer duplicating every glyph in the supplement).

## Decision

Use pdfplumber/pdfminer.six (MIT) for character-level layout, patch pdfminer's `render_string` to drop text drawn in render mode 3 (invisible), rebuild lines as styled spans, and recover blanks from baseline rules. Cache layout per PDF hash.

## Consequences

- Extraction reconciled 780/780 edition instructions and 29/29 supplement instructions against the tables of contents, with no warnings.
- The monkeypatch depends on pdfminer internals; pin pdfminer.six and keep the unit tests. If pdfminer changes, the symptom is obvious (doubled characters in the supplement).
