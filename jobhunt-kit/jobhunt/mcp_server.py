"""MCP server: lets desktop AI apps (Claude Desktop, ChatGPT desktop, Gemini CLI, Cursor…) work on a jobhunt workspace
with the guardrails enforced by the tools themselves — a tailored resume that invents a number simply can't be saved.

    jobhunt --workspace ~/my-job-hunt mcp          # stdio; see docs/mcp.md for each app's config

Tools never apply, email or contact anyone. Changing resume.yaml needs `user_confirmed=true`, which the assistant
may only pass after the person approved the exact change.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

import yaml

from jobhunt import config as config_mod
from jobhunt import webio
from jobhunt.jobs.model import JOB_FIELDS
from jobhunt.resume import fact_check, model, tailor
from jobhunt.resume.model import ResumeError
from jobhunt.resume.voice_check import Voice, describe as describe_voice
from jobhunt.tracker import applications as apps_mod
from jobhunt.tracker import followup

INSTRUCTIONS = """jobhunt: a job-search workspace (internships / new-grad roles).
Rules you must follow:
1. resume.yaml is the only source of facts. Never invent experience, numbers, tools or scope.
2. Tailoring = choose, reorder and reword existing bullets. Things the person lacks go to `gaps`, never the resume.
3. Every assumption goes into `confirm` as a yes/no question; a target with open confirm items must not be sent.
4. Plain voice: result first, no AI-sounding words (leveraged, robust, seamless…), no semicolons.
5. Never apply, email or message anyone. Never change resume.yaml without the person approving that exact change.
Before tailoring or reviewing, call get_playbook("tailor-resume") / get_playbook("resume-review") and follow it.
Use save_target to store a tailored resume — it rejects anything that breaks rules 1–4."""


def _server_class():
    try:
        from mcp.server.mcpserver import MCPServer   # mcp >= 2
        return MCPServer
    except ImportError:
        from mcp.server.fastmcp import FastMCP       # mcp 1.x
        return FastMCP


def _parse(text: str) -> dict:
    """A target or resume given as YAML or JSON text."""
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise ValueError(f"not valid YAML/JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("expected one mapping (object)")
    return data


class Tools:
    """The tool implementations, independent of the MCP library (tested directly)."""

    def __init__(self, root: Path):
        self.root = Path(root)

    @property
    def cfg(self):
        return config_mod.load(self.root)

    def overview(self) -> dict:
        cfg = self.cfg
        _, apps = apps_mod.load(cfg)
        jobs = webio.jobs_rows(cfg)
        f = followup.run(cfg, write=False)
        return {"workspace": str(self.root), "name": cfg["profile"].get("name"), "language": cfg.lang,
                "search": cfg["search"], "tracks": [{"id": t.id, "label": t.label, "resume_variant": t.resume} for t in cfg.tracks],
                "open_postings": len(jobs), "targets": sorted(tailor.target_paths(cfg)),
                "applications": len(apps), "follow_ups_due": f["todo"], "probably_ghosted": f["ghost"]}

    def get_resume(self) -> str:
        return self.cfg.resume_source.read_text(encoding="utf-8")

    def get_playbook(self, name: str) -> str:
        path = self.root / "playbooks" / f"{name.removesuffix('.md')}.md"
        lens = self.root / "playbooks" / "review-lenses" / f"{name.removesuffix('.md')}.md"
        for p in (path, lens):
            if p.exists():
                return p.read_text(encoding="utf-8")
        have = sorted(p.stem for p in (self.root / "playbooks").rglob("*.md"))
        raise ValueError(f"no playbook {name!r}; have {have}")

    def list_jobs(self, track: str = "", query: str = "", limit: int = 30) -> list[dict]:
        q = query.lower()
        rows = [r for r in webio.jobs_rows(self.cfg) if (not track or r["track"] == track)
                and (not q or q in f"{r['company']} {r['title']} {r['locations']}".lower())]
        rows.sort(key=lambda r: r.get("posted", ""), reverse=True)
        return [{k: r.get(k, "") for k in JOB_FIELDS if r.get(k)} for r in rows[:max(1, min(limit, 200))]]

    def get_new_jobs(self) -> str:
        p = self.cfg.data / "new_jobs.md"
        return p.read_text(encoding="utf-8") if p.exists() else "No digest yet — run `jobhunt daily`."

    def check_target(self, target: dict) -> list[str]:
        cfg = self.cfg
        data = model.load(cfg.resume_source)
        out = []
        try:
            tailor.tailor(data, target)
        except ResumeError as e:
            out.append(str(e))
        missing = fact_check.unsupported(target, data)
        if missing:
            out.append("numbers not in resume.yaml: " + fact_check.describe(missing))
        voice = Voice.from_config(cfg).check(target)
        if voice:
            out.append("wording: " + describe_voice(voice))
        return out

    def save_target(self, target_text: str, overwrite: bool = False) -> dict:
        target = _parse(target_text)
        tid = str(target.get("id") or "")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", tid):
            return {"saved": False, "problems": [f"id must be lowercase-with-dashes, got {tid!r}"]}
        path = self.cfg.path("targets") / f"{tid}.yaml"
        if path.exists() and not overwrite:
            return {"saved": False, "problems": [f"targets/{tid}.yaml exists — pass overwrite=true to replace it"]}
        problems = self.check_target(target)
        if problems:
            return {"saved": False, "problems": problems, "hint": "fix every problem without adding facts, then call again"}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(target, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8")
        return {"saved": True, "path": str(path.relative_to(self.root)), "open_confirm": target.get("confirm") or [],
                "next": "ask the person every confirm question; then build_pdf"}

    def build_pdf(self, key: str) -> dict:
        from jobhunt.resume import build   # noqa: PLC0415 — needs PyMuPDF
        r = build.build(self.cfg, [key])[0]
        return {"ok": r.ok, "error": r.error, "path": str(r.path) if r.path else "", "version": r.version,
                "pages": r.pages, "note": r.note}

    def save_resume(self, resume_text: str, user_confirmed: bool) -> dict:
        if not user_confirmed:
            return {"saved": False, "problems": ["show the person the exact change and get their OK first, then pass user_confirmed=true"]}
        data = _parse(resume_text)
        try:
            model.validate(data)
        except ResumeError as e:
            return {"saved": False, "problems": [str(e)]}
        self.cfg.resume_source.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8")
        return {"saved": True}

    def list_applications(self) -> list[dict]:
        return [{k: v for k, v in r.items() if v} for r in apps_mod.load(self.cfg)[1]]

    def update_application(self, key: str, changes: dict) -> dict:
        cfg = self.cfg
        fields, rows = apps_mod.load(cfg)
        row = apps_mod.find(rows, key)
        allowed = {"status", "applied_date", "next_action", "next_action_date", "contact", "notes", "resume_version"}
        bad = set(changes) - allowed
        if bad:
            raise ValueError(f"can't change {sorted(bad)}; allowed: {sorted(allowed)}")
        row.update({k: str(v) for k, v in changes.items()})
        row["last_update"] = dt.date.today().isoformat()
        apps_mod.save(cfg, fields, rows)
        return row

    def track_job(self, job_id: str) -> dict:
        return apps_mod.add_from_jobs(self.cfg, job_id)


def build_server(root: Path):
    tools = Tools(root)
    server = _server_class()("jobhunt", instructions=INSTRUCTIONS)

    @server.tool()
    def get_overview() -> str:
        """Start here: the person's search settings, job types, counts, follow-ups due."""
        return json.dumps(tools.overview(), ensure_ascii=False, indent=1)

    @server.tool()
    def get_resume() -> str:
        """resume.yaml — the only source of facts. Bullets have ids that targets refer to."""
        return tools.get_resume()

    @server.tool()
    def get_playbook(name: str) -> str:
        """The step-by-step workflow to follow: setup-job-hunt, tailor-resume, resume-review, daily-routine,
        or a review lens (ats, recruiter, hiring-manager)."""
        return tools.get_playbook(name)

    @server.tool()
    def list_jobs(track: str = "", query: str = "", limit: int = 30) -> str:
        """Open postings from the daily feed, newest first. Filter by track id or a search word."""
        return json.dumps(tools.list_jobs(track, query, limit), ensure_ascii=False)

    @server.tool()
    def get_new_jobs() -> str:
        """Today's digest: new postings in the person's notify tracks, plus warnings."""
        return tools.get_new_jobs()

    @server.tool()
    def check_target(target: str) -> str:
        """Check a tailored resume (YAML or JSON) without saving: bullet ids, invented numbers, AI wording."""
        problems = tools.check_target(_parse(target))
        return "ok" if not problems else "problems:\n- " + "\n- ".join(problems)

    @server.tool()
    def save_target(target: str, overwrite: bool = False) -> str:
        """Save targets/<id>.yaml (YAML or JSON). Refused when it breaks the rules — fix the listed problems."""
        return json.dumps(tools.save_target(target, overwrite), ensure_ascii=False)

    @server.tool()
    def build_pdf(key: str) -> str:
        """Build the PDF for a target id or a variant name; returns its path and version number."""
        return json.dumps(tools.build_pdf(key), ensure_ascii=False)

    @server.tool()
    def save_resume(resume: str, user_confirmed: bool = False) -> str:
        """Replace resume.yaml. Only after the person approved the exact change (then user_confirmed=true)."""
        return json.dumps(tools.save_resume(resume, user_confirmed), ensure_ascii=False)

    @server.tool()
    def list_applications() -> str:
        """The application log (status, dates, contact, sent version)."""
        return json.dumps(tools.list_applications(), ensure_ascii=False)

    @server.tool()
    def update_application(key: str, changes: dict) -> str:
        """Update one application (by job id or target id): status, applied_date, next_action, next_action_date,
        contact, notes, resume_version."""
        return json.dumps(tools.update_application(key, changes), ensure_ascii=False)

    @server.tool()
    def track_job(job_id: str) -> str:
        """Start tracking a posting from list_jobs in the application log."""
        return json.dumps(tools.track_job(job_id), ensure_ascii=False)

    return server


def main(root: Path) -> None:
    build_server(root).run("stdio")
