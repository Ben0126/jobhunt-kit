"""The web app's backup.json ⇄ a workspace folder, so the browser, the CLI and the MCP server share one set of data.

    jobhunt web-import backup.json --workspace my-job-hunt     # creates the workspace if needed
    jobhunt web-export --out backup.json                        # then "Import backup" in the web app

Mapping: settings ↔ jobhunt.yaml (language, employment, term, job types → tracks, exclusions, follow-up days),
resume ↔ resume.yaml, targets ↔ targets/<id>.yaml, applications ↔ data/applications.csv (status keys ↔ the
workspace's status names). The web app's frozen resume snapshots stay in the browser backup only.
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

from jobhunt import config as config_mod
from jobhunt.resume.model import validate
from jobhunt.tracker import applications as apps_mod
from jobhunt.util import read_csv

FORMAT = "jobhunt-backup"
STATUS_KEYS = ["todo", "applied", "oa", "interview", "offer", "rejected", "ghosted", "withdrawn"]
EN = ["To apply", "Applied", "Online assessment", "Interviewing", "Offer", "Rejected", "No response", "Withdrawn"]
ZH = ["待投遞", "已投遞", "線上測驗", "面試中", "Offer", "拒絕", "無回應", "放棄"]


class WebIOError(Exception):
    pass


def status_names(lang: str) -> dict[str, str]:
    return dict(zip(STATUS_KEYS, ZH if lang == "zh-TW" else EN))


def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8")


def import_backup(root: Path, backup: dict) -> dict:
    """Write a web backup into the workspace at root (created from the template if missing)."""
    if backup.get("format") != FORMAT:
        raise WebIOError("not a jobhunt backup file")
    root = Path(root)
    if not (root / config_mod.CONFIG_NAME).exists():
        from jobhunt.scaffold import init   # noqa: PLC0415
        init.create(root, language=backup.get("settings", {}).get("lang", "en"))
        for example in (root / "targets").glob("example-*.yaml"):
            example.unlink()
    s = backup.get("settings") or {}
    raw = yaml.safe_load((root / config_mod.CONFIG_NAME).read_text(encoding="utf-8")) or {}
    lang = s.get("lang") or raw.get("language") or "en"
    raw["language"] = lang
    resume = backup.get("resume")
    if resume:
        raw.setdefault("profile", {})["name"] = (resume.get("basics") or {}).get("name", "")
    search = raw.setdefault("search", {})
    search["employment"] = s.get("employment", search.get("employment", "intern"))
    if s.get("employment") == "fulltime":
        search["term"] = ""
        for src in raw.get("sources") or []:
            if src.get("type") == "simplify" and "Internships" in str(src.get("repo", "")):
                src["repo"] = "SimplifyJobs/New-Grad-Positions"
    elif s.get("term"):
        search["term"] = s["term"]
    if s.get("tracks"):
        raw["tracks"] = [{"id": t["id"], "label": t.get("label", t["id"]), "resume": t["id"],
                          "titles": list(t.get("titles") or []), **({"companies": t["companies"]} if t.get("companies") else {})}
                         for t in s["tracks"]]
        raw.setdefault("notify", {})["tracks"] = []
    ex = s.get("exclude") or {}
    raw.setdefault("exclude", {}).update({"companies": list(ex.get("companies") or []), "titles": list(ex.get("titles") or [])})
    raw.setdefault("visa", {})["h1b_records"] = bool(s.get("needsSponsorship"))
    if s.get("followup"):
        raw["followup"] = {**raw.get("followup", {}), **s["followup"]}
    if lang == "zh-TW" and "statuses" not in raw:
        raw["statuses"] = config_mod.ZH_STATUSES
    _dump(root / config_mod.CONFIG_NAME, raw)
    cfg = config_mod.load(root)

    written = {"targets": 0, "applications": 0}
    if resume:
        validate(resume)
        _dump(cfg.resume_source, resume)
    for tid, t in (backup.get("targets") or {}).items():
        t = {k: v for k, v in t.items() if k != "confirmed"}
        confirmed = set((backup["targets"][tid].get("confirmed")) or [])
        t["confirm"] = [q for q in t.get("confirm") or [] if q not in confirmed]
        _dump(cfg.path("targets") / f"{tid}.yaml", {**t, "id": tid})
        written["targets"] += 1
    names = status_names(lang)
    names.update({k: cfg["statuses"][k] for k in ("todo", "applied", "ghosted") if cfg["statuses"].get(k)})
    fields, rows = apps_mod.load(cfg)
    by_id = {r["job_id"]: r for r in rows}
    for a in backup.get("applications") or []:
        row = by_id.get(a.get("job_id")) or {}
        row.update({k: a.get(k, "") or "" for k in apps_mod.FIELDS if k in a and k != "status"})
        row["status"] = names.get(a.get("status", ""), a.get("status", ""))
        if a.get("job_id") not in by_id:
            rows.append(row)
            by_id[a["job_id"]] = row
        written["applications"] += 1
    apps_mod.save(cfg, fields, rows)
    return written


def export_backup(cfg) -> dict:
    """A backup.json the web app can import, built from the workspace."""
    from jobhunt.resume import model, tailor   # noqa: PLC0415
    lang = cfg.lang
    keys = {v: k for k, v in status_names(lang).items()}
    st = cfg["statuses"]
    for k, name in (("todo", st.get("todo")), ("applied", st.get("applied")), ("ghosted", st.get("ghosted"))):
        if name:
            keys[name] = k
    resume = model.load(cfg.resume_source) if cfg.resume_source.exists() else None
    targets = {}
    for tid, path in tailor.target_paths(cfg).items():
        t = tailor.load_target(path)
        targets[tid] = {**t, "confirmed": []}
    _, rows = apps_mod.load(cfg)
    s = cfg["search"]
    return {
        "format": FORMAT, "version": 1,
        "settings": {"lang": lang, "employment": "fulltime" if s.get("employment") == "fulltime" else "intern",
                     "term": s.get("term") or "Summer 2027", "needsSponsorship": bool(cfg["visa"].get("h1b_records")),
                     "tracks": [{"id": t.id, "label": t.label, "titles": list(cfg.raw["tracks"][i].get("titles") or []),
                                 "companies": list(cfg.raw["tracks"][i].get("companies") or [])} for i, t in enumerate(cfg.tracks)],
                     "exclude": {"companies": list(cfg["exclude"].get("companies") or []), "titles": list(cfg["exclude"].get("titles") or [])},
                     "followup": dict(cfg["followup"])},
        "resume": resume, "targets": targets,
        "applications": [{**{k: v for k, v in r.items() if v}, "status": keys.get(r.get("status", ""), "applied")} for r in rows],
        "versions": [], "seen": [], "saved": {}, "known": {}, "jd": {}, "setupDone": True, "updated": "",
    }


def read_backup(path: Path) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise WebIOError(f"can't read {path}: {e}") from e


def jobs_rows(cfg) -> list[dict]:
    return read_csv(cfg.data / "jobs.csv")[1]
