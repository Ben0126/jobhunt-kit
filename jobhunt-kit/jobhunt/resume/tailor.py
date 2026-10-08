"""targets/<id>.yaml — a resume tailored to one job, written as *overrides* on top of resume.yaml.

    id: acme-perception-intern          # must equal the file name
    base_variant: robotics              # which variant in resume.yaml to start from
    summary: >-                         # replaces the summary
      ...
    skills_order:                       # replaces the whole skills block, one "Label: items" per line
      - "Robotics: ROS 2, SLAM, motion planning"
    bullet_order:                       # which bullet ids to show, in this order (group names are just for you)
      acme: [acme_planner, acme_tests]
      projects: [rl_policy, rl_eval]
    bullet_overrides:                   # wording for this job only; anything not listed keeps resume.yaml's text
      acme_planner: "..."

    # notes — the build ignores these, Claude and you use them
    company: Acme
    role: Perception Intern (Summer 2027)
    url: https://...
    fit: 4/5
    keywords_hit: [...]                 # JD keywords your resume already has
    gaps: [...]                         # JD asks, you don't have — prepare for the interview, never add to the resume
    confirm: [...]                      # assumptions made while rewriting; must be empty before you send it
    application_answers: {...}          # drafts for the application form's questions

bullet_order rules:
  - experience: an entry with any listed id shows only the listed bullets, in that order; unlisted entries stay as is.
  - projects: once any project bullet is listed, only listed projects show, ordered by their first listed bullet.
  - an unknown id, or a bullet that isn't in base_variant, fails the build and names the file.
"""
from __future__ import annotations

import copy
from pathlib import Path

import yaml

from jobhunt.resume.model import ResumeError, bullet_index, in_variant, variant_spec

PRINTED = ("summary", "skills_order", "bullet_overrides")     # target fields that end up on the PDF


def target_paths(cfg) -> dict[str, Path]:
    d = cfg.path("targets")
    return {p.stem: p for p in sorted(d.glob("*.yaml"))} if d.is_dir() else {}


def load_target(path: Path) -> dict:
    path = Path(path)
    try:
        t = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise ResumeError(f"{path.name}: {e}") from e
    if t.get("id") != path.stem:
        raise ResumeError(f"{path.name}: id {t.get('id')!r} must match the file name {path.stem!r}")
    return t


def tailor(data: dict, target: dict) -> dict:
    """A copy of resume.yaml with this target's choices applied (summary, bullets, skills)."""
    tid, variant = target["id"], target.get("base_variant")
    if not variant:
        raise ResumeError(f"{tid}: base_variant is required")
    variant_spec(data, variant)
    data = copy.deepcopy(data)
    index = bullet_index(data)
    order = [bid for ids in (target.get("bullet_order") or {}).values() for bid in ids or []]
    overrides = target.get("bullet_overrides") or {}
    for bid in [*order, *overrides]:
        if bid not in index:
            raise ResumeError(f"{tid}: unknown bullet id {bid!r} (known: {sorted(index)})")
    for bid in order:
        _, item, b = index[bid]
        if not (in_variant(item, variant) and in_variant(b, variant)):
            raise ResumeError(f"{tid}: bullet {bid!r} is not in the {variant!r} variant")
    if len(order) != len(set(order)):
        raise ResumeError(f"{tid}: a bullet id is listed twice in bullet_order")

    for bid, text in overrides.items():
        index[bid][2]["text"] = " ".join(str(text).split())
    if target.get("summary"):
        s = data.get("summary")
        data["summary"] = {**(s if isinstance(s, dict) else {"default": s}), variant: " ".join(str(target["summary"]).split())}

    listed: dict[int, list[dict]] = {}
    project_order: list[dict] = []
    for bid in order:
        sec, item, b = index[bid]
        if id(item) not in listed:
            listed[id(item)] = []
            if sec == "projects":
                project_order.append(item)
        listed[id(item)].append(b)
    for item in data.get("experience") or []:
        if id(item) in listed:
            item["bullets"] = listed[id(item)]
    if project_order:
        for item in project_order:
            item["bullets"] = listed[id(item)]
        data["projects"] = project_order

    if target.get("skills_order"):
        lines = []
        for line in target["skills_order"]:
            label, sep, items = str(line).partition(":")
            if not sep or not items.strip():
                raise ResumeError(f"{tid}: skills_order line needs 'Label: items': {line!r}")
            lines.append({"label": label.strip(), "items": [items.strip().rstrip(".")]})
        data["skills"] = lines
    return data
