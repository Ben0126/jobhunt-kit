"""Public job feed: the open postings of a workspace as one compact JSON file for the web app.

    jobhunt --workspace feed/intern fetch
    jobhunt --workspace feed/intern feed --out web/feed/intern.json

The jobhunt-kit repository runs this every day (GitHub Actions) for broad "public" workspaces — every role, no
personal exclusions — and publishes the files with the web app on GitHub Pages. The browser then filters by each
person's own job types and visa needs, without downloading 12 MB lists or hitting career sites' CORS limits.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from jobhunt.util import read_csv

FIELDS = ("id", "company", "title", "locations", "degrees", "posted", "link", "source", "also", "sponsor", "h1b", "tier")


class FeedError(Exception):
    pass


def export(cfg, out: Path, min_jobs: int = 1) -> dict:
    _, rows = read_csv(cfg.data / "jobs.csv")
    if len(rows) < min_jobs:
        raise FeedError(f"only {len(rows)} postings — refusing to publish an empty feed (a source probably failed)")
    s = cfg["search"]
    feed = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "country": s.get("country", ""), "employment": s.get("employment", ""), "term": s.get("term", ""),
        "sources": [x.get("name") or x.get("type") for x in cfg["sources"]],
        "count": len(rows),
        "jobs": [{k: r.get(k, "") for k in FIELDS if r.get(k, "") not in ("", None)} for r in rows],
    }
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(feed, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return feed
