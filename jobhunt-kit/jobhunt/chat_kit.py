"""`jobhunt chat-kit`: bundle what a plain chat assistant needs — ChatGPT Projects, Claude Projects, Gemini Gems,
or any chat you can upload files to.

    chat-kit/
      INSTRUCTIONS.md        paste into the project's / Gem's instructions box
      ALL-IN-ONE.md          every file below in one document (for apps that limit the number of files)
      AGENTS.md, playbooks…  the same instructions every assistant follows (folders flattened)
      resume.yaml, jobhunt.yaml, targets…, applications.csv, new_jobs.md, followup.md, jobs-<track>.md
      jobhunt-runnable.zip   the workspace files in their real folders + the jobhunt package, for chats that can run
                             Python: unzip, then `python -m jobhunt --workspace . check` (needs only PyYAML)
    chat-kit.zip             all of the above, to download at once

What it leaves out: built PDFs (phone number), submitted/, H-1B data, state files.
"""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

import jobhunt
from jobhunt.util import read_csv

INSTRUCTIONS = """\
You are my job-search assistant. The uploaded files are my job-search workspace (jobhunt-kit).

1. Read AGENTS.md first and follow it exactly — especially "Red lines" and "What you can do decides how you work".
   Folders were flattened when uploading: `playbooks/tailor-resume.md` is the file `tailor-resume.md`,
   `targets/<id>.yaml` is `target-<id>.yaml`, `data/new_jobs.md` is `new_jobs.md`.
2. resume.yaml is the only source of facts about me. Never add anything it doesn't say.
3. For each task, follow the matching playbook (the table in AGENTS.md).
4. When you write or change a file (a target, resume.yaml, applications.csv), give me the complete file in one
   code block with its path as the first line, so I can save it into my repository.
5. If you can run Python and `jobhunt-runnable.zip` is here: unzip it into an empty folder, copy any file we changed
   into it at its real path, and run `python -m jobhunt --workspace . check` there (needs only PyYAML).
   Otherwise do the checks by hand (AGENTS.md).
6. Answer in the language I write in.
"""


def _flat_name(rel: Path) -> str:
    parts = rel.parts
    if parts[0] == "targets":
        return f"target-{rel.name}"
    return rel.name


def collect(cfg) -> list[tuple[str, Path]]:
    """(name in the kit, source file) for every file a chat needs."""
    root = cfg.root
    out = []
    for rel in ["AGENTS.md", "jobhunt.yaml", cfg["resume"]["source"]]:
        if (root / rel).exists():
            out.append((Path(rel).name, root / rel))
    for p in sorted((root / "playbooks").rglob("*.md")) if (root / "playbooks").is_dir() else []:
        out.append((p.name, p))
    for p in sorted(cfg.path("targets").glob("*.yaml")) if cfg.path("targets").is_dir() else []:
        out.append((_flat_name(p.relative_to(root)), p))
    for name in ("applications.csv", "new_jobs.md", "followup.md"):
        if (cfg.data / name).exists():
            out.append((name, cfg.data / name))
    return out


def jobs_by_track(cfg) -> dict[str, str]:
    """jobs.csv as one compact Markdown table per track (CSV with 800 rows is hard for a chat to read)."""
    _, rows = read_csv(cfg.data / "jobs.csv")
    out = {}
    for t in cfg.tracks:
        sub = [r for r in rows if r["track"] == t.id]
        if not sub:
            continue
        lines = [f"# Open postings — {t.label} ({len(sub)})", "", "| id | Tier | Company | Role | Location | Posted | H-1B | Link |",
                 "|---|---|---|---|---|---|---|---|"]
        lines += [f"| {r['id']} | T{r['tier']} | {r['company']} | {r['title']} | {r['locations']} | {r['posted']} "
                  f"| {r.get('h1b') or '-'} | {r['link']} |" for r in sub]
        out[f"jobs-{t.id}.md"] = "\n".join(lines) + "\n"
    return out


def runnable_zip(cfg, files: list[tuple[str, Path]], dest: Path) -> None:
    """Workspace files at their real paths + the jobhunt package, so `python -m jobhunt` runs from the unzip folder."""
    pkg = Path(jobhunt.__file__).parent
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(pkg.rglob("*")):
            rel = p.relative_to(pkg.parent)
            if p.is_dir() or "__pycache__" in p.parts or "scaffold" in rel.parts:
                continue
            z.write(p, rel.as_posix())
        for _, src in files:
            z.write(src, src.relative_to(cfg.root).as_posix())


def build(cfg, out: Path | None = None) -> Path:
    out = Path(out or cfg.root / "chat-kit")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "INSTRUCTIONS.md").write_text(INSTRUCTIONS, encoding="utf-8")
    texts: list[tuple[str, str]] = []
    seen = set()
    files = collect(cfg)
    for name, src in files:
        if name in seen:                                  # flattened name collision: keep the first
            continue
        seen.add(name)
        shutil.copyfile(src, out / name)
        texts.append((name, src.read_text(encoding="utf-8")))
    for name, text in jobs_by_track(cfg).items():
        (out / name).write_text(text, encoding="utf-8")
        texts.append((name, text))
    allin = ["# Job-search workspace (all files in one)", "", INSTRUCTIONS]
    for name, text in texts:
        fence = "```" + ("yaml" if name.endswith(".yaml") else "csv" if name.endswith(".csv") else "markdown")
        allin += [f"\n---\n\n## File: {name}\n", fence, text.rstrip(), "```"]
    (out / "ALL-IN-ONE.md").write_text("\n".join(allin) + "\n", encoding="utf-8")
    runnable_zip(cfg, files, out / "jobhunt-runnable.zip")
    bundle = out.with_suffix(".zip")
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out.iterdir()):
            z.write(p, f"{out.name}/{p.name}")
    return out
