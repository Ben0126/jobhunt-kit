"""Job sources: where postings come from. Every source is a function `fetch(spec, ctx) -> list[Job]`.

Built in:
  simplify   a SimplifyJobs-style `listings.json` (Summer2027-Internships, New-Grad-Positions, …)
  ats        company career sites read through their public ATS APIs (Greenhouse, Lever, Ashby, Workday, …)
  module     your own Python file: `sources/my_board.py` defining `fetch(spec, ctx) -> list[Job | dict]`

In jobhunt.yaml:

    sources:
      - type: simplify
        repo: SimplifyJobs/Summer2027-Internships
      - type: ats
        companies:
          - {company: Skydio, ats: greenhouse, board: skydio}
      - type: module
        name: my-board
        path: sources/my_board.py

Each entry may set `name` (default: its type). Names must be unique: they prefix job ids and track
per-source state (first-run baseline, failure carry-over). List the source you trust most first —
when two sources list the same job, the earlier one keeps the row and the later one goes into `also`.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from jobhunt.config import Config
from jobhunt.jobs.model import Job

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/129.0 Safari/537.36")


class SourceError(Exception):
    pass


def http(url, body=None, headers=None, raw=False, timeout=30, retries=3, backoff=5):
    """GET (body=None) or POST JSON → parsed JSON (or text with raw=True). Raises SourceError."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET", headers={
        "User-Agent": UA, "Accept": "application/json, text/html;q=0.9", "Accept-Language": "en-US,en;q=0.9",
        **({"Content-Type": "application/json"} if data else {}), **(headers or {})})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode("utf-8", errors="replace")
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < retries:
                time.sleep(backoff * 2 ** attempt)
                continue
            raise SourceError(f"HTTP {e.code}: {url[:90]}") from e
        except Exception as e:  # noqa: BLE001 — network trouble
            raise SourceError(f"can't connect ({type(e).__name__}): {url[:90]}") from e
    if raw:
        return text
    try:
        return json.loads(text)
    except ValueError as e:
        raise SourceError(f"response is not JSON: {url[:90]}") from e


@dataclass
class Context:
    cfg: Config
    today: dt.date
    get: Callable = http                       # swapped out in tests
    warnings: list[str] = field(default_factory=list)

    @property
    def search(self) -> dict:
        return self.cfg["search"]


def _module_fetch(spec: dict, ctx: Context):
    path = Path(spec.get("path") or "")
    if not path.is_absolute():
        path = ctx.cfg.root / path
    if not path.exists():
        raise SourceError(f"module source {path} not found")
    mod_spec = importlib.util.spec_from_file_location(f"jobhunt_user_source_{path.stem}", path)
    module = importlib.util.module_from_spec(mod_spec)
    mod_spec.loader.exec_module(module)
    if not hasattr(module, "fetch"):
        raise SourceError(f"{path} has no fetch(spec, ctx) function")
    out = []
    for j in module.fetch(spec, ctx) or []:
        out.append(j if isinstance(j, Job) else Job(**j))
    return out


def registry() -> dict[str, Callable]:
    from jobhunt.jobs.sources import ats, simplify       # noqa: PLC0415 — avoid import cycles
    return {"simplify": simplify.fetch, "ats": ats.fetch, "module": _module_fetch}


def specs(cfg: Config) -> list[dict]:
    """Source entries with a resolved, unique `name`."""
    out, names = [], set()
    for i, s in enumerate(cfg["sources"] or []):
        if not isinstance(s, dict) or not s.get("type"):
            raise SourceError(f"sources[{i}] needs a type (one of {sorted(registry())})")
        if s["type"] not in registry():
            raise SourceError(f"sources[{i}]: unknown type {s['type']!r} (one of {sorted(registry())})")
        name = str(s.get("name") or s["type"])
        if name in names:
            raise SourceError(f"two sources are named {name!r}; give one of them a different `name`")
        names.add(name)
        out.append({**s, "name": name})
    return out
