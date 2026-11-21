"""Page layout: turn PDF characters and drawn rules into styled text lines.

The official PDFs encode meaning in typography:

- instruction text is set in a bold face, drafter notes in italic;
- fill-in blanks are *drawn* horizontal rules at the text baseline, not
  characters.

So instead of plain ``extract_text`` we rebuild each line as a list of spans
carrying the style, and re-insert blanks as explicit span objects.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

import pdfplumber
from pdfminer.converter import PDFLayoutAnalyzer

# Characters in these fonts are invisible accessibility/OCR layers.
_IGNORED_FONT_MARKERS = ("GlyphLessFont",)
_MIN_VISIBLE_SIZE = 3.0

# Both official PDFs carry invisible text layers (text render mode 3): an OCR
# layer in the edition and a tagged accessibility layer in the supplement that
# duplicates every visible glyph. pdfminer doesn't expose the render mode on
# characters, so drop invisible strings before layout analysis.
_orig_render_string = PDFLayoutAnalyzer.render_string


def _render_visible_only(self, textstate, seq, ncs, graphicstate):  # type: ignore[no-untyped-def]
    if textstate.render == 3:
        return
    _orig_render_string(self, textstate, seq, ncs, graphicstate)


PDFLayoutAnalyzer.render_string = _render_visible_only  # type: ignore[method-assign]


@dataclass
class Span:
    text: str
    bold: bool = False
    italic: bool = False
    size: float = 0.0
    font: str = ""
    blank: bool = False  # a drawn fill-in rule; text is ""
    x0: float = 0.0
    x1: float = 0.0

    @property
    def style(self) -> str:
        if self.blank:
            return "blank"
        return ("b" if self.bold else "") + ("i" if self.italic else "") or "r"


@dataclass
class Line:
    page: int  # 1-based page index in the PDF
    top: float
    bottom: float
    x0: float
    spans: list[Span] = field(default_factory=list)
    x1: float = 0.0
    page_width: float = 0.0

    @property
    def text(self) -> str:
        return "".join("______" if s.blank else s.text for s in self.spans)

    @property
    def size(self) -> float:
        sizes = [s.size for s in self.spans if not s.blank and s.text.strip()]
        return max(sizes) if sizes else 0.0

    @property
    def main_font(self) -> str:
        counts: dict[str, int] = {}
        for s in self.spans:
            if not s.blank:
                counts[s.font] = counts.get(s.font, 0) + len(s.text.strip())
        return max(counts, key=lambda k: counts[k]) if counts else ""

    def is_style(self, style: str) -> bool:
        """True if every non-space span has the given style ('b', 'i', 'bi', 'r')."""
        return all(s.style == style for s in self.spans if s.blank or s.text.strip())


def _font_flags(fontname: str) -> tuple[bool, bool]:
    name = fontname.split("+")[-1].lower()
    bold = "bold" in name or "black" in name or "heavy" in name
    italic = "italic" in name or "oblique" in name
    return bold, italic


def _visible(c: dict) -> bool:
    return c["size"] >= _MIN_VISIBLE_SIZE and not any(m in c["fontname"] for m in _IGNORED_FONT_MARKERS)


def _group_rows(chars: list[dict], tol: float = 2.0) -> list[list[dict]]:
    """Group characters into visual rows by their baseline."""
    rows: list[list[dict]] = []
    for c in sorted(chars, key=lambda c: (round(c["bottom"], 1), c["x0"])):
        if rows and abs(rows[-1][0]["bottom"] - c["bottom"]) <= tol:
            rows[-1].append(c)
        else:
            rows.append([c])
    for r in rows:
        r.sort(key=lambda c: c["x0"])
    return rows


def _rules(page) -> list[tuple[float, float, float]]:
    """Horizontal rules as (x0, x1, y)."""
    out = []
    for ln in page.lines:
        if abs(ln["top"] - ln["bottom"]) < 1.5 and ln["x1"] - ln["x0"] > 8:
            out.append((ln["x0"], ln["x1"], (ln["top"] + ln["bottom"]) / 2))
    for r in page.rects:
        if r["height"] < 1.5 and r["width"] > 8:
            out.append((r["x0"], r["x1"], (r["top"] + r["bottom"]) / 2))
    return out


def page_lines(page, page_no: int) -> list[Line]:
    chars = [c for c in page.chars if _visible(c)]
    rows = _group_rows(chars)
    rules = _rules(page)
    used_rules: set[int] = set()
    lines: list[Line] = []

    for row in rows:
        top = min(c["top"] for c in row)
        bottom = max(c["bottom"] for c in row)
        # rules drawn on this row's baseline (allow a little below the glyph bottom)
        blanks = [
            (i, r) for i, r in enumerate(rules) if i not in used_rules and bottom - 4 <= r[2] <= bottom + 4
        ]
        items: list[tuple[float, float, object]] = [(c["x0"], c["x1"], c) for c in row]
        for i, r in blanks:
            # A rule that spans the whole text block is a separator, not a blank.
            if r[1] - r[0] > 300:
                continue
            used_rules.add(i)
            items.append((r[0], r[1], None))
        items.sort(key=lambda t: t[0])

        spans: list[Span] = []
        prev_x1: float | None = None
        prev_size = 12.0
        for x0, x1, c in items:
            if c is None:
                if prev_x1 is not None and x0 - prev_x1 > 0.15 * prev_size:
                    _append_text(spans, " ", None)
                spans.append(Span("", blank=True, x0=x0, x1=x1))
                prev_x1 = x1
                continue
            text = c["text"]
            if prev_x1 is not None and x0 - prev_x1 > 0.2 * c["size"] and text != " ":
                _append_text(spans, " ", c)
            # explicit space characters: keep at most one
            if text == " " and spans and not spans[-1].blank and spans[-1].text.endswith(" "):
                prev_x1 = x1
                continue
            _append_text(spans, text, c)
            prev_x1 = x1
            prev_size = c["size"]
        # trim
        while spans and not spans[-1].blank and not spans[-1].text.strip():
            spans.pop()
        if spans and not spans[-1].blank:
            spans[-1].text = spans[-1].text.rstrip()
        if spans and not spans[0].blank:
            spans[0].text = spans[0].text.lstrip()
        spans = [s for s in spans if s.blank or s.text]
        if not spans:
            continue
        lines.append(
            Line(
                page_no,
                top,
                bottom,
                min(t[0] for t in items),
                spans,
                x1=max(t[1] for t in items),
                page_width=float(page.width),
            )
        )
    return lines


def _append_text(spans: list[Span], text: str, c: dict | None) -> None:
    if c is None:
        # a separator space: attach to the previous text span if any
        if spans and not spans[-1].blank:
            spans[-1].text += text
        else:
            spans.append(Span(text))
        return
    bold, italic = _font_flags(c["fontname"])
    size = round(c["size"], 1)
    if text == " " and spans and not spans[-1].blank:
        spans[-1].text += " "
        return
    if (
        spans
        and not spans[-1].blank
        and spans[-1].bold == bold
        and spans[-1].italic == italic
        and spans[-1].size == size
    ):
        spans[-1].text += text
        spans[-1].x1 = c["x1"]
        return
    # A pending space before a style change belongs to the earlier span.
    spans.append(Span(text, bold, italic, size, c["fontname"], x0=c["x0"], x1=c["x1"]))


def iter_lines(pdf_path: str, pages: Iterable[int] | None = None) -> Iterable[Line]:
    with pdfplumber.open(pdf_path) as pdf:
        idx = range(len(pdf.pages)) if pages is None else pages
        for i in idx:
            page = pdf.pages[i]
            yield from page_lines(page, i + 1)
            page.flush_cache()


# ---------------------------------------------------------------------------
# Layout cache: parsing 2,700 pages is slow, so persist lines as JSON Lines.


def _line_to_dict(line: Line) -> dict:
    return {
        "page": line.page,
        "top": round(line.top, 2),
        "bottom": round(line.bottom, 2),
        "x0": round(line.x0, 2),
        "x1": round(line.x1, 2),
        "w": line.page_width,
        "spans": [
            {"t": s.text, "s": s.style, "z": s.size, "f": s.font}
            if not s.blank
            else {"s": "blank", "x0": round(s.x0, 2), "x1": round(s.x1, 2)}
            for s in line.spans
        ],
    }


def _line_from_dict(d: dict) -> Line:
    spans = []
    for s in d["spans"]:
        if s["s"] == "blank":
            spans.append(Span("", blank=True, x0=s["x0"], x1=s["x1"]))
        else:
            st = s["s"]
            spans.append(Span(s["t"], "b" in st, "i" in st, s["z"], s["f"]))
    return Line(d["page"], d["top"], d["bottom"], d["x0"], spans, d["x1"], d["w"])


LAYOUT_VERSION = 1


def cached_lines(pdf_path, sha256: str, cache_dir) -> list[Line]:
    """All lines of a PDF, using a JSONL cache keyed by the PDF hash."""
    import json
    from pathlib import Path

    cache = Path(cache_dir) / f"layout-v{LAYOUT_VERSION}-{sha256[:16]}.jsonl"
    if cache.exists():
        with cache.open() as f:
            return [_line_from_dict(json.loads(ln)) for ln in f]
    lines = list(iter_lines(str(pdf_path)))
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".part")
    with tmp.open("w") as f:
        for ln in lines:
            f.write(json.dumps(_line_to_dict(ln), ensure_ascii=False) + "\n")
    tmp.replace(cache)
    return lines
