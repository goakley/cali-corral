"""Corpus-wide markup scan: which CALCRIM markup patterns occur, and how often.

Run after extraction:  calcrim-extract scan  (writes markup-scan.json)
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NOTE = re.compile(r"<[^<>]*>")


def strip_notes(s: str) -> str:
    return NOTE.sub("", s)


def paren_groups(s: str) -> list[str]:
    """Top-level-or-nested parenthesized groups that contain a slash."""
    out = []
    stack: list[int] = []
    for i, ch in enumerate(s):
        if ch == "(":
            stack.append(i)
        elif ch == ")" and stack:
            j = stack.pop()
            g = s[j + 1 : i]
            if "/" in g:
                out.append(g)
    return out


def max_depth(s: str, o: str, c: str) -> int:
    d = m = 0
    for ch in s:
        if ch == o:
            d += 1
            m = max(m, d)
        elif ch == c:
            d -= 1
    return m


def balance(s: str, o: str, c: str) -> int:
    return s.count(o) - s.count(c)


PRONOUNS = re.compile(r"\((?:he/she|him/her|his/her|his/hers|himself/herself)(?:/the[a-z]+)?\)", re.I)
THEY_PRINTED = re.compile(r"\((?:he/she/they|him/her/them|his/her/their)\)", re.I)
AGREE = re.compile(r"\((?:is/are|has/have|was/were|does/do|knows/know|believes/believe)\)", re.I)
PUNCT_CHOICE = re.compile(r"\((?:[^\w()]{1,4}/)+[^\w()]{1,4}\)|\([;,.]\s*\[(?:or|and)\]/[;,.]\)")
CONNECTOR = re.compile(r"/\[(or|and|nor|and/or)\]|\[,\]|\[;\]")
BARE_CHOICE = re.compile(r"\[[^\[\]()/<>]+/[^\[\]()<>]+\]")
CAP_CHOICE = re.compile(r"\(([A-Z])/([a-z])\)")
PLURAL = re.compile(r"\w\[s\]|\[es\]")
MULTI_DEF = re.compile(r"defendant\[s\]|defendant\[’s\]|\(he/she/they\)", re.I)
XREF = re.compile(r"(?:Instruction|CALCRIM No\.?|CALCRIM Nos\.)\s*(\d{3,4}[A-Z]?)")
EL_LABEL = re.compile(r"^\[?(\d+[A-Z]?(?:i{1,3}v?)?|\(\d+/\d+\)|\([A-Z]/[A-Z]\)|[a-h]|[ivx]+)\. ")


def scan(extracted_dir: Path) -> dict:
    files = sorted(p for p in extracted_dir.glob("*.json") if re.match(r"^\d{3,4}[A-Z]?$", p.stem))
    inst: Counter[str] = Counter()  # instructions containing the pattern
    occ: Counter[str] = Counter()  # total occurrences
    examples: dict[str, list[str]] = {}
    static = []
    unbalanced = []

    def hit(key: str, num: str, n: int = 1) -> None:
        if n <= 0:
            return
        occ[key] += n
        inst[key] += 1
        ex = examples.setdefault(key, [])
        if len(ex) < 6 and num not in ex:
            ex.append(num)

    for f in files:
        rec = json.loads(f.read_text())
        num = rec["number"]
        body: list[str] = rec["body"]
        text = "\n".join(body)
        plain = strip_notes(text)
        markup = any(ch in plain for ch in "[(/") or "______" in text or "<" in text
        if not re.search(r"[\[<]|______|\([^)]*/", text):
            static.append(num)
        hit("optional [ ]", num, plain.count("["))
        hit("nested brackets (depth >= 2)", num, int(max_depth(plain, "[", "]") >= 2))
        # multi-paragraph brackets
        depth = 0
        spans = 0
        for p in body:
            sp = strip_notes(p)
            for ch in sp:
                if ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
            if depth > 0:
                spans += 1
                depth = 0  # count each spanning start once, then resync
        hit("bracket spanning paragraphs", num, spans)
        groups = paren_groups(plain)
        hit("pick-one alternatives ( / )", num, len(groups))
        hit("nested alternatives", num, int(max_depth(plain, "(", ")") >= 2 and len(groups) > 1))
        hit("series connectors [or] [and] [,]", num, len(CONNECTOR.findall(plain)))
        hit("bare alternatives in brackets [a/b]", num, len(BARE_CHOICE.findall(plain)))
        hit("blank with insert hint", num, text.count("______ <"))
        hit("blank without hint", num, len(re.findall(r"______(?! <)", text)))
        hit(
            "inline note (not a blank hint)",
            num,
            len(re.findall(r"(?<!______ )<[^<>]*>", text))
            - sum(1 for p in body if re.fullmatch(r"<[^<>]*>", p)),
        )
        hit("standalone note paragraph", num, sum(1 for p in body if re.fullmatch(r"<[^<>]*>", p)))
        hit("labeled alternative note", num, len(re.findall(r"<Alternative", text)))
        hit("element paragraph", num, sum(1 for p in body if EL_LABEL.match(p)))
        hit(
            "sub-element labels (1A, 1Bi, a., i.)",
            num,
            sum(1 for p in body if re.match(r"^\[?(\d+[A-Z]i*|[a-h]|[ivx]+)\. ", p)),
        )
        hit("computed element number (4/5).", num, sum(1 for p in body if re.match(r"^\[?\(\d+/\d+\)\. ", p)))
        hit("conjunction AND/OR (unbracketed)", num, sum(1 for p in body if p in ("AND", "OR")))
        hit("conjunction [AND]/[OR]", num, sum(1 for p in body if p in ("[AND]", "[OR]")))
        hit("[AND inside optional element", num, sum(1 for p in body if p in ("[AND", "[OR")))
        hit("(;/.) end punctuation", num, text.count("(;/.)"))
        hit("other choice-dependent punctuation", num, len(PUNCT_CHOICE.findall(plain)) - text.count("(;/.)"))
        hit("pronoun alternatives", num, len(PRONOUNS.findall(plain)))
        hit("pronoun alternatives with printed they-form", num, len(THEY_PRINTED.findall(plain)))
        hit("verb agreement alternatives (is/are)", num, len(AGREE.findall(plain)))
        hit("capitalization choice (Y/y)", num, len(CAP_CHOICE.findall(plain)))
        hit("plural markers [s]", num, len(PLURAL.findall(plain)))
        hit("multi-defendant markers", num, len(MULTI_DEF.findall(plain)))
        hit("emphasis (italic terms)", num, text.count("*") // 2)
        hit("bullet items", num, sum(1 for p in body if p.startswith("• ")))
        refs = {m for m in XREF.findall(text) if m != num}
        hit("cross-reference to another instruction", num, len(refs))
        # repeated identical optional paragraphs (repeatable slots)
        reps = [p for p, n in Counter(body).items() if n > 1 and p.startswith("[")]
        hit("repeated identical paragraphs (repeat-as-needed slots)", num, len(reps))
        b1, b2 = balance(plain, "[", "]"), balance(plain, "(", ")")
        if b1 or b2:
            unbalanced.append({"number": num, "brackets": b1, "parens": b2})
            hit("unbalanced [ ] or ( ) in official text", num)
        if not markup:
            pass

    return {
        "instructions": len(files),
        "static_instructions": {"count": len(static), "numbers": static},
        "patterns": {
            k: {"instructions": inst[k], "occurrences": occ[k], "examples": examples.get(k, [])}
            for k in sorted(inst, key=lambda k: -inst[k])
        },
        "unbalanced": unbalanced,
    }


def main(extracted_dir: Path, out: Path) -> dict:
    result = scan(extracted_dir)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result
