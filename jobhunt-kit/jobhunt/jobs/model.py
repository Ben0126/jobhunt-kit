"""The one shape every job source returns."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Job:
    """A single posting as a source sees it.

    Only `id`, `company`, `title` and `link` are required. Fill in what the source knows; the pipeline
    falls back to the title/locations for anything left empty.

      id          stable across days and unique across sources — prefix it with the source, e.g. "gh-skydio-123"
      locations   human-readable places ("Pittsburgh, PA", "Remote - US")
      posted      ISO date "YYYY-MM-DD" or ""
      tokens      requisition ids found in the link (used to match the same job across sources); auto-filled
      employment  "intern" / "fulltime" when the source says so explicitly, else "" (decided from the title)
      countries   ISO-ish country names when the source says so explicitly (["US"]), else [] (decided from locations)
      terms       e.g. ["Summer 2027"] when the source tags terms (Simplify does), else [] (decided from the title)
      degrees     e.g. ["Master's", "PhD"] when known
      sponsor     "yes" / "no" / "" — what the posting says about visa sponsorship
      local_default  the employer is in your country and often writes only a city → treat unknown places as local
    """
    id: str
    company: str
    title: str
    link: str
    locations: list[str] = field(default_factory=list)
    posted: str = ""
    tokens: list[str] = field(default_factory=list)
    employment: str = ""
    countries: list[str] = field(default_factory=list)
    terms: list[str] = field(default_factory=list)
    degrees: list[str] = field(default_factory=list)
    sponsor: str = ""
    local_default: bool = False
    source: str = ""                      # set by the pipeline to the source's name
    extra: dict = field(default_factory=dict)

    def location_text(self, limit: int = 3) -> str:
        locs = [l for l in dict.fromkeys(str(x).strip() for x in self.locations) if l]
        return "; ".join(locs[:limit]) + (" +" if len(locs) > limit else "")


# Columns of data/jobs.csv
JOB_FIELDS = ["id", "track", "tier", "company", "title", "locations", "degrees", "posted", "link", "source", "also",
              "sponsor", "h1b", "h1b_lca"]
