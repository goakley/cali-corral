# 0002. Source PDFs are cached locally, not committed

Date: 2026-11-20 · Status: accepted (owner, 2026-11-20)

## Context

The official CALCRIM PDFs are large (the 2026 edition is ~84 MB). CI needs the official text for the round-trip test, but must not download from courts.ca.gov on every run.

## Decision

- Downloads go to `.cache/sources/` (gitignored) through a fetcher that sends conditional requests, a User-Agent with a contact address from `CALI_CORRAL_CONTACT`, and never fetches in parallel.
- The repo commits the extracted, normalized per-instruction JSON under `data/extracted/<release>/` plus a `sources.json` recording each PDF's URL, SHA-256 and release.
- CI reads only the committed JSON. Anyone can re-download the PDFs and check the hashes to reproduce the extraction.
