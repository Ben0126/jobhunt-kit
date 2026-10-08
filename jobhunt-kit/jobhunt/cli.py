"""jobhunt — command line.

    jobhunt init my-job-hunt          create a workspace (then edit jobhunt.yaml and resume.yaml)
    jobhunt daily                     fetch jobs + follow-up reminders (what the GitHub Action runs)
    jobhunt fetch [--source NAME]     only the job feed
    jobhunt sources                   try every source and show what each returns (writes nothing)
    jobhunt followup                  only the follow-up reminders
    jobhunt build [variant|target…]   build resume PDFs into dist/
    jobhunt check [target…]           fact + plain-voice checks without building
    jobhunt ats PDF [--jd F] [--keywords "a,b"]   what an ATS reads from a PDF
    jobhunt track JOB_ID              start tracking a job from jobs.csv in applications.csv
    jobhunt archive KEY [--write]     freeze the PDF you sent into submitted/
    jobhunt chat-kit                  files for ChatGPT / Claude / Gemini chat projects (chat-kit/ + chat-kit.zip)
    jobhunt tailor URL|FILE           draft targets/<id>.yaml with an LLM API (llm: in jobhunt.yaml), validated

Every command takes --workspace DIR (default: $JOBHUNT_HOME, or the folder holding jobhunt.yaml).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from jobhunt import config as config_mod


def _cfg(args):
    return config_mod.load(Path(args.workspace) if args.workspace else None)


def cmd_init(args) -> int:
    from jobhunt.scaffold import init   # noqa: PLC0415
    created = init.create(Path(args.dir), force=args.force, language=args.language)
    print(f"Workspace ready: {Path(args.dir).resolve()} ({len(created)} files)")
    print("Next: open it with your AI (Claude Code, Codex, Gemini CLI…) and say \"set up my job hunt\", or run")
    print("`jobhunt chat-kit` for a ChatGPT / Claude / Gemini chat project. Then: jobhunt build && jobhunt sources")
    return 0


def cmd_chat_kit(args) -> int:
    from jobhunt import chat_kit   # noqa: PLC0415
    cfg = _cfg(args)
    out = chat_kit.build(cfg, Path(args.out) if args.out else None)
    files = sorted(p.name for p in out.iterdir())
    print(f"ok    {out}  ({len(files)} files) + {out.with_suffix('.zip').name}")
    print("Upload the files to a ChatGPT Project / Claude Project / Gemini Gem and paste INSTRUCTIONS.md into its")
    print("instructions (or upload just ALL-IN-ONE.md). Re-run after changes; don't share it — it holds your resume.")
    return 0


def cmd_tailor(args) -> int:
    from jobhunt import llm   # noqa: PLC0415
    from jobhunt.resume import auto_tailor   # noqa: PLC0415
    cfg = _cfg(args)
    try:
        out = auto_tailor.run(cfg, args.source, args.id or "", args.force)
    except (auto_tailor.TailorError, llm.LLMError) as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 1
    t = out["target"]
    print(f"ok    {out['path'].relative_to(cfg.root)}  ({llm.describe(cfg['llm'])}, {out['rounds']} round"
          f"{'s' * (out['rounds'] != 1)})  fit {t.get('fit', '?')}")
    for q in t.get("confirm") or []:
        print(f"  confirm: {q}")
    for g in t.get("gaps") or []:
        print(f"  gap:     {g}")
    print(f"Next: answer the confirm items, empty `confirm`, then `jobhunt build {t['id']}` and a review "
          "(a different AI or chat is best).")
    return 0


def cmd_feed(args) -> int:
    from jobhunt.jobs import feed   # noqa: PLC0415
    cfg = _cfg(args)
    try:
        out = feed.export(cfg, Path(args.out), args.min_jobs)
    except feed.FeedError as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 1
    print(f"ok    {args.out}  ({out['count']} postings)")
    return 0


def cmd_mcp(args) -> int:
    from jobhunt import mcp_server   # noqa: PLC0415
    root = Path(args.workspace) if args.workspace else config_mod.find_root()
    config_mod.load(root)                                  # fail fast on a bad workspace
    try:
        mcp_server.main(root)
    except ImportError:
        print('FAIL  the MCP SDK isn\'t installed: pip install "jobhunt-kit[mcp]"', file=sys.stderr)
        return 1
    return 0


def cmd_web_import(args) -> int:
    from jobhunt import webio   # noqa: PLC0415
    root = Path(args.workspace or ".")
    try:
        out = webio.import_backup(root, webio.read_backup(Path(args.backup)))
    except (webio.WebIOError, ValueError) as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 1
    print(f"ok    {root}: resume, {out['targets']} target(s), {out['applications']} application(s)")
    return 0


def cmd_web_export(args) -> int:
    from jobhunt import webio   # noqa: PLC0415
    data = webio.export_backup(_cfg(args))
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"ok    {args.out} — open the web app → Settings → Import backup")
    return 0


def cmd_fetch(args) -> int:
    from jobhunt.jobs import pipeline   # noqa: PLC0415
    cfg = _cfg(args)
    out = pipeline.run(cfg, only=set(args.source) if args.source else None,
                       h1b_enabled=False if args.no_h1b else None)
    print(f"jobs={len(out['rows'])} new={len(out['new'])} excluded={out['excluded']} "
          + " ".join(f"{k}={v}" for k, v in out["by_source"].items()))
    for w in out["warnings"]:
        print(f"WARN  {w}")
    print(f"→ {(cfg.data / 'new_jobs.md').relative_to(cfg.root)}")
    return 0


def cmd_sources(args) -> int:
    from jobhunt.jobs import filters   # noqa: PLC0415
    from jobhunt.jobs.classify import EXCLUDED, Classifier   # noqa: PLC0415
    from jobhunt.jobs.sources import Context, registry, specs   # noqa: PLC0415
    cfg = _cfg(args)
    ctx, classify = Context(cfg=cfg, today=dt.date.today()), Classifier(cfg)
    for spec in specs(cfg):
        if args.source and spec["name"] not in args.source:
            continue
        before = len(ctx.warnings)
        try:
            jobs = registry()[spec["type"]](spec, ctx)
        except Exception as e:  # noqa: BLE001
            print(f"FAIL  {spec['name']}: {e}")
            continue
        kept = [j for j in jobs if filters.keep(j, cfg["search"])]
        tracks = {}
        for j in kept:
            t, _ = classify(j.company, j.title, j.extra.get("sponsorship", ""))
            tracks[t or "-"] = tracks.get(t or "-", 0) + 1
        print(f"ok    {spec['name']}: {len(jobs)} postings, {len(kept)} pass search filters → "
              + ", ".join(f"{k} {v}" for k, v in sorted(tracks.items(), key=lambda kv: kv[0] == EXCLUDED)))
        for w in ctx.warnings[before:]:
            print(f"WARN  {w}")
    return 0


def cmd_followup(args) -> int:
    from jobhunt.tracker import followup   # noqa: PLC0415
    print(followup.run(_cfg(args))["text"])
    return 0


def cmd_daily(args) -> int:
    args.source, args.no_h1b = None, False
    rc = cmd_fetch(args)
    from jobhunt.tracker import followup   # noqa: PLC0415
    cfg = _cfg(args)
    followup.run(cfg)
    has = any((cfg.data / f).exists() and (cfg.data / f).read_text().strip() == "1" for f in (".has_new", ".has_todo"))
    (cfg.data / ".notify").write_text("1" if has else "0")
    return rc


def cmd_build(args) -> int:
    from jobhunt.resume import build   # noqa: PLC0415
    from jobhunt.resume.model import ResumeError   # noqa: PLC0415
    cfg = _cfg(args)
    try:
        results = build.build(cfg, args.keys)
    except ResumeError as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 1
    for r in results:
        if r.ok:
            shown = r.path.relative_to(cfg.root) if r.path.is_relative_to(cfg.root) else r.path
            size = "" if r.scale == 1 else f", shrunk to {r.scale:.0%}"
            print(f"ok    {r.version:<14} {shown}  ({r.pages} page{'s' * (r.pages != 1)}{size})"
                  + (f"  ← {r.note}" if r.note else ""))
        else:
            print(f"FAIL  {r.name}: {r.error}", file=sys.stderr)
    return 0 if all(r.ok for r in results) else 1


def cmd_check(args) -> int:
    from jobhunt.resume import fact_check, model, tailor   # noqa: PLC0415
    from jobhunt.resume.voice_check import Voice, describe   # noqa: PLC0415
    cfg = _cfg(args)
    data = model.load(cfg.resume_source)
    voice, bad = Voice.from_config(cfg), False
    if not args.ids:
        hard, soft = voice.check_resume(data), voice.check_resume(data, soft=True)
        bad |= bool(hard)
        print(f"FAIL  resume.yaml → {describe(hard)}" if hard else "ok    resume.yaml")
        if soft:
            print(f"NOTE  resume.yaml → {describe(soft)}")
    paths = tailor.target_paths(cfg)
    for tid in args.ids or list(paths):
        tid = tid.removeprefix("targets/")
        if tid not in paths:
            print(f"FAIL  {tid}: no targets/{tid}.yaml")
            bad = True
            continue
        t = tailor.load_target(paths[tid])
        printed, answers = fact_check.unsupported(t, data), fact_check.unsupported(t, data, ("application_answers",))
        hard, soft = voice.check(t), voice.check(t, soft=True)
        v_answers = voice.check(t, ("application_answers",))
        problems = []
        if printed:
            problems.append(f"numbers not in resume.yaml → {fact_check.describe(printed)}")
        if hard:
            problems.append(f"voice → {describe(hard)}")
        bad |= bool(printed or hard)
        print(f"FAIL  {tid}: " + " | ".join(problems) if problems else f"ok    {tid}")
        if t.get("confirm"):
            print(f"TODO  {tid}: confirm has {len(t['confirm'])} open item(s) — don't send until it's empty")
        if answers:
            print(f"WARN  {tid}: application answers use numbers not in resume.yaml → {fact_check.describe(answers)}")
        if v_answers:
            print(f"WARN  {tid}: application answers → {describe(v_answers)}")
        if soft:
            print(f"NOTE  {tid}: {describe(soft)}")
    return 1 if bad else 0


def cmd_ats(args) -> int:
    from jobhunt.resume import ats_check   # noqa: PLC0415
    jd = Path(args.jd).read_text(encoding="utf-8") if args.jd else None
    kws = [k for k in args.keywords.split(",")] if args.keywords else None
    out, _ = ats_check.report(args.pdf, kws, jd, args.text, one_page=not args.multi_page)
    print(out)
    return 0


def cmd_track(args) -> int:
    from jobhunt.tracker import applications   # noqa: PLC0415
    cfg = _cfg(args)
    try:
        row = applications.add_from_jobs(cfg, args.job_id, args.resume or "", args.status or "")
    except applications.AppError as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 1
    print(f"ok    tracking {row['company']} — {row['role']} ({row['status']}, resume {row['resume_version'] or '?'})")
    return 0


def cmd_archive(args) -> int:
    from jobhunt.resume import archive   # noqa: PLC0415
    cfg = _cfg(args)
    try:
        out = archive.run(cfg, args.key, args.date, args.write)
    except (archive.ArchiveError, ValueError) as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 1
    row = out["row"]
    print(f"{row['company']} — {row['role']}  (resume {out['version']})")
    if out["written"] is None:
        print(f"  would save  submitted/{out['stem']}_<version>.pdf and fill resume_file / resume_rev / resume_commit")
        print("  (preview only — add --write to do it)")
    else:
        print(f"  saved  {out['written'].relative_to(cfg.root)}  ({out['rev']})")
        print("  commit it: git add submitted data/applications.csv data/resume_versions.csv")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="jobhunt", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workspace", help="workspace folder (default: $JOBHUNT_HOME or the folder holding jobhunt.yaml)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="create a workspace")
    p.add_argument("dir")
    p.add_argument("--force", action="store_true", help="also overwrite files that already exist")
    p.add_argument("--language", choices=["en", "zh-TW"], default="en", help="report language and status names")
    p.set_defaults(fn=cmd_init)

    p = sub.add_parser("daily", help="fetch jobs + follow-up reminders")
    p.set_defaults(fn=cmd_daily)

    p = sub.add_parser("fetch", help="run the job feed")
    p.add_argument("--source", action="append", help="only fetch this source (repeatable); others keep last rows")
    p.add_argument("--no-h1b", action="store_true", help="skip H-1B annotation")
    p.set_defaults(fn=cmd_fetch)

    p = sub.add_parser("feed", help="export open postings as compact JSON for the web app")
    p.add_argument("--out", required=True)
    p.add_argument("--min-jobs", type=int, default=50, help="refuse to publish fewer postings than this")
    p.set_defaults(fn=cmd_feed)

    p = sub.add_parser("sources", help="try each source, show counts; writes nothing")
    p.add_argument("--source", action="append")
    p.set_defaults(fn=cmd_sources)

    p = sub.add_parser("mcp", help="run the MCP server (stdio) for desktop AI apps")
    p.set_defaults(fn=cmd_mcp)

    p = sub.add_parser("web-import", help="write the web app's backup.json into a workspace (created if needed)")
    p.add_argument("backup")
    p.set_defaults(fn=cmd_web_import)

    p = sub.add_parser("web-export", help="a backup.json the web app can import")
    p.add_argument("--out", default="backup.json")
    p.set_defaults(fn=cmd_web_export)

    p = sub.add_parser("tailor", help="draft a target for one job with an LLM API")
    p.add_argument("source", help="job posting URL, a text file with the description, or - for stdin")
    p.add_argument("--id", help="target id to use (default: the model picks <company>-<role>)")
    p.add_argument("--force", action="store_true", help="replace an existing target with that id")
    p.set_defaults(fn=cmd_tailor)

    p = sub.add_parser("chat-kit", help="bundle files for ChatGPT / Claude / Gemini chat projects")
    p.add_argument("--out", help="output folder (default: chat-kit/)")
    p.set_defaults(fn=cmd_chat_kit)

    p = sub.add_parser("followup", help="follow-up reminders")
    p.set_defaults(fn=cmd_followup)

    p = sub.add_parser("build", help="build resume PDFs")
    p.add_argument("keys", nargs="*", help="variant names or target ids; default all")
    p.set_defaults(fn=cmd_build)

    p = sub.add_parser("check", help="fact + voice checks")
    p.add_argument("ids", nargs="*", help="target ids; default resume.yaml + all targets")
    p.set_defaults(fn=cmd_check)

    p = sub.add_parser("ats", help="ATS plain-text check of a PDF")
    p.add_argument("pdf", type=Path)
    p.add_argument("--jd", help="job description text file")
    p.add_argument("--keywords", help='comma-separated, e.g. "C++,ROS 2,PyTorch"')
    p.add_argument("--text", action="store_true", help="also print the extracted text")
    p.add_argument("--multi-page", action="store_true", help="don't warn about more than one page (academic CV)")
    p.set_defaults(fn=cmd_ats)

    p = sub.add_parser("track", help="add a job from jobs.csv to applications.csv")
    p.add_argument("job_id")
    p.add_argument("--resume", help="resume_version (default: the track's resume)")
    p.add_argument("--status", help="initial status (default: statuses.todo)")
    p.set_defaults(fn=cmd_track)

    p = sub.add_parser("archive", help="freeze the PDF you sent")
    p.add_argument("key", help="job_id (or 6+ char prefix) or target id")
    p.add_argument("--date", help="applied date YYYY-MM-DD (default: the row's applied_date, else today)")
    p.add_argument("--write", action="store_true", help="actually do it (default: preview)")
    p.set_defaults(fn=cmd_archive)

    args = ap.parse_args(argv)
    try:
        return args.fn(args)
    except config_mod.ConfigError as e:
        print(f"FAIL  {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
