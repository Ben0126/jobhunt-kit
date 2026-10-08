"""data/applications.csv — your application log, the one file you (or Claude) update by hand.

Columns:
  job_id            id from data/jobs.csv (or anything unique for jobs found elsewhere)
  company, role
  track, tier       copied from jobs.csv when you add it with `jobhunt apply`
  resume_version    which resume you sent: a variant name (robotics) or targets/<id>
  status            see `statuses:` in jobhunt.yaml (default: To apply → Applied → Online assessment →
                    Interviewing → Offer, or Rejected / No response / Withdrawn)
  applied_date, last_update     YYYY-MM-DD; bump last_update whenever the status changes
  next_action, next_action_date e.g. "send thank-you note", "prepare round 2"
  contact           a recruiter or alum you know — follow-up nudges only fire when this is filled
  source            where you found it (Simplify, career fair, referral …)
  notes
  resume_file, resume_commit, resume_rev    filled by `jobhunt archive`: the frozen PDF you sent and its version
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

from jobhunt.util import read_csv, write_csv

FIELDS = ["job_id", "company", "role", "track", "tier", "resume_version", "status", "applied_date", "last_update",
          "next_action", "next_action_date", "contact", "source", "notes", "resume_file", "resume_commit", "resume_rev"]


class AppError(Exception):
    pass


def path(cfg) -> Path:
    return cfg.data / "applications.csv"


def load(cfg) -> tuple[list[str], list[dict]]:
    fields, rows = read_csv(path(cfg))
    fields = fields or list(FIELDS)
    fields += [c for c in FIELDS if c not in fields]
    return fields, rows


def save(cfg, fields, rows) -> None:
    write_csv(path(cfg), fields, ({k: r.get(k) or "" for k in fields} for r in rows))


def find(rows: list[dict], key: str) -> dict:
    """By job_id, a 6+ character prefix of it, or a target id (resume_version = targets/<key>)."""
    key = key.strip()
    hits = [r for r in rows if r["job_id"] == key or (len(key) >= 6 and r["job_id"].startswith(key))
            or r.get("resume_version") == f"targets/{key.removeprefix('targets/')}"]
    if len(hits) != 1:
        names = ", ".join(f"{r['company']} ({r['job_id'][:8]})" for r in hits)
        raise AppError(f"{key!r} matches {len(hits)} rows{': ' + names if names else ''}; need exactly one")
    return hits[0]


def add_from_jobs(cfg, job_id: str, resume_version: str = "", status: str = "", today: dt.date | None = None) -> dict:
    """Start tracking a job from data/jobs.csv (by id or any id in its `also`)."""
    _, jobs = read_csv(cfg.data / "jobs.csv")
    job = next((j for j in jobs if job_id == j["id"] or job_id in (j.get("also") or "").split(";")), None)
    if job is None:
        raise AppError(f"{job_id!r} is not in data/jobs.csv")
    fields, rows = load(cfg)
    if any(r["job_id"] in {job["id"], *filter(None, job.get("also", "").split(";"))} for r in rows):
        raise AppError(f"{job['company']} — {job['title']} is already in applications.csv")
    today = today or dt.date.today()
    st = cfg["statuses"]
    status = status or st["todo"]
    track = next((t for t in cfg.tracks if t.id == job["track"]), None)
    row = {"job_id": job["id"], "company": job["company"], "role": job["title"], "track": job["track"],
           "tier": job["tier"], "resume_version": resume_version or (track.resume if track else ""),
           "status": status, "applied_date": today.isoformat() if status == st["applied"] else "",
           "last_update": today.isoformat(), "source": job["source"]}
    rows.append(row)
    save(cfg, fields, rows)
    return row
