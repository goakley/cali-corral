# calcrim-extract

Maintainer tooling: download the official CALCRIM PDFs from courts.ca.gov (politely), extract one JSON record per instruction, and scan markup statistics. See `docs/design/technical-design.md` §2–3.

```sh
uv sync
uv run calcrim-extract download   # needs CALI_CORRAL_CONTACT (see ../../.env.example)
uv run calcrim-extract extract    # from .cache only; writes data/extracted/<release>/
uv run calcrim-extract scan       # writes markup-scan.json
uv run pytest
```

Sources are listed in `sources.json`: the most recent full edition plus every later supplement.
