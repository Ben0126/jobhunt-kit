"""The daily job feed: every source → filter → classify → merge duplicates → jobs.csv + new_jobs.md.

Outputs in <workspace>/data/:
  jobs.csv       every open posting that fits a track (excluded ones are only counted)
  new_jobs.md    today's new postings in your notify tracks, plus warnings — the body of the daily digest
  state.json     what has been seen, per-source baselines and failure dates (commit it with the rest)
  .has_new       "1" when the digest is worth sending (new jobs or warnings)

Rules that matter:
  - First run, or a source you just added: baseline only. Nothing from it is "new" that day, so adding a
    source with 300 postings doesn't flood you.
  - The same posting from two sources becomes one row: same requisition id in the links (at the same
    employer), or same company + normalized title. The source listed first in jobhunt.yaml keeps the row;
    the others' ids go into `also`, and any of them is recognized as seen.
  - A source (or one company of an `ats` source) that fails: a warning, and its rows from the last run are
    kept for up to CARRY_DAYS days, so one flaky API doesn't make postings vanish and "reappear" as new.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from jobhunt.config import Config
from jobhunt.jobs import filters
from jobhunt.jobs.classify import EXCLUDED, Classifier
from jobhunt.jobs.model import JOB_FIELDS, Job
from jobhunt.jobs.sources import Context, SourceError, registry, specs
from jobhunt.util import norm_company, norm_title, read_csv, strings, write_csv

CARRY_DAYS = 7


def _legal_words(s):
    return norm_company(s).split()


def same_employer(a: str, b: str) -> bool:
    if norm_company(a) == norm_company(b):
        return True
    x, y = _legal_words(a), _legal_words(b)
    n = min(len(x), len(y))
    return n >= 2 and x[:n] == y[:n]


def add_also(row: dict, other: str) -> None:
    if other != row["id"]:
        row["also"] = ";".join(sorted({*filter(None, row["also"].split(";")), other}))


def ids_of(row: dict) -> set[str]:
    return {row["id"], *filter(None, row.get("also", "").split(";"))}


class Merger:
    """Keeps one row per real posting across sources."""

    def __init__(self):
        self.rows: list[dict] = []
        self.by_token: dict[str, list[dict]] = {}
        self.by_key: dict[tuple, dict] = {}
        self.by_id: dict[str, dict] = {}

    def find(self, job: Job) -> dict | None:
        if job.id in self.by_id:
            return self.by_id[job.id]
        for t in job.tokens:
            if len(t) < 5:
                continue
            for r in self.by_token.get(t, []):
                if same_employer(r["company"], job.company):
                    return r
        return self.by_key.get((norm_company(job.company), norm_title(job.title)))

    def add(self, row: dict, tokens) -> None:
        self.rows.append(row)
        self.by_id[row["id"]] = row
        for t in tokens:
            self.by_token.setdefault(t, []).append(row)
        self.by_key.setdefault((norm_company(row["company"]), norm_title(row["title"])), row)

    def alias(self, row: dict, job: Job) -> None:
        add_also(row, job.id)
        self.by_id[job.id] = row
        for k in ("sponsor", "posted", "degrees"):
            if not row.get(k):
                row[k] = "/".join(job.degrees) if k == "degrees" else getattr(job, k)


def to_row(job: Job, track: str, tier: int) -> dict:
    return {"id": job.id, "track": track, "tier": tier, "company": job.company, "title": job.title,
            "locations": job.location_text(), "degrees": "/".join(job.degrees), "posted": job.posted,
            "link": job.link, "source": job.source, "also": "", "sponsor": job.sponsor, "h1b": "", "h1b_lca": ""}


def load_state(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def run(cfg: Config, today: dt.date | None = None, get=None, only: set[str] | None = None,
        h1b_enabled: bool | None = None) -> dict:
    """Run the feed. Returns a summary dict (also used by tests). `only` = names of sources to fetch."""
    today = today or dt.date.today()
    data = cfg.data
    data.mkdir(parents=True, exist_ok=True)
    state_path = data / "state.json"
    state = load_state(state_path)
    first_run = "seen" not in state
    seen = set(state.get("seen", []))
    src_state = state.setdefault("sources", {})
    ctx = Context(cfg=cfg, today=today, **({"get": get} if get else {}))
    classify = Classifier(cfg)
    _, previous = read_csv(data / "jobs.csv")

    merger, excluded, fresh_sources = Merger(), 0, []
    counts_by_source: dict[str, int] = {}
    for spec in specs(cfg):
        name = spec["name"]
        st = src_state.setdefault(name, {})
        skipped = only is not None and name not in only
        if skipped:                             # not fetched this time: keep its rows as they were
            jobs, ok, failed_prefixes = [], False, None
        else:
            try:
                jobs = registry()[spec["type"]](spec, ctx)
                ok = True
                failed_prefixes = spec.get("_failed_prefixes") or []
            except Exception as e:  # noqa: BLE001 — a broken source never breaks the digest
                ctx.warnings.append(f"{name}: {e if isinstance(e, SourceError) else type(e).__name__ + ' ' + str(e)[:160]}")
                jobs, ok, failed_prefixes = [], False, None
        if ok and not st.get("baseline"):
            st["baseline"] = today.isoformat()
            if not first_run:
                fresh_sources.append(name)
        # carry over: the whole source failed (prefixes None) or some of its companies did
        carry = []
        if skipped:
            carry = [r for r in previous if r.get("source") == name]
        elif not ok or failed_prefixes:
            since = st.setdefault("failing_since", today.isoformat())
            days = (today - dt.date.fromisoformat(since)).days
            if days < CARRY_DAYS:
                carry = [r for r in previous if r.get("source") == name
                         and (failed_prefixes is None or r["id"].startswith(tuple(failed_prefixes)))]
            else:
                ctx.warnings.append(f"{name}: failing for {days} days — no longer keeping its old rows; fix or remove it")
        else:
            st.pop("failing_since", None)

        n = 0
        for job in jobs:
            job.source = name
            if not filters.keep(job, cfg["search"]):
                continue
            track, tier = classify(job.company, job.title, job.extra.get("sponsorship", ""))
            if track is None:
                continue
            if track == EXCLUDED:
                excluded += 1
                continue
            hit = merger.find(job)
            if hit:
                merger.alias(hit, job)
                continue
            if job.id in merger.by_id:          # id collision between sources that aren't the same posting
                job.id = f"{name}:{job.id}"
            merger.add(to_row(job, track, tier), [t for t in job.tokens if len(t) >= 5])
            n += 1
        for r in carry:
            if any(i in merger.by_id for i in ids_of(r)):
                continue
            track, tier = classify(r["company"], r["title"])
            if track in (None, EXCLUDED):
                continue
            row = {**{k: r.get(k, "") for k in JOB_FIELDS}, "track": track, "tier": tier}
            merger.add(row, [])
            n += 1
        counts_by_source[name] = n

    rows = merger.rows
    order = {t.id: i for i, t in enumerate(cfg.tracks)}
    rows.sort(key=lambda r: (order.get(r["track"], 99), int(r["tier"]), r["company"].lower(), r["title"].lower()))

    if h1b_enabled if h1b_enabled is not None else cfg["visa"].get("h1b_records"):
        from jobhunt.jobs import h1b   # noqa: PLC0415
        ctx.warnings += h1b.annotate(rows, data / "h1b", today.year)

    notify = set(cfg["notify"].get("tracks") or [t.id for t in cfg.tracks])
    baseline_sources = set(fresh_sources)
    new = [] if first_run else [r for r in rows if r["track"] in notify and not ids_of(r) & seen
                                and r["source"] not in baseline_sources]
    state["seen"] = sorted(seen.union(*map(ids_of, rows))) if rows else sorted(seen)
    state["last_run"] = today.isoformat()

    write_csv(data / "jobs.csv", JOB_FIELDS, rows)
    state_path.write_text(json.dumps(state, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    report = render_report(cfg, today, rows, new, excluded, counts_by_source, ctx.warnings, first_run, fresh_sources)
    (data / "new_jobs.md").write_text(report, encoding="utf-8")
    (data / ".has_new").write_text("1" if (new or ctx.warnings) else "0")
    return {"rows": rows, "new": new, "warnings": ctx.warnings, "excluded": excluded, "first_run": first_run,
            "by_source": counts_by_source}


def visa_note(r: dict, s: dict) -> str:
    parts = {"yes": [s["visa_yes"]], "no": [s["visa_no"]], "citizen": [s["visa_citizen"]]}.get(r.get("sponsor", ""), [])
    if r.get("h1b"):
        parts.append(s["h1b"].get(r["h1b"], r["h1b"]))
    return ", ".join(parts) or "-"


def render_report(cfg, today, rows, new, excluded, by_source, warnings, first_run, fresh_sources) -> str:
    s = strings(cfg.lang)
    labels = {t.id: t.label for t in cfg.tracks}
    count = {t.id: sum(1 for r in rows if r["track"] == t.id) for t in cfg.tracks}
    lines = [f"# {s['new_jobs']} {today.isoformat()}", "",
             f"{s['open_now']}: " + " | ".join(f"{labels[k]} {v}" for k, v in count.items())
             + (f" ({s['excluded']} {excluded})" if excluded else "")
             + f"; {s['by_source']}: " + " | ".join(f"{k} {v}" for k, v in by_source.items()), ""]
    lines += [f"> ⚠️ {w}" for w in warnings] + ([""] if warnings else [])
    if first_run:
        lines.append(s["first_run"])
    elif not new:
        lines.append(s["nothing_new"])
    if fresh_sources and not first_run:
        lines += ["", s["baseline_sources"].format(names=", ".join(fresh_sources))]
    for t in cfg.tracks:
        sub = [r for r in new if r["track"] == t.id]
        if not sub:
            continue
        lines += ["", f"## {t.label} ({len(sub)})", "", s["cols"], "|---|---|---|---|---|---|"]
        lines += [f"| T{r['tier']} | {r['company']} | [{r['title']}]({r['link']}) | {r['locations'] or '-'} "
                  f"| {visa_note(r, s)} | {r['source']} |" for r in sub]
    return "\n".join(lines) + "\n"
