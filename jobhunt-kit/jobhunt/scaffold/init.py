"""`jobhunt init <dir>`: copy the workspace template (jobhunt.yaml, example resume.yaml, CLAUDE.md, skills,
GitHub Action, …) into a new folder. Existing files are left alone unless --force."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

TEMPLATE = Path(__file__).parent / "workspace"
SKIP = {"__pycache__"}


def files() -> list[Path]:
    return sorted(p for p in TEMPLATE.rglob("*") if p.is_file() and not SKIP & set(p.parts))


def create(dest: Path, force: bool = False, language: str = "en") -> list[Path]:
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    created = []
    for src in files():
        rel = src.relative_to(TEMPLATE)
        out = dest / rel
        if out.exists() and not force:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, out)
        created.append(rel)
    cfg = dest / "jobhunt.yaml"
    if language != "en" and Path("jobhunt.yaml") in created:
        text = cfg.read_text(encoding="utf-8")
        cfg.write_text(re.sub(r"^language: en\b", f"language: {language}", text, count=1, flags=re.M), encoding="utf-8")
    for d in ("submitted", "dist"):
        (dest / d).mkdir(exist_ok=True)
    return created
