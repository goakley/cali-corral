from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
CACHE_DIR = REPO_ROOT / ".cache" / "sources"
DATA_DIR = REPO_ROOT / "data"
EXTRACTED_DIR = DATA_DIR / "extracted"
