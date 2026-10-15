"""resume.yaml — the single source of truth for every fact on every resume you send.

Shape (see docs/resume-schema.md for the full reference):

    basics:
      name: Jane Doe
      email: jane@example.com
      phone: "+1 412 555 0100"         # PDFs for applications only; omit it for a public copy
      location: Pittsburgh, PA
      links:
        - {label: github.com/janedoe, url: https://github.com/janedoe}
    variants:                           # general-purpose versions; each tailored resume starts from one
      robotics: {title: Robotics, major: 1}
      swe:      {title: Software, major: 2}
      cv:       {title: Academic CV, major: 9, one_page: false, sections: [education, experience, projects, skills]}
    sections: [summary, education, experience, projects, skills]     # default order
    summary:
      default: "..."
      robotics: "..."                   # per-variant wording
    education:
      - school: Carnegie Mellon University
        degree: M.S. in Robotics
        dates: Aug 2025 – May 2027
        location: Pittsburgh, PA
        details: ["GPA 3.9/4.0"]
    experience:
      - id: acme
        org: Acme Robotics
        role: Software Engineering Intern
        dates: Jun 2025 – Aug 2025
        location: Boston, MA
        bullets:
          - id: acme_planner            # ids let a tailored resume pick and reorder bullets
            text: Cut planning time from 120 ms to 45 ms by ...
            variants: [robotics]        # optional: only in these variants (default: all)
    projects:
      - id: rl_drone
        name: Vision-based drone racing policy
        link: https://github.com/janedoe/rl-drone
        dates: 2026
        bullets: [...]
    skills:
      - {label: Languages, items: [C++, Python], variants: [robotics, swe]}

`variants:` can appear on any experience, project, bullet or skills line to limit where it shows.
"""
from __future__ import annotations

import copy
from pathlib import Path

import yaml

SECTIONS = ("summary", "education", "experience", "projects", "skills")
BULLET_SECTIONS = ("experience", "projects")
TITLES = {"summary": "Summary", "education": "Education", "experience": "Experience", "projects": "Projects",
          "skills": "Skills", "credentials": "Certifications"}
# `credentials` is opt-in: only a resume whose section order lists it moves certifications and training out of Skills.
VALID_SECTIONS = SECTIONS + ("credentials",)


def is_credential_line(line: dict) -> bool:
    return str(line.get("label") or "").strip().lower() in ("certifications", "certification", "training")


class ResumeError(Exception):
    pass


def load(path: Path) -> dict:
    path = Path(path)
    if not path.exists():
        raise ResumeError(f"{path} not found")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise ResumeError(f"{path}: {e}") from e
    validate(data)
    return data


def validate(data: dict) -> None:
    if not (data.get("basics") or {}).get("name"):
        raise ResumeError("resume.yaml: basics.name is required")
    variants = data.get("variants") or {}
    if not variants:
        raise ResumeError("resume.yaml: define at least one entry under variants:")
    for v, spec in variants.items():
        for s in (spec or {}).get("sections") or []:
            if s not in VALID_SECTIONS:
                raise ResumeError(f"resume.yaml: variants.{v}.sections has unknown section {s!r}")
    seen = set()
    for sec in BULLET_SECTIONS:
        for i, item in enumerate(data.get(sec) or []):
            for b in item.get("bullets") or []:
                if not isinstance(b, dict) or not b.get("text"):
                    raise ResumeError(f"resume.yaml: {sec}[{i}] has a bullet without text: {b!r}")
                bid = b.get("id")
                if bid and bid in seen:
                    raise ResumeError(f"resume.yaml: bullet id {bid!r} is used twice")
                if bid:
                    seen.add(bid)
                _check_variants(b, variants, f"bullet {bid or b['text'][:30]!r}")
            _check_variants(item, variants, f"{sec}[{i}]")
    for i, line in enumerate(data.get("skills") or []):
        _check_variants(line, variants, f"skills[{i}]")


def _check_variants(node: dict, variants: dict, where: str) -> None:
    for v in node.get("variants") or []:
        if v not in variants:
            raise ResumeError(f"resume.yaml: {where} lists unknown variant {v!r} (have {sorted(variants)})")


def in_variant(node: dict, variant: str) -> bool:
    vs = node.get("variants")
    return not vs or variant in vs


def variant_spec(data: dict, variant: str) -> dict:
    variants = data.get("variants") or {}
    if variant not in variants:
        raise ResumeError(f"unknown variant {variant!r} (have {sorted(variants)})")
    spec = dict(variants[variant] or {})
    spec.setdefault("title", variant)
    spec.setdefault("one_page", True)
    spec.setdefault("major", list(variants).index(variant) + 1)
    return spec


def bullet_index(data: dict) -> dict[str, tuple[str, dict, dict]]:
    """bullet id → (section, item, bullet)."""
    out = {}
    for sec in BULLET_SECTIONS:
        for item in data.get(sec) or []:
            for b in item.get("bullets") or []:
                if b.get("id"):
                    out[b["id"]] = (sec, item, b)
    return out


def resolve(data: dict, variant: str) -> dict:
    """resume.yaml + a variant → the document a renderer draws:

        {"basics": {...}, "variant": "robotics", "title": "Robotics", "one_page": True,
         "sections": [{"kind": "summary", "title": "Summary", "text": "..."},
                      {"kind": "education", "title": "Education", "items": [...]},
                      {"kind": "experience", "title": "Experience", "items": [{..., "bullets": ["..."]}]},
                      {"kind": "skills", "title": "Skills", "lines": [{"label": "...", "items": [...]}]}]}
    """
    spec = variant_spec(data, variant)
    order = spec.get("sections") or data.get("sections") or list(SECTIONS)
    titles = {**TITLES, **(data.get("section_titles") or {})}
    out = {"basics": copy.deepcopy(data["basics"]), "variant": variant, "title": spec["title"],
           "one_page": bool(spec["one_page"]), "sections": []}
    for kind in order:
        sec = {"kind": kind, "title": titles.get(kind, kind.title())}
        if kind == "summary":
            s = data.get("summary") or {}
            text = s.get(variant, s.get("default")) if isinstance(s, dict) else s
            if not text:
                continue
            sec["text"] = " ".join(str(text).split())
        elif kind == "education":
            sec["items"] = [copy.deepcopy(e) for e in data.get("education") or [] if in_variant(e, variant)]
        elif kind in BULLET_SECTIONS:
            items = []
            for item in data.get(kind) or []:
                if not in_variant(item, variant):
                    continue
                it = {k: v for k, v in item.items() if k not in ("bullets", "variants")}
                it["bullets"] = [" ".join(str(b["text"]).split()) for b in item.get("bullets") or []
                                 if in_variant(b, variant)]
                items.append(it)
            sec["items"] = items
        elif kind in ("skills", "credentials"):
            split = "credentials" in order
            sec["lines"] = [{"label": l.get("label", ""), "items": list(l.get("items") or [])}
                            for l in data.get("skills") or []
                            if in_variant(l, variant) and (not split or is_credential_line(l) == (kind == "credentials"))
                            and (kind != "credentials" or l.get("items"))]
        if sec.get("items") == [] or sec.get("lines") == []:
            continue
        out["sections"].append(sec)
    return out
