"""Company career sites, read straight from their public ATS APIs.

    - type: ats
      companies:
        - {company: Skydio, ats: greenhouse, board: skydio}
        - {company: Zipline, ats: greenhouse, board: zipline}
        - {company: Agility Robotics, ats: lever, board: agilityrobotics}
        - {company: NVIDIA, ats: workday, board: nvidia.wd5/NVIDIAExternalCareerSite,
           facets: {workerSubType: ["0c40f6bd1d8f10adf6dae42e46d44a17"]}}     # Intern (Fixed Term)

`ats` / `board` per system (how to find the board name: open the company's job page and look at the URL):

  greenhouse       boards.greenhouse.io/<board>
  lever            jobs.lever.co/<board>
  ashby            jobs.ashbyhq.com/<board>
  smartrecruiters  jobs.smartrecruiters.com/<board>
  workable         apply.workable.com/<board>
  workday          <tenant>.<wdN>.myworkdayjobs.com/<site>  → board: "<tenant>.<wdN>/<site>"
                   optional: facets (that tenant's filters), us_facet (its country facet name), search
  eightfold        board: "<host>|<domain>"   (Microsoft, Qualcomm, …)
  jibe             board: <host>              (AMD, Garmin, …)
  oracle           board: "<host>|<site>"     (Oracle Recruiting Cloud)
  rmk              board: <host>              (SAP SuccessFactors career sites)
  amazon, google, apple, tsmc                 (one-off company sites; board is ignored)

Optional per company: `local_default: true` — the company is in your country and often writes only a city.
A company that fails today only produces a warning; its rows from the last successful run are carried over
for a few days (see pipeline.CARRY_DAYS).
"""
from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import html
import json
import re

from jobhunt.jobs.filters import is_us
from jobhunt.jobs.model import Job
from jobhunt.jobs.sources import SourceError

WORKERS = 6
MAX_PAGES = 30
US_FACET = "bc33aa3152ec42d4995f4791a106ed09"    # Workday's "United States of America" (shared across tenants)


def board_prefix(b) -> str:
    """Job id prefix for one company: <ats>-<short board name>-."""
    name = str(b.get("board") or b["company"]).split("|")[-1].split("/")[0].lower()
    if b["ats"] in ("workday", "eightfold"):
        name = name.split(".")[0]
    elif b["ats"] in ("rmk", "jibe"):
        name = name.split(".")[-2] if name.count(".") else name
    elif b["ats"] in ("oracle", "amazon", "google", "apple", "tsmc"):
        name = b["company"]
    return f"{b['ats']}-{re.sub(r'[^a-z0-9]+', '', name.lower())}-"


def _date(ts=None, iso=None):
    try:
        if ts is not None:
            return dt.datetime.fromtimestamp(float(ts), dt.timezone.utc).date().isoformat()
        if iso:
            return dt.date.fromisoformat(str(iso)[:10]).isoformat()
    except (TypeError, ValueError, OSError):
        pass
    return ""


def _job(b, job_id, title, locs, posted, link, intern=None, us=None) -> Job:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(job_id)).strip("-")
    return Job(id=board_prefix(b) + token, company=b["company"], title=" ".join(html.unescape(str(title)).split()),
               link=link, locations=[str(x).strip() for x in locs if str(x).strip()], posted=posted,
               tokens=[token.lower()], employment="intern" if intern else "",
               countries=(["US"] if us else ["elsewhere"]) if us is not None else [],
               local_default=bool(b.get("local_default") or b.get("us_default")))


def _pages(fn):
    for page in range(MAX_PAGES):
        if fn(page):
            return
    raise SourceError(f"more than {MAX_PAGES} pages — results would be truncated")


# ---------------------------------------------------------------- one function per ATS

def greenhouse(b, ctx):
    d = ctx.get(f"https://boards-api.greenhouse.io/v1/boards/{b['board']}/jobs")
    return [_job(b, j["id"], j["title"], [(j.get("location") or {}).get("name", "")],
                 _date(iso=j.get("first_published") or j.get("updated_at")), j.get("absolute_url", ""))
            for j in d["jobs"]]


def ashby(b, ctx):
    d = ctx.get(f"https://api.ashbyhq.com/posting-api/job-board/{b['board']}")
    out = []
    for j in d["jobs"]:
        if j.get("isListed") is False:
            continue
        places = [j, *(j.get("secondaryLocations") or [])]
        countries = [((x.get("address") or {}).get("postalAddress") or {}).get("addressCountry") for x in places]
        us = any(str(c).strip().lower() in ("united states", "us", "usa") for c in countries) if any(countries) else None
        out.append(_job(b, j["id"], j["title"], [x.get("location", "") for x in places], _date(iso=j.get("publishedAt")),
                        j.get("jobUrl", ""), intern=j.get("employmentType") == "Intern", us=us))
    return out


def lever(b, ctx):
    d = ctx.get(f"https://api.lever.co/v0/postings/{b['board']}?mode=json")
    out = []
    for j in d:
        cat = j.get("categories") or {}
        out.append(_job(b, j["id"], j["text"], [cat.get("location", ""), *(cat.get("allLocations") or [])],
                        _date(ts=j["createdAt"] / 1000) if j.get("createdAt") else "", j.get("hostedUrl", ""),
                        intern="intern" in str(cat.get("commitment", "")).lower()))
    return out


def smartrecruiters(b, ctx):
    out, state = [], {"offset": 0}

    def page(_):
        d = ctx.get(f"https://api.smartrecruiters.com/v1/companies/{b['board']}/postings?limit=100&offset={state['offset']}")
        for j in d["content"]:
            loc = j.get("location") or {}
            intern = (j.get("typeOfEmployment") or {}).get("id") == "intern"
            out.append(_job(b, j["id"], j["name"], [loc.get("fullLocation", "")], _date(iso=j.get("releasedDate")),
                            f"https://jobs.smartrecruiters.com/{b['board']}/{j['id']}", intern=intern,
                            us=loc.get("country") == "us" if loc.get("country") else None))
        state["offset"] += 100
        return state["offset"] >= d.get("totalFound", 0)
    _pages(page)
    return out


def workable(b, ctx):
    d = ctx.get(f"https://apply.workable.com/api/v1/widget/accounts/{b['board']}")
    return [_job(b, j["shortcode"], j["title"], [", ".join(filter(None, (j.get("city"), j.get("state"), j.get("country"))))],
                 _date(iso=j.get("published_on")), j.get("url", "")) for j in d["jobs"]]


_POSTED = re.compile(r"posted (today|yesterday|(\d+)\+? days? ago)", re.I)


def _workday_posted(s, today):
    m = _POSTED.search(s or "")
    if not m:
        return ""
    days = 0 if m.group(1).lower() == "today" else 1 if m.group(1).lower() == "yesterday" else int(m.group(2))
    return (today - dt.timedelta(days=days)).isoformat()


def workday(b, ctx):
    host, site = b["board"].split("/")
    tenant = host.split(".")[0]
    facets = dict(b.get("facets") or {})
    if b.get("us_facet"):
        facets[b["us_facet"]] = [US_FACET]
    url = f"https://{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
    out, state = [], {"offset": 0, "total": None}

    def page(_):
        d = ctx.get(url, {"appliedFacets": facets, "limit": 20, "offset": state["offset"], "searchText": b.get("search", "")})
        if state["total"] is None:
            state["total"] = d.get("total", 0)
        for j in d.get("jobPostings") or []:
            path = j.get("externalPath", "")
            req = (j.get("bulletFields") or [path.rsplit("_", 1)[-1]])[0]
            loc = path.split("/")[2] if path.count("/") >= 3 else ""     # /job/<main location>/<title>_<req>
            us = True if b.get("us_facet") else (True if is_us(loc) else None)
            out.append(_job(b, req, j.get("title", ""), [j.get("locationsText", ""), loc] if us else [loc],
                            _workday_posted(j.get("postedOn"), ctx.today),
                            f"https://{host}.myworkdayjobs.com/en-US/{site}{path}", us=us))
        state["offset"] += 20
        return not d.get("jobPostings") or state["offset"] >= (state["total"] or 0)
    _pages(page)
    return out


def amazon(b, ctx):
    out, state = [], {"offset": 0}
    q = ctx.cfg.search_query() or "intern"

    def page(_):
        d = ctx.get(f"https://www.amazon.jobs/en/search.json?base_query={q.replace(' ', '+')}&country=USA"
                    f"&result_limit=100&offset={state['offset']}&sort=recent")
        for j in d.get("jobs") or []:
            try:
                posted = dt.datetime.strptime(j.get("posted_date", ""), "%B %d, %Y").date().isoformat()
            except ValueError:
                posted = ""
            out.append(_job(b, j["id_icims"], j["title"], [j.get("normalized_location") or j.get("location", "")], posted,
                            f"https://www.amazon.jobs{j.get('job_path', '')}",
                            us=j.get("country_code") == "USA" or bool(is_us(j.get("location", "")))))
        state["offset"] += 100
        return state["offset"] >= int(d.get("hits") or 0)
    _pages(page)
    return out


_GOOGLE_DATA = re.compile(r"AF_initDataCallback\(\{key: 'ds:1'.*?data:(.*?), sideChannel", re.S)


def google(b, ctx):
    """Server-rendered HTML; the data is an unlabeled array under ds:1 (a format change → failure, not silence)."""
    intern = ctx.search.get("employment") == "intern"
    level = "INTERN_AND_APPRENTICE" if intern else "EARLY"
    q = ctx.cfg.search_query() or ""
    out = []

    def page(i):
        text = ctx.get(f"https://www.google.com/about/careers/applications/jobs/results?q={q.replace(' ', '%20')}"
                       f"&location=United%20States&target_level={level}&page={i + 1}", raw=True)
        m = _GOOGLE_DATA.search(text)
        if not m:
            raise SourceError("Google page format changed (no ds:1)")
        jobs = (json.loads(m.group(1)) or [None])[0] or []
        for j in jobs:
            if not (isinstance(j, list) and len(j) > 12 and isinstance(j[1], str)):
                raise SourceError("Google job array format changed")
            locs = [x[0] for x in j[9] or [] if isinstance(x, list) and x]
            slug = re.sub(r"[^a-z0-9]+", "-", j[1].lower()).strip("-")
            posted = _date(ts=j[12][0]) if isinstance(j[12], list) and j[12] else ""
            out.append(_job(b, j[0], j[1], locs, posted,
                            f"https://www.google.com/about/careers/applications/jobs/results/{j[0]}-{slug}",
                            intern=intern, us=True))
        return len(jobs) < 20
    _pages(page)
    return out


_APPLE_DATA = re.compile(r"window\.__staticRouterHydrationData = JSON\.parse\((\".*?\")\);", re.S)


def apple(b, ctx):
    intern = ctx.search.get("employment") == "intern"
    team = "&team=internships-STDNT-INTRN" if intern else ""
    out = []

    def page(i):
        text = ctx.get(f"https://jobs.apple.com/en-us/search?location=united-states-USA{team}&page={i + 1}", raw=True)
        m = _APPLE_DATA.search(text)
        if not m:
            raise SourceError("Apple page format changed (no hydration data)")
        s = json.loads(json.loads(m.group(1)))["loaderData"]["search"]
        for j in s.get("searchResults") or []:
            locs = j.get("locations") or []
            out.append(_job(b, j["positionId"], j["postingTitle"], [x.get("name", "") for x in locs],
                            _date(iso=j.get("postDateInGMT")),
                            f"https://jobs.apple.com/en-us/details/{j['positionId']}/{j.get('transformedPostingTitle', '')}",
                            intern=intern, us=any(x.get("countryID") == "iso-country-USA" for x in locs)))
        return (i + 1) * 20 >= int(s.get("totalRecords") or 0)
    _pages(page)
    return out


def eightfold(b, ctx):
    host, domain = b["board"].split("|")
    q = (ctx.cfg.search_query() or "").replace(" ", "%20")
    out, state = [], {"start": 0}

    def page(_):
        d = ctx.get(f"https://{host}/api/pcsx/search?domain={domain}&query={q}&location=United%20States"
                    f"&start={state['start']}&sort_by=timestamp")["data"]
        for j in d.get("positions") or []:
            locs = j.get("standardizedLocations") or j.get("locations") or []
            out.append(_job(b, j.get("displayJobId") or j["id"], j["name"], locs, _date(ts=j.get("postedTs")),
                            f"https://{host}{j.get('positionUrl', '')}"))
        state["start"] += 10
        return not d.get("positions") or state["start"] >= int(d.get("count") or 0)
    _pages(page)
    return out


def jibe(b, ctx):
    q = (ctx.cfg.search_query() or "").replace(" ", "%20")
    out = []

    def page(i):
        d = ctx.get(f"https://{b['board']}/api/jobs?keywords={q}&country=United%20States&limit=100&page={i + 1}")
        for j in d.get("jobs") or []:
            x = j.get("data") or {}
            link = (x.get("meta_data") or {}).get("canonical_url") or f"https://{b['board']}/jobs/{x.get('req_id')}"
            out.append(_job(b, x["req_id"], x["title"], [x.get("full_location") or x.get("location_name", "")],
                            _date(iso=x.get("posted_date")), link.split("?")[0],
                            us=x.get("country_code") == "US" or x.get("country") == "United States"))
        return (i + 1) * 100 >= int(d.get("totalCount") or 0)
    _pages(page)
    return out


_TSMC_ART = re.compile(r'<article class="article article--result".*?</article>', re.S)


def tsmc(b, ctx):
    """TSMC US sites (Avature HTML). The location facet ids come from the web page; if they change, 0 results."""
    us = "%2C".join(["13221", "13218", "13219", "13220", "13222", "13223"])
    q = (ctx.cfg.search_query() or "intern").replace(" ", "%20")
    out, state = [], {"offset": 0}

    def page(_):
        text = ctx.get(f"https://careers.tsmc.com/en_US/careers/SearchJobs/{q}?listFilterMode=1&1277={us}"
                       f"&jobOffset={state['offset']}", raw=True)
        arts = _TSMC_ART.findall(text)
        if state["offset"] == 0 and not arts and not re.search(r"\b0\s+results?\b", text, re.I):
            raise SourceError("TSMC page format changed (no job blocks)")
        for a in arts:
            m = re.search(r'<a class="link" href="([^"]+)"[^>]*>(.*?)</a>', a, re.S)
            loc = re.search(r'list-item-location">(.*?)<', a, re.S)
            jid = re.search(r"jobId=(\d+)", m.group(1)) if m else None
            if m and jid:
                out.append(_job(b, jid.group(1), re.sub(r"<[^>]+>", "", m.group(2)),
                                [loc.group(1).strip() if loc else ""], "",
                                html.unescape(m.group(1)).split("&source")[0], us=True))
        state["offset"] += 10
        return len(arts) < 10
    _pages(page)
    return out


_RMK_ROW = re.compile(r'<tr class="data-row.*?</tr>', re.S)


def rmk(b, ctx):
    q = (ctx.cfg.search_query() or "").replace(" ", "+")
    out, state = [], {"start": 0, "total": None}

    def page(_):
        text = ctx.get(f"https://{b['board']}/search/?q={q}&startrow={state['start']}", raw=True)
        if state["total"] is None:
            m = re.search(r"of\s*<b>\s*([\d,]+)\s*</b>", text)
            if not m:
                raise SourceError(f"{b['company']} page format changed (no result count)")
            state["total"] = int(m.group(1).replace(",", ""))
        for tr in _RMK_ROW.findall(text):
            a = re.search(r'href="(/job/[^"]+?/(\d+)/?)"[^>]*>(.*?)</a>', tr, re.S)
            loc = re.search(r'<span class="jobLocation">\s*(.*?)\s*</span>', tr, re.S)
            if a:
                out.append(_job(b, a.group(2), re.sub(r"<[^>]+>", "", a.group(3)), [loc.group(1) if loc else ""], "",
                                f"https://{b['board']}{a.group(1)}",
                                us=bool(loc and re.search(r",\s*US\b", loc.group(1)))))
        state["start"] += 25
        return state["start"] >= state["total"]
    _pages(page)
    return out


def oracle(b, ctx):
    host, site = b["board"].split("|")
    base = f"https://{host}.oraclecloud.com"
    q = (ctx.cfg.search_query() or "").replace(" ", "%20")
    out, state = [], {"offset": 0}

    def page(_):
        d = ctx.get(f"{base}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList"
                    f"&finder=findReqs;siteNumber={site},limit=25,offset={state['offset']},keyword={q},sortBy=POSTING_DATES_DESC")
        item = (d.get("items") or [{}])[0]
        reqs = item.get("requisitionList") or []
        for j in reqs:
            out.append(_job(b, j["Id"], j.get("Title", ""), [j.get("PrimaryLocation", "")], _date(iso=j.get("PostedDate")),
                            f"{base}/hcmUI/CandidateExperience/en/sites/{site}/job/{j['Id']}",
                            us=j.get("PrimaryLocationCountry") == "US"))
        state["offset"] += 25
        return not reqs or state["offset"] >= int(item.get("TotalJobsCount") or 0)
    _pages(page)
    return out


FETCHERS = {"greenhouse": greenhouse, "ashby": ashby, "lever": lever, "smartrecruiters": smartrecruiters,
            "workable": workable, "workday": workday, "amazon": amazon, "google": google, "apple": apple,
            "eightfold": eightfold, "jibe": jibe, "tsmc": tsmc, "rmk": rmk, "oracle": oracle}


def fetch_company(b, ctx) -> list[Job]:
    if b.get("ats") not in FETCHERS:
        raise SourceError(f"{b.get('company')}: unknown ats {b.get('ats')!r} (one of {sorted(FETCHERS)})")
    seen, out = set(), []
    for j in FETCHERS[b["ats"]](b, ctx):
        if j.id not in seen:
            seen.add(j.id)
            out.append(j)
    return out


def fetch(spec: dict, ctx) -> list[Job]:
    """All companies in parallel. One company failing → a warning (and its previous rows carried over by the
    pipeline, via spec['_failed_prefixes']), never the whole source."""
    companies = spec.get("companies") or []
    if spec.get("file"):                                 # companies listed in a separate YAML file
        import yaml                                      # noqa: PLC0415
        companies = companies + (yaml.safe_load((ctx.cfg.root / spec["file"]).read_text(encoding="utf-8")) or [])
    jobs, failed = [], []
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(fetch_company, b, ctx): b for b in companies}
        for f in cf.as_completed(futs):
            b = futs[f]
            try:
                jobs += f.result()
            except Exception as e:  # noqa: BLE001 — one company's problem
                failed.append(board_prefix(b))
                ctx.warnings.append(f"{spec['name']}: {b.get('company')}: "
                                    f"{e if isinstance(e, SourceError) else type(e).__name__ + ' ' + str(e)[:120]}")
    spec["_failed_prefixes"] = failed
    if companies and len(failed) == len(companies):
        raise SourceError(f"all {len(companies)} companies failed")
    return jobs
