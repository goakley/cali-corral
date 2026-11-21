# Cali Corral

A free, open-source, offline-capable drafting tool that turns CALCRIM (California criminal jury instructions) templates into finished proposed instructions. **Not official**: not affiliated with or endorsed by the Judicial Council of California. Instruction text is the Judicial Council's work, freely reproducible under Cal. Rules of Court, rule 2.1050(c); the official instructions are published on courts.ca.gov.

Status: Phase 0 (foundations). See `docs/SPEC.md`, `docs/design/technical-design.md` and `docs/design/phase-0-findings.md`.

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
cd tools/extract && uv sync && uv run pytest
```

## License

Code: MIT. Template structure and annotations: CC0. Instruction text: Judicial Council of California (attributed, not claimed).
