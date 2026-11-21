"""Split the line stream of a CALCRIM PDF into per-instruction records.

Typography rules observed in the 2026 edition and supplement:

- instruction titles: Helvetica-Bold ~12pt, ``<number>. <title>``, possibly
  wrapping onto further Helvetica-Bold lines;
- series / subseries headings: Helvetica-Bold ~14pt (ignored);
- section headings: Helvetica-Bold uppercase (BENCH NOTES, AUTHORITY, ...);
- instruction text: Times 12pt; revision line and Bench Notes: Times 11pt;
- running headers sit above y=50; page numbers below y=645.

Text from the publisher's SECONDARY SOURCES section is discarded: the
project uses only Judicial Council material (CLAUDE.md, non-negotiable 8).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .layout import Line
from .normalize import BLANK, EM_OFF, EM_ON

TITLE_RE = re.compile(r"^(\d{3,4}[A-Z]?)\.\s+(.*)$")
REVISION_RE = re.compile(r"^(New|Revised|Renumbered|Added|Formerly|Revoked)\b")
PAGE_NUMBER_RE = re.compile(r"^(\d{1,4}|[ivxlcdm]{1,8})$")

SECTION_HEADINGS = {
    "BENCH NOTES": "bench_notes",
    "AUTHORITY": "authority",
    "LESSER INCLUDED OFFENSES": "lesser_included_offenses",
    "RELATED ISSUES": "related_issues",
    "COMMENTARY": "commentary",
    "SECONDARY SOURCES": None,  # publisher material: excluded
}

HEADER_MAX_TOP = 50.0
PARAGRAPH_GAP = 14.5
FOOTER_MIN_TOP = 645.0


@dataclass
class Paragraph:
    lines: list[str]
    style: str  # dominant style of the paragraph: "b", "i", "r", "bi"
    indent: float  # x0 of the first line, relative to the page's text margin
    pages: list[int] = field(default_factory=list)
    heading: bool = False


@dataclass
class RawInstruction:
    number: str
    title_lines: list[str]
    first_page: int
    last_page: int = 0
    body: list[Line] = field(default_factory=list)
    revision: list[Line] = field(default_factory=list)
    sections: dict[str, list[Line]] = field(default_factory=dict)
    excluded_line_count: int = 0
    warnings: list[str] = field(default_factory=list)


def _is_helv_bold(line: Line) -> bool:
    f = line.main_font.lower()
    return "helvetica" in f and "bold" in f


def is_title(line: Line) -> bool:
    return _is_helv_bold(line) and 11.0 <= line.size <= 13.0 and bool(TITLE_RE.match(line.text))


def section_heading(line: Line) -> str | None:
    if not _is_helv_bold(line):
        return None
    t = line.text.strip()
    return t if t in SECTION_HEADINGS else None


def is_running_header(line: Line) -> bool:
    return line.top < HEADER_MAX_TOP


def is_page_number(line: Line) -> bool:
    return line.top > FOOTER_MIN_TOP and bool(PAGE_NUMBER_RE.match(line.text.strip()))


def segment(lines: list[Line]) -> list[RawInstruction]:
    out: list[RawInstruction] = []
    cur: RawInstruction | None = None
    state = "none"  # none | title | body | revision | section:<key> | excluded

    for line in lines:
        if is_running_header(line) or is_page_number(line):
            continue
        if is_title(line):
            m = TITLE_RE.match(line.text)
            assert m
            if cur:
                out.append(cur)
            cur = RawInstruction(m.group(1), [line.text], line.page, line.page)
            state = "title"
            continue
        if cur is None:
            continue
        cur.last_page = line.page if state != "excluded" else cur.last_page

        if state == "title":
            if _is_helv_bold(line) and not section_heading(line) and line.size < 13.5:
                cur.title_lines.append(line.text)
                continue
            state = "body"

        heading = section_heading(line)
        if heading:
            key = SECTION_HEADINGS[heading]
            if key is None:
                state = "excluded"
            else:
                state = f"section:{key}"
                cur.sections.setdefault(key, [])
            continue

        if _is_helv_bold(line) and line.size >= 13.5:
            # a series/subseries heading between instructions
            if state in ("body",):
                cur.warnings.append(f"series heading inside body on page {line.page}: {line.text!r}")
            continue

        if state == "body":
            if line.size < 11.5 and line.is_style("i") and REVISION_RE.match(line.text):
                state = "revision"
                cur.revision.append(line)
            else:
                cur.body.append(line)
        elif state == "revision":
            if line.size < 11.5 and line.is_style("i"):
                cur.revision.append(line)
            else:
                # Bench Notes text without a heading (unexpected)
                cur.warnings.append(f"text after revision line without heading, page {line.page}")
                state = "section:bench_notes"
                cur.sections.setdefault("bench_notes", []).append(line)
        elif state.startswith("section:"):
            cur.sections[state.split(":", 1)[1]].append(line)
        elif state == "excluded":
            cur.excluded_line_count += 1

    if cur:
        out.append(cur)
    return out


# ---------------------------------------------------------------------------
# Paragraphs


def _line_marked_text(line: Line) -> str:
    """Line text with italic runs wrapped in EM markers and blanks as BLANK."""
    parts: list[str] = []
    for s in line.spans:
        if s.blank:
            parts.append(BLANK)
        elif s.italic:
            parts.append(EM_ON + s.text + EM_OFF)
        else:
            parts.append(s.text)
    return "".join(parts)


def _dominant_style(lines: list[Line]) -> str:
    counts: dict[str, int] = {}
    for ln in lines:
        for s in ln.spans:
            if not s.blank:
                counts[s.style] = counts.get(s.style, 0) + len(s.text.strip())
    return max(counts, key=lambda k: counts[k]) if counts else "r"


def _approx_word_width(word: str, size: float) -> float:
    return len(word) * size * 0.5


def paragraphs(lines: list[Line], margins: dict[int, float]) -> list[Paragraph]:
    """Group lines into paragraphs.

    Within a page, a vertical gap above ``PARAGRAPH_GAP`` starts a new
    paragraph (line pitch is 13-13.5pt; paragraph gaps are 15pt or more in
    both the edition and the supplement). Across a page break, the previous
    paragraph continues unless the first word of the new line would have fit
    at the end of the previous line (i.e. the previous line was deliberately
    short), or the new line is dedented relative to the previous one.
    """
    groups: list[list[Line]] = []
    page_right: dict[int, float] = {}
    for ln in lines:
        page_right[ln.page] = max(page_right.get(ln.page, 0.0), ln.x1)

    prev: Line | None = None
    for ln in lines:
        new = prev is None
        if prev is not None:
            if ln.page == prev.page:
                new = (ln.top - prev.top) > max(PARAGRAPH_GAP, 1.2 * max(prev.size, ln.size))
            else:
                first_word = ln.text.split(" ", 1)[0]
                room = page_right.get(prev.page, prev.x1) - prev.x1
                new = room > _approx_word_width(first_word, ln.size) + ln.size * 0.3
                # a new numbered element, note or bracketed block after a page
                # break always starts a paragraph when the previous line ended
                # with terminal punctuation
                rel_prev = prev.x0 - margins.get(prev.page, prev.x0)
                rel_new = ln.x0 - margins.get(ln.page, ln.x0)
                if rel_new < rel_prev - 5:
                    new = True
                if not new and re.match(r"^(\d+\.|<|\[)", ln.text) and re.search(
                    r"[.;:\]>)]$", prev.text
                ):
                    new = True
        if new:
            groups.append([ln])
        else:
            groups[-1].append(ln)
        prev = ln

    out = []
    for g in groups:
        margin = margins.get(g[0].page, g[0].x0)
        out.append(
            Paragraph(
                [_line_marked_text(ln) for ln in g],
                _dominant_style(g),
                round(g[0].x0 - margin, 1),
                sorted({ln.page for ln in g}),
            )
        )
    return out


def page_margins(lines: list[Line]) -> dict[int, float]:
    """Left text margin per page: the smallest x0 shared by at least three
    lines (single stray lines, such as centered headings, are ignored)."""
    by_page: dict[int, dict[int, int]] = {}
    for ln in lines:
        if ln.top < HEADER_MAX_TOP or ln.top > FOOTER_MIN_TOP:
            continue
        d = by_page.setdefault(ln.page, {})
        k = round(ln.x0)
        d[k] = d.get(k, 0) + 1
    out = {}
    for p, d in by_page.items():
        common = [k for k, n in d.items() if n >= 3]
        out[p] = float(min(common) if common else min(d))
    return out
