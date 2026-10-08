"""SimplifyJobs-style lists (github.com/SimplifyJobs): a `listings.json` with active flags, terms, degrees.

    - type: simplify
      repo: SimplifyJobs/Summer2027-Internships     # or SimplifyJobs/New-Grad-Positions
      branch: dev                                   # optional
      skip_categories: [Quant, Product]             # optional
      file: listings.json                           # optional: a local copy (offline testing)

Simplify's `active` flag decides whether a posting is open; it is the most reliable signal of all sources.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from jobhunt.jobs.model import Job
from jobhunt.jobs.sources import SourceError
from jobhunt.util import req_tokens

SPONSOR = {"Offers Sponsorship": "yes", "Does Not Offer Sponsorship": "no",
           "U.S. Citizenship is Required": "citizen"}


def url_for(spec: dict) -> str:
    if spec.get("url"):
        return spec["url"]
    repo = spec.get("repo") or "SimplifyJobs/Summer2027-Internships"
    return f"https://raw.githubusercontent.com/{repo}/{spec.get('branch') or 'dev'}/.github/scripts/listings.json"


def load(spec: dict, ctx) -> list[dict]:
    if spec.get("file"):
        path = Path(spec["file"])
        if not path.is_absolute():
            path = ctx.cfg.root / path
        return json.loads(path.read_text(encoding="utf-8"))
    data = ctx.get(url_for(spec), timeout=60)
    if not isinstance(data, list):
        raise SourceError("listings.json is not a list (format changed?)")
    return data


def fetch(spec: dict, ctx) -> list[Job]:
    listings = load(spec, ctx)
    skip = set(spec.get("skip_categories") or [])
    intern = "intern" in str(spec.get("repo") or spec.get("url") or "").lower()
    out = []
    for x in listings:
        if not x.get("active") or x.get("is_visible") is False or x.get("category") in skip:
            continue
        sponsorship = x.get("sponsorship", "") or ""
        posted = ""
        if x.get("date_posted"):
            posted = dt.datetime.fromtimestamp(x["date_posted"], dt.timezone.utc).date().isoformat()
        out.append(Job(
            id=str(x["id"]), company=x.get("company_name", ""), title=x.get("title", ""),
            link=f"https://simplify.jobs/p/{x['id']}", locations=list(x.get("locations") or []), posted=posted,
            tokens=req_tokens(x.get("url") or ""), employment="intern" if intern else "",
            terms=list(x.get("terms") or []), degrees=list(x.get("degrees") or []),
            sponsor=SPONSOR.get(sponsorship, ""), extra={"apply_url": x.get("url", ""), "sponsorship": sponsorship}))
    if listings and not out:
        ctx.warnings.append(f"{spec['name']}: {len(listings)} listings but none active — format changed?")
    return out
