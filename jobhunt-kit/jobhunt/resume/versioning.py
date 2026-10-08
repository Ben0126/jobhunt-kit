"""Version numbers for every resume you build: V<major>.<minor>.<patch>.

  major  the variant's `major` in resume.yaml (e.g. 1 = robotics). Tailored resumes follow their base_variant,
         so sending a V2… file to a robotics job means you grabbed the wrong one.
  minor  +1 when the text on the PDF (including links) changed.
  patch  +1 when only the layout changed (same text).
  Same content as an earlier version → that version's number again, so two companies with the same number got
  the same PDF.
New numbers are registered (data/resume_versions.csv) only when every source is committed; otherwise the PDF is
stamped V1.2.0-draft and nothing is registered, so editing and rebuilding ten times doesn't burn ten numbers.
The number is stored in the PDF's Subject property (visible in a PDF viewer's document properties), not in the
file name the company sees.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
from pathlib import Path

import pymupdf

from jobhunt.util import read_csv

FIELDS = ["resume", "version", "text_sha", "layout_sha", "registered", "commit"]


def fingerprint(pdf_path: Path) -> tuple[str, str]:
    """(text hash, layout hash) of what's visible; metadata is ignored, so stamping doesn't change it."""
    text, layout = [], []
    with pymupdf.open(pdf_path) as pdf:
        for page in pdf:
            text.append(" ".join(page.get_text().split()))
            text += sorted(link.get("uri") or "" for link in page.get_links())
            layout.append(f"page {page.rect.width:.1f}x{page.rect.height:.1f}")
            layout += [f"{w[0]:.1f},{w[1]:.1f},{w[2]:.1f},{w[3]:.1f} {w[4]}" for w in page.get_text("words")]
    sha = lambda parts: hashlib.sha256("\n".join(parts).encode()).hexdigest()[:16]   # noqa: E731
    return sha(text), sha(layout)


def parse(v: str) -> tuple[int, int, int]:
    m = re.fullmatch(r"V(\d+)\.(\d+)\.(\d+)", v)
    if not m:
        raise ValueError(f"bad version {v!r}")
    return tuple(int(x) for x in m.groups())


def pick(history: list[dict], major: int, text_sha: str, layout_sha: str) -> tuple[str, bool]:
    """history = this resume's registered rows, oldest first → (version, is_new)."""
    rows = [r for r in history if parse(r["version"])[0] == major]
    for r in rows:
        if (r["text_sha"], r["layout_sha"]) == (text_sha, layout_sha):
            return r["version"], False
    if not rows:
        return f"V{major}.1.0", True
    latest = rows[-1]
    _, minor, _ = parse(latest["version"])
    if latest["text_sha"] == text_sha:
        same_minor = [parse(r["version"])[2] for r in rows if parse(r["version"])[1] == minor]
        return f"V{major}.{minor}.{max(same_minor) + 1}", True
    return f"V{major}.{max(parse(r['version'])[1] for r in rows) + 1}.0", True


def append(path: Path, row: dict) -> None:
    new = not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    import csv   # noqa: PLC0415
    with open(path, "a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        if new:
            w.writeheader()
        w.writerow(row)


def stamp(pdf_path: Path, version: str, resume: str) -> None:
    with pymupdf.open(pdf_path) as pdf:
        pdf.set_metadata({**pdf.metadata, "subject": f"{version} {resume}"})
        data = pdf.tobytes(garbage=0, deflate=True)
    Path(pdf_path).write_bytes(data)


def read_stamp(pdf_path: Path) -> str:
    with pymupdf.open(pdf_path) as pdf:
        return (pdf.metadata.get("subject") or "").split(" ")[0]


def assign(pdf_path: Path, resume: str, major: int, registry: Path, committed: bool, commit: str = "",
           today: dt.date | None = None) -> tuple[str, str]:
    """Pick (and maybe register) the version for a freshly built PDF and stamp it. → (version, note)."""
    text_sha, layout_sha = fingerprint(pdf_path)
    _, rows = read_csv(registry)
    history = [r for r in rows if r["resume"] == resume]
    version, is_new = pick(history, major, text_sha, layout_sha)
    note = ""
    if is_new and committed:
        append(registry, {"resume": resume, "version": version, "text_sha": text_sha, "layout_sha": layout_sha,
                          "registered": (today or dt.date.today()).isoformat(), "commit": commit})
        note = "new version, registered"
    elif is_new:
        version += "-draft"
        note = "uncommitted changes: draft, not registered"
    stamp(pdf_path, version, resume)
    return version, note
