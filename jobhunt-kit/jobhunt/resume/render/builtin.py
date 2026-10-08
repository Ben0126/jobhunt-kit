"""Built-in renderer: Jinja2 HTML template → PDF via PyMuPDF's Story (pure pip, no browser, no LaTeX).

One-page variants are fitted by shrinking font size and spacing in small steps (down to MIN_SCALE). If it
still doesn't fit, the build fails — cut content instead of printing 8pt text.

Templates: `templates/<name>.html.j2` here, or any path in your workspace. A template receives
`doc` (see resume.model.resolve), `scale` (1.0 → MIN_SCALE) and `pt(x)` = x * scale formatted for CSS.
Copy classic.html.j2 into your workspace to start your own.
"""
from __future__ import annotations

import re
from pathlib import Path

import jinja2
import pymupdf

from jobhunt.resume.render import Rendered, RenderError

HERE = Path(__file__).parent / "templates"
MARGIN = 36                     # pt (0.5 in)
MIN_SCALE = 0.86
STEP = 0.02


def _template(name: str, root: Path) -> jinja2.Template:
    path = Path(name)
    if path.suffix:                                     # a file path in the workspace
        path = path if path.is_absolute() else Path(root) / path
        if not path.exists():
            raise RenderError(f"template {path} not found")
        loader = jinja2.FileSystemLoader([str(path.parent), str(HERE)])
        filename = path.name
    else:
        if not (HERE / f"{name}.html.j2").exists():
            raise RenderError(f"no built-in template {name!r} (have: {[p.name.split('.')[0] for p in HERE.glob('*.html.j2')]})")
        loader = jinja2.FileSystemLoader(str(HERE))
        filename = f"{name}.html.j2"
    env = jinja2.Environment(loader=loader, autoescape=True, trim_blocks=True, lstrip_blocks=True)
    return env.get_template(filename)


LIGATURES = {0xFB00: "ff", 0xFB01: "fi", 0xFB02: "fl", 0xFB03: "ffi", 0xFB04: "ffl", 0xFB05: "st", 0xFB06: "st"}
_HEX = r"<([0-9a-fA-F]+)>"


def _parse_cmap(text: str) -> dict[int, str]:
    """ToUnicode CMap → {glyph code: unicode text}."""
    out = {}
    for block in re.findall(r"beginbfchar(.*?)endbfchar", text, re.S):
        for src, dst in re.findall(_HEX + r"\s*" + _HEX, block):
            out[int(src, 16)] = bytes.fromhex(dst).decode("utf-16-be", "replace")
    for block in re.findall(r"beginbfrange(.*?)endbfrange", text, re.S):
        for lo, hi, rest in re.findall(_HEX + r"\s*" + _HEX + r"\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)", block):
            lo, hi = int(lo, 16), int(hi, 16)
            if rest.startswith("["):
                for i, d in enumerate(re.findall(_HEX, rest)):
                    out[lo + i] = bytes.fromhex(d).decode("utf-16-be", "replace")
            else:
                base = bytes.fromhex(rest[1:-1]).decode("utf-16-be", "replace")
                for i in range(hi - lo + 1):
                    out[lo + i] = base[:-1] + chr(ord(base[-1]) + i)
    return out


def expand_ligatures(doc: pymupdf.Document) -> int:
    """The HTML engine draws fi/ff/fl as ligature glyphs and maps them to U+FB01 etc., so an ATS reads
    "ﬁeld". Rewrite each font's ToUnicode map so those glyphs read as plain letters (what LaTeX does);
    the page looks the same. Returns how many maps were rewritten."""
    fixed = 0
    for xref in range(1, doc.xref_length()):
        kind, val = doc.xref_get_key(xref, "ToUnicode")
        if kind != "xref":
            continue
        tu = int(val.split()[0])
        text = doc.xref_stream(tu).decode("latin-1")
        if not re.search(r"<fb0[0-6]>", text, re.I):
            continue
        cmap = _parse_cmap(text)
        if not any(ord(c) in LIGATURES for v in cmap.values() for c in v):
            continue
        cmap = {k: "".join(LIGATURES.get(ord(c), c) for c in v) for k, v in cmap.items()}
        width = len(re.search(r"begincodespacerange\s*" + _HEX, text).group(1))
        items = sorted(cmap.items())
        blocks = []
        for i in range(0, len(items), 100):
            chunk = items[i:i + 100]
            lines = [f"<{k:0{width}x}> <{v.encode('utf-16-be').hex()}>" for k, v in chunk]
            blocks.append(f"{len(chunk)} beginbfchar\n" + "\n".join(lines) + "\nendbfchar")
        head = text[:min(m.start() for m in re.finditer(r"\d+\s+beginbf(char|range)", text))]
        tail = text[max(m.end() for m in re.finditer(r"endbf(char|range)", text)):]
        doc.update_stream(tu, (head + "\n".join(blocks) + tail).encode("latin-1"))
        fixed += 1
    return fixed


def _write(html: str, paper: str, out: Path, meta: dict) -> int:
    rect = pymupdf.paper_rect(paper)
    where = rect + (MARGIN, MARGIN, -MARGIN, -MARGIN)
    story = pymupdf.Story(html)
    doc = story.write_with_links(lambda n, filled: (rect, where, None))
    doc.set_metadata({**doc.metadata, **meta})
    expand_ligatures(doc)
    out.parent.mkdir(parents=True, exist_ok=True)
    pages = doc.page_count
    doc.save(out, garbage=3, deflate=True)
    doc.close()
    return pages


def render(doc: dict, out: Path, options: dict) -> Rendered:
    tpl = _template(options.get("template") or "classic", options.get("root") or Path.cwd())
    paper = options.get("paper") or "letter"
    meta = {"title": f"{doc['basics']['name']} — Resume", "author": doc["basics"]["name"], "creator": "jobhunt-kit"}
    out = Path(out)
    scale = 1.0
    while True:
        html = tpl.render(doc=doc, scale=scale, pt=lambda x, s=scale: f"{x * s:.2f}pt")
        pages = _write(html, paper, out, meta)
        if pages == 1 or not doc.get("one_page") or scale - STEP < MIN_SCALE - 1e-9:
            break
        scale = round(scale - STEP, 3)
    if doc.get("one_page") and pages > 1:
        raise RenderError(f"{out.name}: {pages} pages even at {scale:.0%} size — cut a bullet or two "
                          "(one_page variant)")
    return Rendered(out, pages, scale)
