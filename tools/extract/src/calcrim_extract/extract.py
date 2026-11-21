"""Build per-instruction JSON records from the official PDFs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from . import __version__
from .layout import Line
from .normalize import (
    canonical_spacing,
    fix_glyphs,
    join_lines,
    normalize_paragraph,
    unexpected_chars,
)
from .segment import RawInstruction, page_margins, paragraphs, segment

RECORD_VERSION = 1


@dataclass
class SourceFile:
    key: str  # short stable id, e.g. "calcrim-2026"
    url: str
    sha256: str
    release: str  # human label, e.g. "2026 edition (Judicial Council, February 2026)"
    kind: str  # "edition" | "supplement"
    order: int  # later files supersede earlier ones


def _title(raw: RawInstruction) -> str:
    text = normalize_paragraph(raw.title_lines)
    m = re.match(r"^(\d{3,4}[A-Z]?)\.\s+(.*)$", text)
    return m.group(2) if m else text


def _revision(lines: list[Line]) -> tuple[str | None, str | None]:
    """The revision history line, plus any legend that follows it.

    The supplement marks some dates with a literal asterisk and explains it on
    a following line ("* Denotes changes only to bench notes ..."). The
    revision line is entirely italic, so no emphasis markup is applied.
    """
    main: list[str] = []
    legend: list[str] = []
    for ln in lines:
        text = fix_glyphs(ln.text).strip()
        (legend if legend or text.startswith("*") else main).append(text)
    join = lambda xs: canonical_spacing(join_lines(xs)) if xs else None  # noqa: E731
    return join(main), join(legend)


def _strip_em(s: str) -> str:
    return s.replace("*", "")


def _section_paragraphs(lines: list[Line], margins: dict[int, float], hyphen_words: set[str]):
    out = []
    for p in paragraphs(lines, margins):
        text = normalize_paragraph(p.lines, hyphen_words)
        heading = p.style == "bi" and len(p.lines) == 1 and len(text) < 120
        out.append({"heading": True, "text": _strip_em(text)} if heading else {"text": text})
    return out


def build_record(
    raw: RawInstruction, source: SourceFile, margins: dict[int, float], hyphen_words: set[str]
) -> dict:
    warnings = list(raw.warnings)
    body_paras = paragraphs(raw.body, margins)
    body = []
    indents = []
    for p in body_paras:
        # Instruction text is typeset without hyphenation: every line-end
        # hyphen is a real one, so never drop it (hyphen_words=None).
        text = normalize_paragraph(p.lines, None)
        bad = unexpected_chars(text)
        if bad:
            warnings.append(f"unexpected characters in body: {''.join(sorted(bad))!r}")
        body.append(text)
        indents.append(p.indent)
    revision, revision_legend = _revision(raw.revision)
    if revision is None:
        warnings.append("no revision line found")
    if not body:
        warnings.append("empty body")

    sections = {
        key: _section_paragraphs(lines, margins, hyphen_words) for key, lines in raw.sections.items()
    }
    return {
        "record_version": RECORD_VERSION,
        "extractor_version": __version__,
        "number": raw.number,
        "title": _title(raw),
        "source": {
            "file": source.key,
            "url": source.url,
            "sha256": source.sha256,
            "release": source.release,
            "pages": [raw.first_page, raw.last_page],
        },
        "revision_line": revision,
        "revision_legend": revision_legend,
        "body": body,
        "body_indents": indents,
        "bench_notes": sections,
        "excluded": {"secondary_sources_lines": raw.excluded_line_count},
        "warnings": warnings,
    }


def collect_hyphen_words(all_lines: list[Line]) -> set[str]:
    """Words that appear unhyphenated mid-line somewhere in the corpus.

    Used to decide whether a hyphen at a line end is a soft (typesetting)
    hyphen: if the joined word appears elsewhere unhyphenated and the
    hyphenated form never appears mid-line, the hyphen is dropped.
    """
    plain: set[str] = set()
    hyphenated: set[str] = set()
    for ln in all_lines:
        text = fix_glyphs(ln.text)
        words = re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)*", text)
        # ignore the last token (may be broken across lines)
        for w in words[:-1] if text.rstrip().endswith("-") else words:
            if "-" in w:
                hyphenated.add(w.lower().replace("-", ""))
            else:
                plain.add(w.lower())
    return plain - hyphenated


def extract_file(
    lines: list[Line], source: SourceFile, hyphen_words: set[str]
) -> tuple[list[dict], list[RawInstruction]]:
    margins = page_margins(lines)
    raws = segment(lines)
    return [build_record(r, source, margins, hyphen_words) for r in raws], raws


def write_records(records: list[dict], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for rec in records:
        path = out_dir / f"{rec['number']}.json"
        path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
