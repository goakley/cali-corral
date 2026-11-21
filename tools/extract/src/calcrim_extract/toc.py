"""Tables of contents: the "expected" instruction list for reconciliation."""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from .layout import Line
from .normalize import fix_glyphs

ENTRY_RE = re.compile(r"^(\d{3,4}[A-Z]?)\.\s+(.*)$")
RANGE_RE = re.compile(r"^(\d{3,4})[–-](\d{3,4})\.\s+Reserved for Future Use")
SUPP_RE = re.compile(r"^CALCRIM,? No\. (\d{3,4}[A-Z]?)\.\s+(.*?)(?:\((new|revised)\))?$")


@dataclass
class Toc:
    entries: dict[str, str] = field(default_factory=dict)  # number -> title text
    reserved: set[str] = field(default_factory=set)  # single numbers marked reserved
    reserved_ranges: list[tuple[int, int]] = field(default_factory=list)
    supplement_status: dict[str, str] = field(default_factory=dict)  # number -> new|revised

    @property
    def instructions(self) -> set[str]:
        return set(self.entries) - self.reserved


def _is_toc_line(ln: Line) -> bool:
    """TOC entries are 10-11pt Times; the statute tables at the back of the
    edition (8pt, dot leaders) look similar and are excluded."""
    return "Helvetica" not in ln.main_font and 9.5 <= ln.size <= 11.5 and ". . ." not in ln.text


def _toc_pages(lines: list[Line], min_entries: int = 5) -> set[int]:
    per_page: dict[int, int] = defaultdict(int)
    for ln in lines:
        if not _is_toc_line(ln):
            continue
        if ENTRY_RE.match(ln.text) or RANGE_RE.match(ln.text):
            per_page[ln.page] += 1
    return {p for p, n in per_page.items() if n >= min_entries}


def parse_edition_toc(lines: list[Line]) -> Toc:
    toc = Toc()
    pages = _toc_pages(lines)
    for ln in lines:
        if ln.page not in pages or not _is_toc_line(ln):
            continue
        text = fix_glyphs(ln.text)
        m = RANGE_RE.match(text)
        if m:
            toc.reserved_ranges.append((int(m.group(1)), int(m.group(2))))
            continue
        m = ENTRY_RE.match(text)
        if m:
            num, title = m.group(1), m.group(2)
            toc.entries.setdefault(num, title)
            if title.startswith("Reserved for Future Use"):
                toc.reserved.add(num)
    return toc


def parse_supplement_toc(lines: list[Line]) -> Toc:
    """The supplement lists its contents as 'CALCRIM No. N. Title (revised|new)',
    sometimes wrapping the status onto the next line."""
    toc = Toc()
    pending: str | None = None
    for ln in lines:
        if ln.page > 12:  # the contents list is in the front matter
            break
        text = fix_glyphs(ln.text).strip()
        if pending is not None:
            text = pending + " " + text
            pending = None
        m = SUPP_RE.match(text)
        if not m:
            continue
        if m.group(3) is None:
            pending = text
            continue
        toc.entries[m.group(1)] = m.group(2).strip()
        toc.supplement_status[m.group(1)] = m.group(3)
    return toc
