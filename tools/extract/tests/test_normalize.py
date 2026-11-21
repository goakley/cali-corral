from calcrim_extract.normalize import (
    BLANK,
    EM_OFF,
    EM_ON,
    canonical_spacing,
    fix_glyphs,
    join_lines,
    normalize_paragraph,
    resolve_emphasis,
    unexpected_chars,
)


def em(s: str) -> str:
    return EM_ON + s + EM_OFF


def test_ligatures_and_dotless_i():
    assert fix_glyphs("ofﬁcer ﬂee") == "officer flee"
    # italic fi ligature extracts as f + U+0131
    assert fix_glyphs("offıcer") == "officer"


def test_soft_hyphen_and_nbsp():
    assert fix_glyphs("a b­c") == "a bc"


def test_slash_spacing_is_canonical():
    assert canonical_spacing("(in self-defense/ [or] in defense)") == "(in self-defense/[or] in defense)"


def test_blank_canonical_form():
    assert canonical_spacing("Count ____]") == f"Count {BLANK}]"
    assert canonical_spacing(f"{BLANK}<insert name>") == f"{BLANK} <insert name>"
    assert canonical_spacing(f"{BLANK}   <insert name>") == f"{BLANK} <insert name>"


def test_join_lines_rules():
    assert join_lines(["the (a/", "an) officer"]) == "the (a/an) officer"
    assert join_lines(["self-", "defense"]) == "self-defense"
    assert join_lines(["one", "two"]) == "one two"
    assert join_lines(["a—", "b"]) == "a—b"


def test_join_lines_soft_hyphen_dictionary():
    assert join_lines(["Institu-", "tion"], {"institution"}) == "Institution"
    assert join_lines(["self-", "defense"], {"institution"}) == "self-defense"
    assert join_lines(["Institu-", "tion"], None) == "Institu-tion"


def test_emphasis_outside_notes_only():
    s = "an act " + em("willfully ") + "when"
    assert resolve_emphasis(s) == "an act *willfully* when"
    # notes are italic officially; no emphasis markup inside or around them
    s = BLANK + em(" <insert name>") + " was"
    assert resolve_emphasis(s) == BLANK + " <insert name> was"


def test_emphasis_merges_across_lines():
    got = normalize_paragraph(["is an " + em("executive"), em("officer") + "."])
    assert got == "is an *executive officer*."


def test_emphasis_on_punctuation_dropped():
    assert resolve_emphasis("peace officer" + em(".") + "]") == "peace officer.]"


def test_unexpected_chars_ignores_markup():
    assert unexpected_chars(f"*a* {BLANK} <b>") == set()
    assert unexpected_chars("xı") == {"ı"}


def test_emphasis_balanced_when_run_continues_past_note():
    # 560: an italic run covers a note and a closing quote after it
    s = "[" + BLANK + em(" <insert additional theories>”") + "]."
    assert resolve_emphasis(s) == "[" + BLANK + " <insert additional theories>”]."


def test_emphasis_reopens_after_note():
    s = em("<note> defined term") + " rest"
    assert resolve_emphasis(s) == "<note> *defined term* rest"


def test_bracket_inner_spacing_and_blank_punctuation():
    assert canonical_spacing("(sent/[ or] brought)") == "(sent/[or] brought)"
    assert canonical_spacing("[As used here, ](M/m)atter") == "[As used here, ](M/m)atter"
    assert canonical_spacing(f"guilty of {BLANK} .") == f"guilty of {BLANK}."


def test_emphasis_split_at_markup():
    assert resolve_emphasis("(" + em("M/m)atter") + " means") == "(*M*/*m*)*atter* means"
    s = "The term[s] " + em("(great bodily injury[,]/deadly weapon[,]/") + "[and] " + em(".50 BMG rifle)")
    want = "The term[s] (*great bodily injury*[,]/*deadly weapon*[,]/[and] *.50 BMG rifle*)"
    assert resolve_emphasis(s) == want


def test_emphasis_not_snapped_out_of_brackets_or_citations():
    assert resolve_emphasis("[" + em("Great bodily injury") + " means") == "[*Great bodily injury* means"
    assert resolve_emphasis("(" + em("People v. Doe") + ")") == "(*People v. Doe*)"


def test_space_after_bracket_moves_before_it():
    assert canonical_spacing("is charged[ in Count") == "is charged [in Count"


def test_space_move_after_paren():
    assert canonical_spacing("violence)[ and") == "violence) [and"
    assert canonical_spacing("(a/[ or] b)") == "(a/[or] b)"
    assert canonical_spacing("[[ For (the/any) count") == "[[For (the/any) count"
