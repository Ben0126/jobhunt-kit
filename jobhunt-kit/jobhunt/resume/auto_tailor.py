"""`jobhunt tailor`: draft targets/<id>.yaml for one job with any LLM API — and refuse drafts that break the rules.

    jobhunt tailor https://boards.greenhouse.io/acme/jobs/123
    jobhunt tailor jd.txt --id acme-perception
    cat jd.txt | jobhunt tailor -

The model gets AGENTS.md's red lines, playbooks/tailor-resume.md, resume.yaml and the job description, and must
answer with the target file. Its answer then goes through the same gates as a hand-written target (bullet ids,
numbers found in resume.yaml, plain voice). Anything that fails is sent back with the exact errors; after
MAX_ROUNDS failed answers nothing is written to targets/ (the last attempt is kept in data/ for you to look at).
A draft is never ready to send: the model's assumptions are in `confirm`, which you clear yourself.
"""
from __future__ import annotations

import datetime as dt
import html
import re
import sys
import urllib.request
from pathlib import Path

import yaml

from jobhunt import llm
from jobhunt.resume import fact_check, model, tailor
from jobhunt.resume.model import ResumeError
from jobhunt.resume.voice_check import Voice, describe as describe_voice

MAX_ROUNDS = 3
MAX_JD_CHARS = 60000
_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"


class TailorError(Exception):
    pass


def html_to_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style|noscript|svg|head)\b.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|section)>", "\n", raw)
    raw = re.sub(r"(?i)<li\b[^>]*>", "\n- ", raw)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    lines = [" ".join(l.split()) for l in text.splitlines()]
    return "\n".join(l for l in lines if l)


def read_job(source: str, get=None) -> tuple[str, str]:
    """(job description text, url or ""). source = URL, a file path, or "-" for stdin."""
    if source == "-":
        return sys.stdin.read(), ""
    if re.match(r"https?://", source):
        try:
            if get:
                raw = get(source)
            else:
                req = urllib.request.Request(source, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    raw = r.read().decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            raise TailorError(f"can't open {source} ({e}) — save the job description to a file and pass the file") from e
        text = html_to_text(raw)
        if len(text) < 400:
            raise TailorError(f"{source} has almost no text without JavaScript (Workday and some sites render in the "
                              "browser) — copy the job description into a file and pass the file")
        return text, source
    path = Path(source)
    if not path.exists():
        raise TailorError(f"{source}: not a URL and no such file")
    return path.read_text(encoding="utf-8"), ""


def _section(text: str, heading: str) -> str:
    m = re.search(rf"^## {re.escape(heading)}.*?(?=^## |\Z)", text, re.S | re.M)
    return m.group(0).strip() if m else ""


def bullet_menu(data: dict) -> str:
    """Which bullet ids exist in which variants — the model must pick from these."""
    lines = []
    for v in data["variants"]:
        ids = [bid for bid, (_, item, b) in model.bullet_index(data).items()
               if model.in_variant(item, v) and model.in_variant(b, v)]
        lines.append(f"- {v}: {', '.join(ids)}")
    return "\n".join(lines)


def system_prompt(cfg) -> str:
    agents = (cfg.root / "AGENTS.md").read_text(encoding="utf-8") if (cfg.root / "AGENTS.md").exists() else ""
    playbook_path = cfg.root / "playbooks" / "tailor-resume.md"
    playbook = playbook_path.read_text(encoding="utf-8") if playbook_path.exists() else ""
    return "\n\n".join(filter(None, [
        "You tailor one person's resume to one job posting. You write a single YAML file: targets/<id>.yaml.",
        _section(agents, "Red lines"),
        _section(agents, "Checks by hand"),
        "# Playbook\n\n" + playbook if playbook else "",
        "# Your answer\n\nYou cannot run commands, browse, or ask questions in this run. Put every question for the "
        "person into `confirm`. Answer with exactly one ```yaml code block containing the complete target file and "
        "nothing else outside it. Required keys: id (kebab-case, <company>-<short-role>), base_variant, bullet_order; "
        "plus summary, skills_order, bullet_overrides as needed, and the notes company, role, url, fit, "
        "keywords_hit, gaps, confirm, application_answers.",
    ]))


def user_prompt(cfg, data_text: str, data: dict, jd: str, url: str, want_id: str) -> str:
    tracks = "\n".join(f"- {t.id} ({t.label}): resume variant `{t.resume}`" for t in cfg.tracks)
    return "\n\n".join([
        f"Today: {dt.date.today().isoformat()}." + (f" Use id: {want_id}" if want_id else ""),
        "## resume.yaml (the only source of facts)\n\n```yaml\n" + data_text.strip() + "\n```",
        "## Bullet ids available per variant\n\n" + bullet_menu(data),
        "## Tracks (job categories → resume variant)\n\n" + tracks,
        "## Job posting" + (f" ({url})" if url else "") + "\n\n" + jd.strip(),
    ])


def extract_yaml(reply: str) -> str:
    m = re.findall(r"```(?:yaml|yml)?\s*\n(.*?)```", reply, re.S)
    return (m[-1] if m else reply).strip() + "\n"


def problems(cfg, data: dict, text: str, want_id: str, existing: set[str], force: bool) -> tuple[list[str], dict]:
    try:
        t = yaml.safe_load(text)
    except yaml.YAMLError as e:
        return [f"not valid YAML: {e}"], {}
    if not isinstance(t, dict):
        return ["the answer must be one YAML mapping (the target file)"], {}
    out = []
    tid = str(t.get("id") or "")
    if want_id and tid != want_id:
        out.append(f"id must be {want_id!r}")
    elif not _ID.match(tid):
        out.append(f"id {tid!r} must be kebab-case like acme-perception-intern")
    elif tid in existing and not force:
        out.append(f"targets/{tid}.yaml already exists — choose another id")
    if t.get("base_variant") not in data["variants"]:
        out.append(f"base_variant must be one of {list(data['variants'])}")
    if not out:
        try:
            tailor.tailor(data, t)
        except ResumeError as e:
            out.append(str(e))
    missing = fact_check.unsupported(t, data)
    if missing:
        out.append("numbers not in resume.yaml (remove them or ask in confirm): " + fact_check.describe(missing))
    voice = Voice.from_config(cfg).check(t)
    if voice:
        out.append("wording: " + describe_voice(voice))
    for key in ("gaps", "confirm"):
        if t.get(key) is not None and not isinstance(t[key], list):
            out.append(f"{key} must be a list")
    return out, t


def run(cfg, source: str, want_id: str = "", force: bool = False, complete=None, get=None, log=print) -> dict:
    spec = cfg["llm"]
    complete = complete or (lambda system, messages: llm.complete(spec, system, messages))
    jd, url = read_job(source, get)
    if len(jd) > MAX_JD_CHARS:
        raise TailorError(f"the job description is {len(jd)} characters — that's not one posting; pass a file with "
                          "just the posting text")
    data_text = cfg.resume_source.read_text(encoding="utf-8")
    data = model.load(cfg.resume_source)
    existing = set(tailor.target_paths(cfg))
    if want_id and want_id in existing and not force:
        raise TailorError(f"targets/{want_id}.yaml already exists (use --force to replace it)")
    system = system_prompt(cfg)
    messages = [{"role": "user", "content": user_prompt(cfg, data_text, data, jd, url, want_id)}]
    text, errs = "", []
    for round_no in range(1, MAX_ROUNDS + 1):
        reply = complete(system, messages)
        text = extract_yaml(reply)
        errs, t = problems(cfg, data, text, want_id, existing, force)
        if not errs:
            break
        log(f"round {round_no}: {len(errs)} problem(s) — " + " | ".join(errs)[:300])
        messages += [{"role": "assistant", "content": reply},
                     {"role": "user", "content": "The file fails these checks. Fix every one and answer with the "
                                                 "complete corrected file in one ```yaml block:\n- " + "\n- ".join(errs)}]
    if errs:
        dump = cfg.data / f"tailor-failed-{dt.datetime.now():%Y%m%d-%H%M%S}.yaml"
        dump.parent.mkdir(parents=True, exist_ok=True)
        dump.write_text(text, encoding="utf-8")
        raise TailorError(f"no valid draft after {MAX_ROUNDS} rounds; last attempt in {dump.relative_to(cfg.root)}:\n- "
                          + "\n- ".join(errs))
    if url and not t.get("url"):
        t["url"] = url
    head = (f"# Drafted by {llm.describe(spec)} on {dt.date.today().isoformat()} with `jobhunt tailor`.\n"
            "# Not ready to send: answer every item in `confirm`, then empty it, commit and rebuild.\n")
    path = cfg.path("targets") / f"{t['id']}.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(head + yaml.safe_dump(t, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8")
    return {"path": path, "target": t, "rounds": round_no}
