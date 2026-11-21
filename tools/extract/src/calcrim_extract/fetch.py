"""Polite, cached, sequential HTTP fetching for courts.ca.gov.

Rules (see CLAUDE.md):
- every response is cached locally under ``.cache/sources/`` (gitignored);
- repeat requests are conditional (ETag / If-Modified-Since);
- the User-Agent identifies the project and carries a contact address taken
  from the ``CALI_CORRAL_CONTACT`` environment variable (never hardcoded);
- requests are strictly sequential, with a minimum delay between them.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from . import __version__
from .paths import CACHE_DIR, REPO_ROOT

MIN_DELAY_SECONDS = 3.0
_last_request_at = 0.0


class ContactNotSet(RuntimeError):
    pass


def load_dotenv(path: Path = REPO_ROOT / ".env") -> None:
    """Minimal .env loader (KEY=VALUE lines); existing env vars win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.removeprefix("export ").strip()
        os.environ.setdefault(key, value.strip().strip("'\""))


def user_agent() -> str:
    load_dotenv()
    contact = os.environ.get("CALI_CORRAL_CONTACT", "").strip()
    if not contact:
        raise ContactNotSet(
            "CALI_CORRAL_CONTACT is not set. Set it (see .env.example) before fetching "
            "from courts.ca.gov."
        )
    return f"CaliCorral-extract/{__version__} (open-source CALCRIM drafting tool; contact: {contact})"


@dataclass
class Fetched:
    url: str
    path: Path
    sha256: str
    from_cache: bool
    status: int


def _cache_paths(url: str) -> tuple[Path, Path]:
    parsed = urllib.parse.urlparse(url)
    name = Path(parsed.path).name or "index.html"
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    body = CACHE_DIR / f"{key}-{name}"
    return body, body.with_name(body.name + ".meta.json")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, *, offline: bool = False) -> Fetched:
    """Fetch ``url`` politely, returning the cached copy when unchanged.

    With ``offline=True`` no request is made; the cached copy must exist.
    """
    global _last_request_at
    body_path, meta_path = _cache_paths(url)
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    if offline:
        if not body_path.exists():
            raise FileNotFoundError(f"not cached (offline mode): {url}")
        return Fetched(url, body_path, meta.get("sha256") or _sha256(body_path), True, 304)

    headers = {"User-Agent": user_agent()}
    if body_path.exists():
        if meta.get("etag"):
            headers["If-None-Match"] = meta["etag"]
        if meta.get("last_modified"):
            headers["If-Modified-Since"] = meta["last_modified"]

    wait = MIN_DELAY_SECONDS - (time.monotonic() - _last_request_at)
    if wait > 0:
        time.sleep(wait)

    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        status = resp.status
    except urllib.error.HTTPError as e:
        if e.code == 304 and body_path.exists():
            _last_request_at = time.monotonic()
            return Fetched(url, body_path, meta.get("sha256") or _sha256(body_path), True, 304)
        raise
    finally:
        _last_request_at = time.monotonic()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = body_path.with_suffix(body_path.suffix + ".part")
    with resp, tmp.open("wb") as f:
        while chunk := resp.read(1 << 20):
            f.write(chunk)
        etag = resp.headers.get("ETag")
        last_modified = resp.headers.get("Last-Modified")
        content_type = resp.headers.get("Content-Type")
    tmp.replace(body_path)
    digest = _sha256(body_path)
    meta_path.write_text(
        json.dumps(
            {
                "url": url,
                "etag": etag,
                "last_modified": last_modified,
                "content_type": content_type,
                "sha256": digest,
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
    )
    return Fetched(url, body_path, digest, False, status)
