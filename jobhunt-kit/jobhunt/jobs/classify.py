"""Sort a posting into one of your tracks (configured in jobhunt.yaml), plus a company tier.

Order of checks:
  1. exclude.companies / exclude.titles  → "excluded" (e.g. defense, needs citizenship). Kept out of jobs.csv
     but counted, so you can see how many were dropped.
  2. exclude.non_tech_titles             → None (not a job for you; dropped silently)
  3. tracks, in the order you listed them: the first track whose `titles` match the title, or whose
     `companies` match the company, wins. `max_tier: 2` means title matches only count at tier-1/2 companies.
  4. nothing matched                     → None (dropped). Add a catch-all track if you want everything technical.
"""
from __future__ import annotations

from jobhunt.config import Config, alternation

EXCLUDED = "excluded"


class Classifier:
    def __init__(self, cfg: Config):
        ex = cfg["exclude"]
        self.tracks = cfg.tracks
        self.bad_company = alternation(ex.get("companies"))
        self.bad_title = alternation(ex.get("titles"))
        self.non_tech = alternation(ex.get("non_tech_titles"))
        self.citizen_only = bool(ex.get("citizenship_required", True))
        tiers = cfg["tiers"] or {}
        self.tiers = sorted((int(k), alternation(v)) for k, v in tiers.items() if v)

    def tier(self, company: str) -> int:
        for n, pat in self.tiers:
            if pat and pat.search(company):
                return n
        return (self.tiers[-1][0] + 1) if self.tiers else 3

    def __call__(self, company: str, title: str, sponsorship_note: str = "") -> tuple[str | None, int]:
        tier = self.tier(company)
        if ((self.bad_company and self.bad_company.search(company)) or (self.bad_title and self.bad_title.search(title))
                or (self.citizen_only and "citizenship is required" in sponsorship_note.lower())):
            return EXCLUDED, tier
        if self.non_tech and self.non_tech.search(title):
            return None, tier
        for t in self.tracks:
            if t.exclude_titles and t.exclude_titles.search(title):
                continue
            title_hit = bool(t.title and t.title.search(title)) and (not t.max_tier or tier <= t.max_tier)
            if title_hit or (t.companies and t.companies.search(company)):
                return t.id, tier
        return None, tier
