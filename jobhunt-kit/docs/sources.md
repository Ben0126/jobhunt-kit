# Job sources

A source is anything that returns postings. Configure as many as you like; they're merged.

```yaml
sources:
  - type: simplify
    repo: SimplifyJobs/Summer2027-Internships
  - type: ats
    companies: [...]
  - type: module
    name: my-board
    path: sources/my_board.py
```

Every entry may set `name` (default: its type); names must be unique. The pipeline then, for every posting:
keeps it if it passes `search` (country, employment, term, PhD) → assigns a track (or drops/excludes it) →
merges it with the same posting from an earlier source (same requisition id in the links at the same employer,
or same company + normalized title) → marks it new if no id of it was seen before.

Reliability rules: a source that throws is a warning; its rows from the last run are kept for 7 days. The first
day a source exists is baseline only. `jobhunt sources` dry-runs every source and shows counts per track.

## simplify

[SimplifyJobs](https://github.com/SimplifyJobs) lists (`listings.json` with open/closed flags, terms, degrees,
sponsorship). `repo:` `SimplifyJobs/Summer2027-Internships`, `SimplifyJobs/New-Grad-Positions`, or a fork.
Optional: `branch` (default `dev`), `url` (a full listings.json URL), `file` (local copy), `skip_categories`.

## ats — company career sites

```yaml
  - type: ats
    file: companies.yaml          # optional: a long list in its own file
    companies:
      - {company: Waymo, ats: greenhouse, board: waymo, local_default: true}
```

| `ats` | `board` | find it at |
|---|---|---|
| greenhouse | slug | `boards.greenhouse.io/<slug>` or `job-boards.greenhouse.io/<slug>` |
| lever | slug | `jobs.lever.co/<slug>` |
| ashby | slug | `jobs.ashbyhq.com/<slug>` |
| smartrecruiters | company id | `jobs.smartrecruiters.com/<id>` |
| workable | account | `apply.workable.com/<account>` |
| workday | `<tenant>.<wdN>/<site>` | `<tenant>.<wdN>.myworkdayjobs.com/<site>`; optional `facets` (that tenant's filter ids, e.g. intern), `us_facet`, `search` |
| eightfold | `<host>\|<domain>` | Microsoft, Qualcomm… |
| jibe | host | AMD, Garmin… |
| oracle | `<host>\|<site>` | `*.oraclecloud.com/.../sites/<site>` |
| rmk | host | SAP SuccessFactors career sites |
| amazon, google, apple, tsmc | (ignored) | one-off readers for those companies (US sites) |

`local_default: true` — the company is in your country and often writes only a city ("Santa Clara"):
unknown places count as local unless they name another country.

Don't add sites whose terms forbid automated access (e.g. Meta, LinkedIn).

## module — your own

```python
# sources/my_board.py
def fetch(spec, ctx):
    data = ctx.get(spec["url"])                 # JSON with retries; ctx.get(url, raw=True) for HTML
    return [{"id": f"myboard-{x['id']}", "company": x["company"], "title": x["title"],
             "link": x["url"], "locations": [x["city"]], "posted": x["date"][:10]} for x in data]
```

Return `jobhunt.jobs.model.Job` objects or dicts with its fields. Required: `id` (stable, unique — prefix it),
`company`, `title`, `link`. Helpful: `locations`, `posted`, `employment` (`intern`/`fulltime` if the site says),
`countries` (if the site says), `terms`, `degrees`, `sponsor` (`yes`/`no`). `ctx.cfg` is the config,
`ctx.today` the run date, `ctx.warnings.append(...)` adds a digest warning. Raise any exception to mark the
source failed for the day.

To contribute a source to jobhunt-kit itself: add `jobhunt/jobs/sources/<name>.py` with `fetch(spec, ctx)`,
register it in `registry()` in `jobhunt/jobs/sources/__init__.py`, and add an offline test with a fake `ctx.get`.

## Adding a country

The pipeline is country-agnostic except for location matching. To add one (e.g. Taiwan):

1. In `jobhunt/jobs/filters.py`, write `is_tw(loc) -> True | False | None` (city/county names, 台灣/臺灣/Taiwan,
   and the obvious non-matches) and add it to `COUNTRY_MATCHERS` and `COUNTRY_ALIASES`.
2. Add sources that list jobs there (see the roadmap for Taiwan).
3. Sources that know the country should set `countries` on each `Job` — then no guessing is needed.
