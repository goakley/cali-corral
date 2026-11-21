"""Normalization of official CALCRIM text.

The output of this module is the *canonical source text* that the
TypeScript engine's source mode must reproduce character for character (the
round-trip test). Every rule here must therefore be mirrored by, or be
irrelevant to, the engine. The rules are documented in
``docs/design/technical-design.md`` ("Normalization").

Canonical source text conventions (one string per paragraph):

- ``______``   a drawn fill-in blank (always exactly six underscores)
- ``<...>``    a drafter note or insert hint, printed in italics officially
- ``*...*``    emphasis: italic text outside angle brackets (defined terms)
- everything else is literal, including ``[ ] ( ) /``
"""

from __future__ import annotations

import re
import unicodedata

BLANK = "______"
EM_ON = "\x01"
EM_OFF = "\x02"

LIGATURES = {
    "ﬀ": "ff",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
    "ﬅ": "st",
    "ﬆ": "st",
}

# Characters that are expected in official text. Anything else is reported.
_ALLOWED = set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?'\"()[]<>/-&%$#@+=§¶—–‘’“”…•é"
)


def fix_glyphs(text: str) -> str:
    """Repair known PDF glyph artifacts and apply Unicode NFC."""
    for lig, rep in LIGATURES.items():
        text = text.replace(lig, rep)
    # Italic "fi" ligatures in the edition extract as "f" + dotless i (U+0131).
    text = text.replace("fı", "fi")
    text = text.replace(" ", " ")
    text = text.replace("­", "")  # soft hyphen
    return unicodedata.normalize("NFC", text)


def unexpected_chars(text: str) -> set[str]:
    """Characters outside the expected repertoire, ignoring our own markup."""
    text = text.replace(BLANK, "").replace("*", "")
    return {c for c in text if c not in _ALLOWED and c not in (EM_ON, EM_OFF)}


def join_lines(lines: list[str], hyphen_words: set[str] | None = None) -> str:
    """Join the visual lines of one paragraph.

    - a line ending in ``/`` or an em/en dash joins with no space;
    - a line ending in ``-`` joins with no space, keeping the hyphen, unless
      the de-hyphenated word is known (``hyphen_words``) to be a word that the
      corpus never hyphenates, in which case the hyphen is dropped;
    - otherwise lines join with a single space.
    """
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if not out:
            out = line
            continue
        plain_end = out.rstrip(EM_OFF)
        if plain_end.endswith(("/", "—", "–")):
            out += line
        elif plain_end.endswith("-") and not plain_end.endswith("--"):
            m = re.search(r"([A-Za-z]+)-[" + EM_OFF + r"]*$", out)
            n = re.match(r"[" + EM_ON + r"]*([A-Za-z]+)", line)
            if m and n and hyphen_words is not None:
                joined = (m.group(1) + n.group(1)).lower()
                if joined in hyphen_words:
                    out = out[: m.end(1)] + out[m.end(1) + 1 :] + line
                    continue
            out += line
        else:
            out += " " + line
    return out


def canonical_spacing(text: str) -> str:
    text = re.sub(r"[ \t\n]+", " ", text)
    # A space just after an opening bracket or parenthesis is a glyph-
    # positioning artifact ("[ or]"). (A space before a closing bracket can be
    # real: "[As used here, ](M/m)atter".)
    # When the glyph gap put the space after the bracket instead of before it
    # ("charged[ in Count"), move it before the bracket.
    text = re.sub(r"([^\s/(\[])([(\[]) +", r"\1 \2", text)
    text = re.sub(r"([(\[]) +", r"\1", text)
    # Spacing after a slash is not significant: officially both "a/ [or] b"
    # and "a/[or] b" occur, sometimes only because of a line break.
    text = re.sub(r"/ +", "/", text)
    # Normalize blank runs and the space between a blank and its insert note.
    text = re.sub(r"_{2,}", BLANK, text)
    text = re.sub(BLANK + r" *(?=[" + EM_ON + EM_OFF + r"]*<)", BLANK + " ", text)
    # A drawn blank followed by punctuation sometimes leaves a layout gap.
    text = re.sub(BLANK + r" +(?=[.,;:)\]])", BLANK, text)
    return text.strip()


def _touches_note(text: str, i: int, n: int) -> bool:
    """True if an opening italic marker sits right before a note (only spaces
    or other markers between it and the note's ``<``)."""
    j = i + 1
    while j < n and text[j] in (" ", EM_ON, EM_OFF):
        j += 1
    return j < n and text[j] == "<"


def resolve_emphasis(text: str) -> str:
    """Turn italic markers into ``*...*`` outside angle brackets.

    Notes (``<...>``) are italic officially, so no emphasis is emitted inside
    or around them: an italic run that reaches a note is closed before the
    ``<`` and, if it continues past the ``>``, reopened after it. Emitted
    markers are always balanced. Whitespace is moved outside emphasis, and
    emphasis covering only punctuation is dropped.
    """
    out: list[str] = []
    depth = 0
    italic = False  # raw state from the markers
    open_ = False  # an emitted EM_ON is open
    n = len(text)
    for i, ch in enumerate(text):
        if ch == EM_ON:
            italic = True
            if depth == 0 and not open_ and not _touches_note(text, i, n):
                out.append(EM_ON)
                open_ = True
            continue
        if ch == EM_OFF:
            italic = False
            if open_:
                out.append(EM_OFF)
                open_ = False
            continue
        if ch == "<":
            if open_:
                out.append(EM_OFF)
                open_ = False
            depth += 1
            out.append(ch)
            continue
        if ch == ">" and depth:
            depth -= 1
            out.append(ch)
            j = i + 1
            while j < n and text[j] == " ":
                j += 1
            if depth == 0 and italic and j < n and text[j] not in (EM_OFF, EM_ON, "<"):
                out.append(EM_ON)
                open_ = True
            continue
        out.append(ch)
    if open_:
        out.append(EM_OFF)
    s = "".join(out)
    # Emphasis that starts just inside a choice ("(*M/m)atter*") snaps
    # outward so it encloses the choice ("*(M/m)atter*"). Only for a
    # parenthesized group containing a slash, i.e. an alternative.
    s = re.sub(r"\(" + EM_ON + r"(?=[^()]*/[^()]*\))", EM_ON + "(", s)
    # merge adjacent emphasis separated only by whitespace
    s = re.sub(EM_OFF + r"(\s*)" + EM_ON, r"\1", s)
    # move whitespace outside emphasis
    s = re.sub(EM_ON + r"(\s+)", r"\1" + EM_ON, s)
    s = re.sub(r"(\s+)" + EM_OFF, EM_OFF + r"\1", s)
    s = re.sub(EM_ON + EM_OFF, "", s)
    # emphasis covering only punctuation is typographic noise
    s = re.sub(EM_ON + r"([^\w" + EM_ON + EM_OFF + r"]*)" + EM_OFF, r"\1", s)
    return s.replace(EM_ON, "*").replace(EM_OFF, "*")


def normalize_paragraph(lines: list[str], hyphen_words: set[str] | None = None) -> str:
    text = join_lines([fix_glyphs(ln) for ln in lines], hyphen_words)
    text = canonical_spacing(text)
    text = resolve_emphasis(text)
    return canonical_spacing(text)
