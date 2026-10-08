import datetime as dt
import json

import pytest
import yaml

from jobhunt import config
from jobhunt.jobs import filters, pipeline
from jobhunt.jobs.classify import EXCLUDED, Classifier
from jobhunt.jobs.model import Job
from jobhunt.jobs.sources import SourceError
from jobhunt.util import read_csv

DAY1, DAY2, DAY3 = dt.date(2026, 10, 1), dt.date(2026, 10, 2), dt.date(2026, 10, 3)


def listing(id, company, title, locs=("Pittsburgh, PA",), url="", active=True, terms=("Summer 2027",), **kw):
    return {"id": id, "company_name": company, "title": title, "locations": list(locs), "terms": list(terms),
            "active": active, "url": url, "date_posted": 1790000000, "degrees": kw.get("degrees", []),
            "sponsorship": kw.get("sponsorship", ""), "category": kw.get("category", "Software")}


def gh(id, title, loc="Mountain View, CA"):
    return {"id": id, "title": title, "location": {"name": loc}, "absolute_url": f"https://boards.greenhouse.io/x/jobs/{id}",
            "first_published": "2026-09-30T00:00:00Z"}


class FakeNet:
    """URL → response; a URL mapped to an Exception raises it."""

    def __init__(self, routes):
        self.routes = routes

    def __call__(self, url, body=None, raw=False, timeout=30, **_):
        for key, val in self.routes.items():
            if key in url:
                if isinstance(val, Exception):
                    raise val
                return val
        raise SourceError(f"no route for {url}")


def setup_ws(workspace, listings, sources=None, **cfg_changes):
    (workspace / "listings.json").write_text(json.dumps(listings), encoding="utf-8")
    raw = yaml.safe_load((workspace / "jobhunt.yaml").read_text(encoding="utf-8"))
    raw["sources"] = sources if sources is not None else [
        {"type": "simplify", "file": "listings.json", "repo": "SimplifyJobs/Summer2027-Internships"},
        {"type": "ats", "companies": [{"company": "Waymo", "ats": "greenhouse", "board": "waymo", "local_default": True}]},
    ]
    raw["visa"]["h1b_records"] = False
    raw.update(cfg_changes)
    (workspace / "jobhunt.yaml").write_text(yaml.safe_dump(raw, sort_keys=False), encoding="utf-8")
    return config.load(workspace)


BASE = [
    listing("s1", "Waymo LLC", "Software Engineering Intern, Perception (Summer 2027)",
            url="https://boards.greenhouse.io/waymo/jobs/7012345"),
    listing("s2", "Acme Robotics", "Robotics Software Intern"),
    listing("s3", "Raytheon", "Robotics Intern"),                                   # excluded company
    listing("s4", "Globex", "Marketing Intern"),                                    # non-tech
    listing("s5", "Initech", "Software Engineer Intern", locs=["Toronto, ON"]),     # not US
    listing("s6", "Hooli", "Machine Learning Intern", active=False),                # closed
]
NET = FakeNet({"greenhouse.io/v1/boards/waymo": {"jobs": [
    gh(7012345, "Software Engineering Intern, Perception"),                         # same job as s1 (token)
    gh(7099999, "Robotics Software Intern"),                                         # only on the career site
    gh(7088888, "Senior Robotics Engineer"),                                         # not an internship
]}})


def test_first_run_is_baseline_and_merges_sources(workspace):
    cfg = setup_ws(workspace, BASE)
    out = pipeline.run(cfg, DAY1, get=NET)
    rows = {r["id"]: r for r in out["rows"]}
    assert out["first_run"] and out["new"] == []
    assert set(rows) == {"s1", "s2", "greenhouse-waymo-7099999"}
    assert rows["s1"]["also"] == "greenhouse-waymo-7012345" and rows["s1"]["track"] == "robotics"
    assert rows["greenhouse-waymo-7099999"]["source"] == "ats"
    assert out["excluded"] == 1
    assert "First run" in (workspace / "data" / "new_jobs.md").read_text()
    _, csv_rows = read_csv(workspace / "data" / "jobs.csv")
    assert [r["id"] for r in csv_rows] == ["greenhouse-waymo-7099999", "s1", "s2"]   # track, tier, company


def test_second_run_lists_only_new_in_notify_tracks(workspace):
    cfg = setup_ws(workspace, BASE)
    pipeline.run(cfg, DAY1, get=NET)
    more = BASE + [listing("s7", "Umbrella", "Embedded Firmware Intern"),           # ml track → notify
                   listing("s8", "Vandelay", "Software Developer Intern")]           # swe track → not notified
    setup_ws(workspace, more)
    out = pipeline.run(config.load(workspace), DAY2, get=NET)
    assert [r["id"] for r in out["new"]] == ["s7"]
    md = (workspace / "data" / "new_jobs.md").read_text()
    assert "Umbrella" in md and "Vandelay" not in md
    assert (workspace / "data" / ".has_new").read_text() == "1"


def test_seen_via_also_is_not_new(workspace):
    """A job first seen on a career site, later listed by Simplify, isn't announced twice."""
    cfg = setup_ws(workspace, [listing("s2", "Acme Robotics", "Robotics Software Intern")])
    pipeline.run(cfg, DAY1, get=NET)
    setup_ws(workspace, BASE)
    out = pipeline.run(config.load(workspace), DAY2, get=NET)
    assert out["new"] == []


def test_new_source_is_baseline_only(workspace):
    cfg = setup_ws(workspace, BASE, sources=[{"type": "simplify", "file": "listings.json"}])
    pipeline.run(cfg, DAY1, get=NET)
    cfg = setup_ws(workspace, BASE)                                         # add the ats source
    out = pipeline.run(cfg, DAY2, get=NET)
    assert out["new"] == []
    assert "baseline only today" in (workspace / "data" / "new_jobs.md").read_text()


def test_failing_source_keeps_last_rows_for_a_while(workspace):
    cfg = setup_ws(workspace, BASE)
    pipeline.run(cfg, DAY1, get=NET)
    down = FakeNet({"greenhouse.io": SourceError("HTTP 503")})
    out = pipeline.run(cfg, DAY2, get=down)
    ids = {r["id"] for r in out["rows"]}
    assert "greenhouse-waymo-7099999" in ids and out["new"] == []
    assert any("Waymo" in w and "503" in w for w in out["warnings"])
    out = pipeline.run(cfg, DAY2 + dt.timedelta(days=pipeline.CARRY_DAYS), get=down)
    assert "greenhouse-waymo-7099999" not in {r["id"] for r in out["rows"]}
    assert any("no longer keeping" in w for w in out["warnings"])


def test_broken_simplify_never_breaks_the_digest(workspace):
    cfg = setup_ws(workspace, BASE, sources=[{"type": "simplify", "repo": "x/y"},
                                            {"type": "ats", "companies": [{"company": "Waymo", "ats": "greenhouse",
                                                                           "board": "waymo"}]}])
    out = pipeline.run(cfg, DAY1, get=NET)                                  # simplify URL has no route
    assert any(w.startswith("simplify:") for w in out["warnings"])
    assert {r["company"] for r in out["rows"]} == {"Waymo"}


def test_module_source_and_only(workspace):
    (workspace / "sources" / "mine.py").write_text(
        "def fetch(spec, ctx):\n"
        "    return [{'id': 'm-1', 'company': 'Pied Piper', 'title': 'Backend Software Intern',\n"
        "             'link': 'https://pp.example/1', 'locations': ['Palo Alto, CA']}]\n", encoding="utf-8")
    cfg = setup_ws(workspace, BASE, sources=[{"type": "module", "name": "mine", "path": "sources/mine.py"}])
    out = pipeline.run(cfg, DAY1, get=NET)
    assert [(r["id"], r["track"], r["source"]) for r in out["rows"]] == [("m-1", "swe", "mine")]
    out = pipeline.run(cfg, DAY2, get=NET, only=set())                      # nothing fetched: rows kept
    assert [r["id"] for r in out["rows"]] == ["m-1"] and out["warnings"] == []


def test_duplicate_source_names_rejected(workspace):
    cfg = setup_ws(workspace, BASE, sources=[{"type": "simplify", "file": "a"}, {"type": "simplify", "file": "b"}])
    with pytest.raises(SourceError, match="named 'simplify'"):
        pipeline.run(cfg, DAY1, get=NET)


def test_zh_tw_report(workspace):
    cfg = setup_ws(workspace, BASE, language="zh-TW")
    pipeline.run(cfg, DAY1, get=NET)
    setup_ws(workspace, BASE + [listing("s9", "Acme Robotics", "Perception Intern")], language="zh-TW")
    pipeline.run(config.load(workspace), DAY2, get=NET)
    md = (workspace / "data" / "new_jobs.md").read_text()
    assert md.startswith("# 新職缺 2026-10-02") and "| Tier | 公司 | 職缺 |" in md


# ---------------------------------------------------------------- filters and classification

def job(title, locs=("Austin, TX",), **kw):
    return Job(id="x", company=kw.pop("company", "Acme"), title=title, link="", locations=list(locs), **kw)


@pytest.mark.parametrize("title,ok", [
    ("Software Engineer Intern", True),
    ("Software Engineer Intern - Summer 2027", True),
    ("Software Engineer Intern - Summer 2026", False),
    ("Software Engineer Co-op, Fall 2027", False),
    ("Robotics Intern (Spring)", False),
    ("Senior Software Engineer", False),
])
def test_intern_term_filter(title, ok):
    assert filters.keep(job(title), {"country": "US", "employment": "intern", "term": "Summer 2027"}) is ok


@pytest.mark.parametrize("title,ok", [
    ("Software Engineer, New Grad 2027", True),
    ("Software Engineer I", True),
    ("Senior Software Engineer", False),
    ("Software Engineering Intern", False),
])
def test_fulltime_filter(title, ok):
    assert filters.keep(job(title), {"country": "US", "employment": "fulltime"}) is ok


def test_country_rules():
    us = {"country": "US", "employment": "any"}
    assert filters.keep(job("x", ["Remote - US"]), us)
    assert not filters.keep(job("x", ["London, UK"]), us)
    assert not filters.keep(job("x", ["Santa Clara"]), us)                    # can't tell → no
    assert filters.keep(job("x", ["Santa Clara"], local_default=True), us)     # company says it's local
    assert not filters.keep(job("x", ["Santa Clara", "Toronto, ON"], local_default=True), us)
    assert filters.keep(job("x", ["Toronto, ON", "Seattle, WA"]), us)        # any US location counts
    assert not filters.keep(job("x", ["NYC"], countries=["elsewhere"]), us)  # explicit country wins
    with pytest.raises(ValueError, match="no location matcher"):
        filters.keep(job("x"), {"country": "TW"})


def test_phd_only():
    assert filters.phd_only("Research Intern - PhD")
    assert not filters.phd_only("Research Intern - MS/PhD")
    assert not filters.phd_only("Research Intern", ["Master's", "PhD"])


def test_classifier(cfg):
    c = Classifier(cfg)
    assert c("Waymo", "Software Engineering Intern") == ("robotics", 1)          # company match, tier 1
    assert c("Lockheed Martin", "Software Intern") == (EXCLUDED, 3)
    assert c("Acme", "Software Intern - requires clearance")[0] == EXCLUDED
    assert c("Acme", "Marketing Intern")[0] is None
    assert c("Acme", "Embedded Firmware Intern")[0] == "ml"
    assert c("Acme", "Barista")[0] is None


def test_track_max_tier(workspace):
    raw = yaml.safe_load((workspace / "jobhunt.yaml").read_text())
    raw["tracks"] = [{"id": "ai", "titles": ["\\bai\\b"], "max_tier": 2}, {"id": "swe", "titles": ["intern"]}]
    raw["notify"]["tracks"] = []
    c = Classifier(config.from_dict(raw, workspace))
    assert c("Waymo", "AI Intern")[0] == "ai"
    assert c("Unknown Startup", "AI Intern")[0] == "swe"
