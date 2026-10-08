# jobhunt.yaml reference

Every key is optional except what your sources and tracks need; defaults live in `jobhunt/config.py` (`DEFAULTS`).
`jobhunt init` writes a commented example.

## profile

| Key | Default | |
|---|---|---|
| `name` | `""` | used in tailored PDF names |
| `pdf_name` | `"{name}_{id}.pdf"` | `{name}` = name with `_` for spaces, `{id}` = target id |

## language

`en` (default) or `zh-TW`. Language of `new_jobs.md` / `followup.md`, and default status names.

## search

| Key | Default | |
|---|---|---|
| `country` | `US` | location matcher; a posting matches when *any* of its locations is in the country. Only `US` exists today ([add one](sources.md#adding-a-country)) |
| `employment` | `intern` | `intern` (title says intern/co-op, or the source says so), `fulltime` (new grad / entry level / "Engineer I"; drops senior titles and internships), `any` |
| `term` | `""` | e.g. `Summer 2027`: postings tagged with terms must include it; otherwise a title naming another year or season is dropped |
| `exclude_phd_only` | `true` | drop PhD-only postings ("MS/PhD" stays) |
| `query` | by employment | keyword for career sites that need a search term (`intern` / `new grad`) |

## sources

A list; see [sources.md](sources.md). Order matters: when two sources list the same posting, the first keeps the row.

## tracks

Your job categories, most important first. A posting goes to the **first** track whose `titles` match its title
or whose `companies` match its company; postings that match no track are dropped.

```yaml
tracks:
  - id: robotics            # required, unique
    label: Robotics         # shown in the digest (default: id)
    resume: robotics        # resume variant to start from (default: id)
    titles: [robot, autonom, "motion planning"]     # regex fragments, case-insensitive
    companies: [waymo, "boston dynamics"]
    exclude_titles: [sales]                          # skip this track for these titles
    max_tier: 0             # e.g. 2: title matches count only at tier-1/2 companies (company matches always count)
```

Quote fragments that contain YAML syntax (`"locali[sz]ation"`, `"c\\+\\+"`).

## notify

`tracks: [robotics, ml]` — only these appear as new in the daily digest. `[]` = all.

## exclude

| Key | |
|---|---|
| `companies` | regex fragments → counted as "excluded", never listed (e.g. defense contractors) |
| `titles` | same, by title (e.g. `clearance`, `citizen`) |
| `non_tech_titles` | dropped silently (marketing, sales, finance … by default) |

Simplify's "U.S. Citizenship is Required" flag is always excluded.

## tiers

`{1: [...], 2: [...]}` regex fragments; everything else is the next tier (3). Shown as T1/T2/T3 and used to sort.

## visa

`h1b_records: true` — tag each employer with its H-1B LCA / green-card filing history
([msampath/h1b-sponsor-data](https://github.com/msampath/h1b-sponsor-data)): strong / moderate / weak / staffing / none.
Downloads an ~8 MB index into `data/h1b/` (git-ignored) once per data release.

## followup

`nudge_days: 10` (applied, no update, you have a contact → suggest a follow-up), `ghost_days: 28`.

## statuses

Names used in `applications.csv`; change them to your language. Defaults (zh-TW defaults in parentheses):

```yaml
statuses:
  todo: To apply                                  # (待投遞)
  applied: Applied                                # (已投遞)
  active: [Applied, Online assessment, Interviewing]
  responded: [Online assessment, Interviewing, Offer, Rejected]   # counted in the reply rate
  not_sent: [To apply, Withdrawn]                 # not counted as sent
  ghosted: No response                            # suggested status for ghosted applications
```

## resume

| Key | Default | |
|---|---|---|
| `source` | `resume.yaml` | |
| `renderer` | `builtin` | or `{module: tools/my_renderer.py}` — see [resume.md](resume.md#bring-your-own-renderer) |
| `template` | `classic` | built-in template name, or a path to your own `.html.j2` |
| `paper` | `letter` | `letter` or `a4` |
| `voice.extra_words` | `[]` | more regex words to fail as AI-sounding |
| `voice.allow_words` | `[]` | built-in banned words to allow |

## llm

Only for `jobhunt tailor` (and the `jobhunt-tailor` Action). Keys always come from the environment.

| Key | Default | |
|---|---|---|
| `provider` | `""` | `anthropic`, `openai` or `gemini` |
| `model` | `""` | anthropic: default `claude-opus-5-5`; openai / gemini: required |
| `effort` | `high` | anthropic reasoning effort |
| `api_key_env` | `""` | env var with the key (default: the SDK's — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) |
| `base_url` | `""` | openai only: an OpenAI-compatible server (Ollama, a proxy) via Chat Completions |
| `max_tokens` | `16000` | |
| `fallbacks` | `true` | anthropic: on a safety decline, re-run on Anthropic's recommended fallback model |

## paths

`targets`, `data`, `dist`, `submitted` — folders relative to the workspace.
