"""Renderers turn a resolved resume (see resume.model.resolve) into a PDF.

    resume:
      renderer: builtin                 # HTML template → PDF with PyMuPDF (no system packages needed)
      template: classic                 # a built-in template, or a path to your own .html.j2 in the workspace
      paper: letter                     # letter | a4

    resume:
      renderer: {module: tools/my_renderer.py}    # bring your own: def render(doc, out_path, options) -> None

Whatever renders the PDF, the framework then checks the page count (one_page variants must be one page),
stamps the version number and fact/voice checks have already run — so a custom renderer only draws.
"""
from __future__ import annotations

import importlib.util
from dataclasses import dataclass
from pathlib import Path


class RenderError(Exception):
    pass


@dataclass
class Rendered:
    path: Path
    pages: int
    scale: float = 1.0          # builtin: how much it had to shrink to fit one page (1.0 = not at all)


def get_renderer(cfg):
    spec = cfg["resume"].get("renderer") or "builtin"
    options = {"paper": cfg["resume"].get("paper", "letter"), "template": cfg["resume"].get("template", "classic"),
               "root": cfg.root, "lang": cfg.lang}
    if spec == "builtin":
        from jobhunt.resume.render import builtin   # noqa: PLC0415
        return lambda doc, out: builtin.render(doc, out, options)
    if isinstance(spec, dict) and spec.get("module"):
        path = Path(spec["module"])
        path = path if path.is_absolute() else cfg.root / path
        if not path.exists():
            raise RenderError(f"renderer module {path} not found")
        mod_spec = importlib.util.spec_from_file_location("jobhunt_user_renderer", path)
        module = importlib.util.module_from_spec(mod_spec)
        mod_spec.loader.exec_module(module)
        if not hasattr(module, "render"):
            raise RenderError(f"{path} has no render(doc, out_path, options) function")

        def run(doc, out):
            out.parent.mkdir(parents=True, exist_ok=True)
            module.render(doc, out, {**options, **spec})
            import pymupdf   # noqa: PLC0415
            with pymupdf.open(out) as pdf:
                return Rendered(out, pdf.page_count)
        return run
    raise RenderError(f"resume.renderer must be 'builtin' or {{module: path}}, got {spec!r}")
