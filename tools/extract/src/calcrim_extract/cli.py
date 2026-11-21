"""calcrim-extract: download, extract and normalize the official CALCRIM PDFs.

Usage:
    calcrim-extract download [--sources FILE]
    calcrim-extract extract  [--sources FILE]   (cached PDFs only, no network)
    calcrim-extract all      [--sources FILE]   (download, then extract)
    calcrim-extract scan     [--sources FILE]   (corpus-wide markup statistics)

`download` fetches each source PDF politely (cached, conditional, sequential).
`extract` writes one JSON record per instruction to data/extracted/<release>/,
plus index.json, sources.json and report.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

from . import __version__
from .extract import SourceFile, build_record, collect_hyphen_words
from .fetch import fetch
from .layout import cached_lines
from .normalize import unexpected_chars
from .paths import CACHE_DIR, EXTRACTED_DIR
from .segment import page_margins, segment
from .toc import parse_edition_toc, parse_supplement_toc

DEFAULT_SOURCES = Path(__file__).resolve().parents[2] / "sources.json"
LAYOUT_CACHE = CACHE_DIR.parent / "layout"


def _sort_key(num: str) -> tuple[int, str]:
    m = re.match(r"(\d+)(.*)", num)
    assert m
    return int(m.group(1)), m.group(2)


def load_sources(path: Path) -> dict:
    return json.loads(path.read_text())


def cmd_download(cfg: dict, offline: bool = False) -> list[tuple[SourceFile, Path]]:
    out = []
    for f in sorted(cfg["files"], key=lambda f: f["order"]):
        got = fetch(f["url"], offline=offline)
        status = "cached" if got.from_cache else "downloaded"
        print(f"{status}: {f['url']} sha256={got.sha256}", file=sys.stderr)
        out.append((SourceFile(f["key"], f["url"], got.sha256, f["label"], f["kind"], f["order"]), got.path))
    return out


def cmd_extract(cfg: dict, offline: bool) -> int:
    files = cmd_download(cfg, offline=offline)
    out_dir = EXTRACTED_DIR / cfg["release"]

    per_file: list[tuple[SourceFile, list[dict], dict]] = []
    all_lines = []
    loaded = []
    for src, path in files:
        lines = cached_lines(path, src.sha256, LAYOUT_CACHE)
        loaded.append((src, lines))
        all_lines.extend(lines)
    hyphen_words = collect_hyphen_words(all_lines)

    for src, lines in loaded:
        margins = page_margins(lines)
        raws = segment(lines)
        records = [build_record(r, src, margins, hyphen_words) for r in raws]
        toc = parse_edition_toc(lines) if src.kind == "edition" else parse_supplement_toc(lines)
        per_file.append((src, records, {"toc": toc, "pages": max(ln.page for ln in lines)}))

    # Merge: later files supersede earlier ones, instruction by instruction.
    merged: dict[str, dict] = {}
    reserved: dict[str, dict] = {}
    report_files = []
    for src, records, info in per_file:
        toc = info["toc"]
        extracted = {r["number"] for r in records}
        placeholder = {r["number"] for r in records if r["title"].startswith("Reserved for Future Use")}
        expected = toc.instructions
        report_files.append(
            {
                "key": src.key,
                "kind": src.kind,
                "sha256": src.sha256,
                "pages": info["pages"],
                "toc_entries": len(toc.entries),
                "toc_reserved_single_numbers": sorted(toc.reserved, key=_sort_key),
                "toc_reserved_ranges": len(toc.reserved_ranges),
                "expected_instructions": len(expected),
                "extracted_records": len(records),
                "reserved_placeholder_pages": sorted(placeholder, key=_sort_key),
                "extracted_instructions": len(extracted - placeholder),
                "missing": sorted(expected - extracted, key=_sort_key),
                "unexpected": sorted((extracted - placeholder) - expected, key=_sort_key),
                "supplement_status": dict(
                    sorted(toc.supplement_status.items(), key=lambda kv: _sort_key(kv[0]))
                ),
            }
        )
        for rec in records:
            num = rec["number"]
            if num in placeholder:
                reserved[num] = {"number": num, "source": rec["source"]}
                continue
            if num in merged:
                rec["supersedes"] = {
                    "file": merged[num]["source"]["file"],
                    "revision_line": merged[num]["revision_line"],
                }
            if src.kind == "supplement":
                rec["supplement_status"] = toc.supplement_status.get(num)
            merged[num] = rec

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.json"):
        old.unlink()
    for num, rec in merged.items():
        (out_dir / f"{num}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")

    warnings = Counter()
    char_issues: Counter[str] = Counter()
    for rec in merged.values():
        for w in rec["warnings"]:
            warnings[w.split(":")[0]] += 1
        for p in rec["body"]:
            for c in unexpected_chars(p):
                char_issues[c] += 1

    index = {
        "release": cfg["release"],
        "release_label": cfg["release_label"],
        "extractor_version": __version__,
        "instructions": [
            {
                "number": num,
                "title": rec["title"],
                "file": rec["source"]["file"],
                "revision_line": rec["revision_line"],
                "warnings": len(rec["warnings"]),
            }
            for num, rec in sorted(merged.items(), key=lambda kv: _sort_key(kv[0]))
        ],
        "reserved_numbers": sorted(
            set(reserved) | {n for _, _, i in per_file for n in i["toc"].reserved}, key=_sort_key
        ),
    }
    (out_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    (out_dir / "sources.json").write_text(
        json.dumps(
            {
                "release": cfg["release"],
                "release_label": cfg["release_label"],
                "files": [
                    {
                        "key": s.key,
                        "kind": s.kind,
                        "order": s.order,
                        "label": s.release,
                        "url": s.url,
                        "sha256": s.sha256,
                    }
                    for s, _ in files
                ],
            },
            indent=2,
        )
        + "\n"
    )
    report = {
        "release": cfg["release"],
        "files": report_files,
        "merged_instructions": len(merged),
        "warnings": dict(warnings.most_common()),
        "unexpected_characters": {f"U+{ord(c):04X} {c}": n for c, n in char_issues.most_common()},
    }
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="calcrim-extract")
    ap.add_argument("command", choices=["download", "extract", "all", "scan"])
    ap.add_argument("--sources", type=Path, default=DEFAULT_SOURCES)
    ap.add_argument("--offline", action="store_true", help="use cached PDFs only; no network")
    args = ap.parse_args(argv)
    cfg = load_sources(args.sources)
    if args.command == "download":
        cmd_download(cfg)
        return 0
    if args.command == "scan":
        from .scan import main as scan_main

        out_dir = EXTRACTED_DIR / cfg["release"]
        res = scan_main(out_dir, out_dir / "markup-scan.json")
        for k, v in res["patterns"].items():
            print(f"{v['instructions']:4d} instr  {v['occurrences']:5d} occ  {k}")
        print(f"static: {res['static_instructions']['count']} of {res['instructions']}")
        return 0
    # `extract` works from the local cache only; `all` refreshes the cache first.
    return cmd_extract(cfg, offline=args.offline or args.command == "extract")


if __name__ == "__main__":
    raise SystemExit(main())
