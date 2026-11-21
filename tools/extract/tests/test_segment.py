from calcrim_extract.layout import Line, Span
from calcrim_extract.segment import is_title, paragraphs, section_heading, segment


def line(page, top, text, *, x0=60.0, x1=None, font="Times-Bold", size=12.0, italic=False):
    sp = Span(text, bold="Bold" in font, italic=italic, size=size, font=font)
    return Line(page, top, top + size, x0, [sp], x1 if x1 is not None else x0 + 6 * len(text), 513)


def test_title_and_sections():
    t = line(1, 80, "945. Battery Against Peace Officer", font="Helvetica-Bold")
    assert is_title(t)
    assert not is_title(line(1, 80, "945. Battery", font="Times-Roman", size=11))
    assert section_heading(line(1, 80, "BENCH NOTES", font="Helvetica-Bold")) == "BENCH NOTES"


def test_segment_excludes_secondary_sources():
    lines = [
        line(1, 80, "100. Test Instruction", font="Helvetica-Bold"),
        line(1, 120, "Body text."),
        line(1, 140, "New January 2006", font="Times-Italic", size=11, italic=True),
        line(1, 160, "BENCH NOTES", font="Helvetica-Bold"),
        line(1, 180, "Duty text.", font="Times-Roman", size=11),
        line(1, 200, "SECONDARY SOURCES", font="Helvetica-Bold"),
        line(1, 220, "1 Witkin ...", font="Times-Roman", size=11),
        line(2, 36, "RUNNING HEADER", size=11),
        line(2, 650, "12", font="Times-Roman", size=11),
    ]
    (raw,) = segment(lines)
    assert raw.number == "100"
    assert [ln.text for ln in raw.body] == ["Body text."]
    assert [ln.text for ln in raw.revision] == ["New January 2006"]
    assert [ln.text for ln in raw.sections["bench_notes"]] == ["Duty text."]
    assert raw.excluded_line_count == 1


def test_paragraph_gaps():
    lines = [line(1, 100, "one"), line(1, 113, "two"), line(1, 132, "three")]
    paras = paragraphs(lines, {1: 60.0})
    assert [p.lines for p in paras] == [["one", "two"], ["three"]]


def test_paragraph_continues_across_page_when_line_full():
    lines = [line(1, 600, "x" * 60, x1=430), line(2, 64, "continued")]
    paras = paragraphs(lines, {1: 60.0, 2: 60.0})
    assert len(paras) == 1


def test_paragraph_breaks_across_page_when_line_short():
    lines = [line(1, 600, "x" * 60, x1=430), line(1, 613, "end.", x1=90), line(2, 64, "Next")]
    paras = paragraphs(lines, {1: 60.0, 2: 60.0})
    assert len(paras) == 2


def test_paragraph_breaks_across_page_on_dedent():
    lines = [line(1, 600, "• [item?]", x0=84, x1=430), line(2, 64, "Do not", x0=60)]
    paras = paragraphs(lines, {1: 60.0, 2: 60.0})
    assert len(paras) == 2
