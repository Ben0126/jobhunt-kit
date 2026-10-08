# resume.yaml, targets and layout

## resume.yaml

The single source of truth. Full shape with comments: the docstring of `jobhunt/resume/model.py`, and the example
`jobhunt init` writes.

- `basics`: name, email, phone, location, links (`{label, url}`; the label is printed, so make it the URL text —
  ATSs read text, not hyperlinks).
- `variants`: your general resumes, e.g. robotics / ml / swe. Each: `title`, `major` (first digit of its
  version numbers), `one_page` (default true), `sections` (order, default the top-level `sections`).
- `summary`: `default` plus per-variant wording.
- `education`, `experience`, `projects`: entries with `dates` as you want them printed. Experience/project
  bullets: `{id, text, variants}`. `variants: [...]` on an entry, bullet or skills line limits where it appears.
- `skills`: `{label, items, variants}` lines.
- `section_titles`: rename headings, e.g. `{projects: Selected Projects}`.

## targets/<id>.yaml

Overrides for one job; see the docstring of `jobhunt/resume/tailor.py`. Printed fields: `summary`,
`skills_order`, `bullet_overrides` (plus the choice in `bullet_order`). Everything else is notes.

Build-time checks for targets:

| Check | Fails when |
|---|---|
| fact_check | a number in a printed field isn't anywhere in resume.yaml (percentages and multiples must match with their unit; years and dates ignored) |
| voice_check | AI-sounding words, a semicolon, more than one parenthesis in a sentence (skills lines exempt from the last two) |
| tailor | unknown bullet id, a bullet not in `base_variant`, a malformed skills line |
| layout | a one-page variant needs more than one page even at 86% size |

`jobhunt check` runs the first two without building and also warns on `application_answers` and open `confirm`.

## Versions

`V<major>.<minor>.<patch>`: major = the variant's `major`; minor = printed text changed; patch = only layout changed.
Identical content reuses the earlier number. Numbers are registered in `data/resume_versions.csv` only when
`resume.yaml`, `jobhunt.yaml`, the target and any custom template/renderer are committed; otherwise
`…-draft`. The number is in the PDF's Subject property, not its file name.

## Layout

The built-in renderer fills a Jinja2 HTML template and lays it out with PyMuPDF's Story engine:

- One-page variants shrink font and spacing in 2% steps down to 86%; still too long → the build fails.
- Fonts: `classic` uses Times (Nimbus Roman — renders "C++" cleanly); `serif`, `sans-serif`, `Helvetica` also work. CJK text falls back to built-in CJK fonts.
- The text layer is post-processed so ligatures read as letters (`fi`, not `ﬁ`).
- Templates get `doc` (see `resume.model.resolve`), `scale`, and `pt(x)`; CSS support is a subset of the web
  (blocks, tables, margins, borders, fonts — no flexbox/grid). Start from
  `jobhunt/resume/render/templates/classic.html.j2`, copy it into your workspace, set `resume.template: my.html.j2`.

### Bring your own renderer

```yaml
resume:
  renderer: {module: tools/my_renderer.py}
```

```python
def render(doc, out_path, options):    # doc: the resolved resume; write a PDF to out_path
    ...
```

The framework still runs the fact/voice checks before, and the page count and versioning after.
