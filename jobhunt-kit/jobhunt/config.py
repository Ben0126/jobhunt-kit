"""Workspace configuration: everything that used to be hard-coded lives in `jobhunt.yaml`.

A *workspace* is the user's own (private) folder/repo. It holds `jobhunt.yaml`, `resume.yaml`,
`targets/`, `data/`, `submitted/`. The framework code never stores personal data.

Lookup order for the workspace: `--workspace`, `$JOBHUNT_HOME`, then the current directory and its parents.
"""
from __future__ import annotations

import copy
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

CONFIG_NAME = "jobhunt.yaml"


class ConfigError(Exception):
    pass


# Every key a user can set, with its default. `load()` deep-merges the user's file over this.
DEFAULTS: dict[str, Any] = {
    "profile": {
        "name": "",
        "pdf_name": "{name}_{id}.pdf",          # tailored PDFs; {name} = profile.name with spaces → _
    },
    "language": "en",                           # report language: en | zh-TW
    "search": {
        "country": "US",                        # only country with a location matcher today
        "employment": "intern",                 # intern | fulltime | any
        "term": "",                             # e.g. "Summer 2027"; empty = don't filter by term
        "exclude_phd_only": True,
        "query": "",                            # keyword some ATS sources search with; default by employment
    },
    "sources": [],
    "tracks": [],
    "exclude": {
        "companies": [],                        # e.g. defense contractors you can't work for
        "titles": [],                           # e.g. clearance, citizenship
        "citizenship_required": True,           # drop postings a source flags as US-citizens-only
        "non_tech_titles": ["marketing", "sales", "finance", "accounting", "legal", r"\bhr\b", "recruit",
                            "business", "supply chain", "procurement", "product manag", "project manag"],
    },
    "tiers": {1: [], 2: []},
    "visa": {"h1b_records": False},
    "followup": {"nudge_days": 10, "ghost_days": 28},
    "statuses": {
        "todo": "To apply",
        "applied": "Applied",
        "active": ["Applied", "Online assessment", "Interviewing"],
        "responded": ["Online assessment", "Interviewing", "Offer", "Rejected"],
        "not_sent": ["To apply", "Withdrawn"],
        "ghosted": "No response",
    },
    "notify": {"tracks": []},                   # track ids that make it into the daily "new jobs" list; [] = all
    "resume": {
        "source": "resume.yaml",
        "renderer": "builtin",                  # builtin | {module: path/to/renderer.py}
        "template": "classic",                  # builtin template name, or a path to your own .html.j2
        "paper": "letter",                      # letter | a4
        "voice": {"extra_words": [], "allow_words": []},
    },
    "llm": {                                    # only for `jobhunt tailor`; see jobhunt/llm.py
        "provider": "",                         # anthropic | openai | gemini
        "model": "",                            # anthropic default claude-opus-5-5; openai / gemini: required
        "effort": "high",
        "api_key_env": "",
        "base_url": "",
        "max_tokens": 16000,
        "fallbacks": True,
    },
    "paths": {
        "targets": "targets",
        "data": "data",
        "dist": "dist",
        "submitted": "submitted",
    },
}

ZH_STATUSES = {
    "todo": "待投遞", "applied": "已投遞", "active": ["已投遞", "線上測驗", "面試中"],
    "responded": ["線上測驗", "面試中", "Offer", "拒絕"], "not_sent": ["待投遞", "放棄"], "ghosted": "無回應",
}


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def alternation(words) -> re.Pattern | None:
    """["robot", "drone"] → re.compile("robot|drone", I). Each entry is a regex fragment. Empty → None."""
    words = [str(w) for w in words or [] if str(w).strip()]
    return re.compile("|".join(f"(?:{w})" for w in words), re.I) if words else None


@dataclass
class Track:
    """A job category you care about, e.g. robotics / ml / swe. Replaces the old hard-coded A/B/C."""
    id: str
    label: str
    title: re.Pattern | None
    companies: re.Pattern | None
    resume: str = ""                             # resume variant that fits this track
    max_tier: int = 0                            # 0 = any; 2 = title matches only count at tier-1/2 companies
    exclude_titles: re.Pattern | None = None


@dataclass
class Config:
    root: Path
    raw: dict
    tracks: list[Track] = field(default_factory=list)

    # ---- shortcuts
    def __getitem__(self, key):
        return self.raw[key]

    def path(self, key: str) -> Path:
        return self.root / self.raw["paths"][key]

    @property
    def data(self) -> Path:
        return self.path("data")

    @property
    def resume_source(self) -> Path:
        return self.root / self.raw["resume"]["source"]

    @property
    def lang(self) -> str:
        return self.raw.get("language") or "en"

    def pdf_name(self, target_id: str) -> str:
        name = re.sub(r"\s+", "_", self.raw["profile"].get("name") or "resume")
        return self.raw["profile"]["pdf_name"].format(name=name, id=target_id)

    def search_query(self) -> str:
        s = self.raw["search"]
        if s.get("query"):
            return s["query"]
        return {"intern": "intern", "fulltime": "new grad"}.get(s.get("employment"), "")


def find_root(start: Path | None = None) -> Path:
    env = os.environ.get("JOBHUNT_HOME")
    if start is None and env:
        return Path(env)
    here = Path(start or Path.cwd()).resolve()
    for p in (here, *here.parents):
        if (p / CONFIG_NAME).exists():
            return p
    raise ConfigError(f"no {CONFIG_NAME} found in {here} or its parents — run `jobhunt init <folder>` first, "
                      "or pass --workspace")


def _track(i: int, t: dict) -> Track:
    if not isinstance(t, dict) or not t.get("id"):
        raise ConfigError(f"tracks[{i}] needs an id")
    return Track(id=str(t["id"]), label=str(t.get("label") or t["id"]),
                 title=alternation(t.get("titles") or t.get("title")),
                 companies=alternation(t.get("companies")),
                 resume=str(t.get("resume") or t["id"]),
                 max_tier=int(t.get("max_tier") or 0),
                 exclude_titles=alternation(t.get("exclude_titles")))


def from_dict(raw: dict, root: Path) -> Config:
    user = raw or {}
    base = DEFAULTS
    if user.get("language") == "zh-TW" and "statuses" not in user:
        base = deep_merge(DEFAULTS, {"statuses": ZH_STATUSES})
    merged = deep_merge(base, user)
    if merged["search"]["employment"] not in ("intern", "fulltime", "any"):
        raise ConfigError("search.employment must be intern, fulltime or any")
    if not isinstance(merged["sources"], list):
        raise ConfigError("sources must be a list")
    tracks = [_track(i, t) for i, t in enumerate(merged["tracks"] or [])]
    ids = [t.id for t in tracks]
    if len(ids) != len(set(ids)):
        raise ConfigError(f"duplicate track ids: {ids}")
    unknown = set(merged["notify"]["tracks"] or []) - set(ids)
    if unknown:
        raise ConfigError(f"notify.tracks lists unknown tracks: {sorted(unknown)}")
    return Config(root=Path(root), raw=merged, tracks=tracks)


def load(root: Path | None = None) -> Config:
    root = Path(root) if root else find_root()
    path = root / CONFIG_NAME
    if not path.exists():
        raise ConfigError(f"{path} not found")
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise ConfigError(f"{path}: {e}") from e
    return from_dict(raw, root)
