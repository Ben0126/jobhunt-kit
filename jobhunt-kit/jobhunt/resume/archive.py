"""After you apply: freeze the exact PDF you sent into submitted/ and record it in applications.csv.

    jobhunt archive acme-perception            # preview (writes nothing)
    jobhunt archive acme-perception --write    # do it

The key is a job_id (or a 6+ character prefix) or the target id in resume_version.

Steps: rebuild that resume → refuse drafts (sources must be committed so the PDF matches a commit) →
copy to submitted/<applied date>_<company>_<resume>_<version>.pdf → fill resume_file / resume_commit / resume_rev.
Never overwrites: a row that already has resume_file, or an existing file in submitted/, is refused.
"""
from __future__ import annotations

import datetime as dt
import re
import shutil

from jobhunt.resume import build as builder
from jobhunt.resume import versioning
from jobhunt.tracker import applications
from jobhunt.util import git_out, slug


class ArchiveError(Exception):
    pass


def plan(cfg, key: str, date: str | None = None) -> dict:
    fields, rows = applications.load(cfg)
    try:
        row = applications.find(rows, key)
    except applications.AppError as e:
        raise ArchiveError(str(e)) from e
    if row.get("resume_file"):
        raise ArchiveError(f"{row['company']} is already archived: {row['resume_file']} (never overwritten)")
    version = (row.get("resume_version") or "").strip()
    if not version:
        raise ArchiveError(f"{row['company']}: resume_version is empty — which resume did you send?")
    date = date or row.get("applied_date") or dt.date.today().isoformat()
    dt.date.fromisoformat(date)
    stem = f"{date}_{slug(row['company'])}_{slug(version.split('/')[-1])}"
    return {"fields": fields, "rows": rows, "row": row, "version": version, "stem": stem}


def run(cfg, key: str, date: str | None = None, write: bool = False) -> dict:
    p = plan(cfg, key, date)
    if not write:
        return {**p, "written": None}
    results = builder.build(cfg, [p["version"]])
    res = results[0]
    if not res.ok:
        raise ArchiveError(f"build failed: {res.error}")
    rev = versioning.read_stamp(res.path)
    if not re.fullmatch(r"V\d+\.\d+\.\d+", rev):
        raise ArchiveError(f"{res.path.name} has no registered version ({rev!r}) — commit resume.yaml / the target "
                           "first, then archive (a draft can't be matched to a commit)")
    dest = cfg.path("submitted") / f"{p['stem']}_{rev}.pdf"
    if dest.exists():
        raise ArchiveError(f"{dest} already exists (never overwritten)")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(res.path, dest)
    row = p["row"]
    row["resume_file"] = dest.relative_to(cfg.root).as_posix()
    row["resume_commit"] = git_out(cfg.root, "rev-parse", "--short", "HEAD") or ""
    row["resume_rev"] = rev
    applications.save(cfg, p["fields"], p["rows"])
    return {**p, "written": dest, "rev": rev}
