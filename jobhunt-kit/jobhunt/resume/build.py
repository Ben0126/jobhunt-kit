"""Build resume PDFs: every general variant, and every tailored target.

    jobhunt build                       # all variants + all targets
    jobhunt build robotics              # one variant
    jobhunt build acme-perception       # one target (also accepts targets/acme-perception)

Output (git-ignored, since PDFs carry your phone number):
    dist/resume-<variant>.pdf           one-page variants (cv-<variant>.pdf when one_page: false)
    dist/targets/<profile.pdf_name>     tailored resumes

A target build fails when: a number isn't in resume.yaml (fact_check), the wording reads AI-written
(voice_check), a bullet id is wrong (tailor), or a one-page resume doesn't fit on one page.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from jobhunt.resume import fact_check, model, tailor, versioning
from jobhunt.resume.tailor import target_paths
from jobhunt.resume.model import ResumeError
from jobhunt.resume.render import RenderError, get_renderer
from jobhunt.resume.voice_check import Voice, describe as describe_voice
from jobhunt.util import committed, git_out


@dataclass
class Result:
    kind: str                     # variant | target
    name: str
    path: Path | None = None
    version: str = ""
    note: str = ""
    pages: int = 0
    scale: float = 1.0
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error


def variant_file(data: dict, variant: str) -> str:
    one_page = model.variant_spec(data, variant)["one_page"]
    return f"{'resume' if one_page else 'cv'}-{variant}.pdf"


def resolve_keys(cfg, data: dict, keys: list[str]) -> tuple[list[str], list[Path]]:
    variants, targets = list(data["variants"]), target_paths(cfg)
    if not keys:
        return variants, list(targets.values())
    want_v, want_t, unknown = [], [], []
    for key in keys:
        tid = key.split("/", 1)[1] if key.startswith("targets/") else key
        if not key.startswith("targets/") and key in variants:
            want_v.append(key)
        elif tid in targets:
            want_t.append(targets[tid])
        else:
            unknown.append(key)
    if unknown:
        raise ResumeError(f"unknown {unknown}; variants: {variants}, targets: {sorted(targets)}")
    return want_v, want_t


def check_target(cfg, data: dict, target: dict) -> None:
    """Raise ResumeError when the target's printed fields invent numbers or read AI-written."""
    missing = fact_check.unsupported(target, data)
    if missing:
        raise ResumeError(f"numbers not found in resume.yaml — {fact_check.describe(missing)} "
                          "(true? add it to resume.yaml; otherwise remove it from the target)")
    voice = Voice.from_config(cfg).check(target)
    if voice:
        raise ResumeError(f"wording reads AI-written — {describe_voice(voice)} (rewrite in plain words)")


def source_paths(cfg, target_path: Path | None) -> list[str]:
    """Files whose changes change the PDF; all must be committed before a version number is registered."""
    paths = [cfg["resume"]["source"], "jobhunt.yaml"]
    tpl = str(cfg["resume"].get("template") or "")
    if Path(tpl).suffix:
        paths.append(tpl)
    r = cfg["resume"].get("renderer")
    if isinstance(r, dict) and r.get("module"):
        paths.append(r["module"])
    if target_path is not None:
        paths.append(str(target_path.relative_to(cfg.root)))
    return paths


def build(cfg, keys: list[str] | None = None, register: bool = True) -> list[Result]:
    data = model.load(cfg.resume_source)
    variants, targets = resolve_keys(cfg, data, keys or [])
    render = get_renderer(cfg)
    dist = cfg.path("dist")
    registry = cfg.data / "resume_versions.csv"
    commit = git_out(cfg.root, "rev-parse", "--short", "HEAD") or ""
    jobs = [("variant", v) for v in variants] + [("target", p) for p in targets]
    results = []
    for kind, what in jobs:
        res = Result(kind, what if kind == "variant" else what.stem)
        try:
            if kind == "variant":
                doc, out, variant = model.resolve(data, what), dist / variant_file(data, what), what
                resume_key, tpath = what, None
            else:
                t = tailor.load_target(what)
                check_target(cfg, data, t)
                variant = t.get("base_variant")
                doc = model.resolve(tailor.tailor(data, t), variant)
                out, resume_key, tpath = dist / "targets" / cfg.pdf_name(t["id"]), f"targets/{t['id']}", what
            r = render(doc, out)
            res.path, res.pages, res.scale = r.path, r.pages, r.scale
            major = int(model.variant_spec(data, variant)["major"])
            is_committed = register and committed(cfg.root, source_paths(cfg, tpath))
            res.version, res.note = versioning.assign(r.path, resume_key, major, registry, is_committed, commit)
        except (ResumeError, RenderError) as e:
            res.error = str(e)
        results.append(res)
    return results
