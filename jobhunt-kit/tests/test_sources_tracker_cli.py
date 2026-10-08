import datetime as dt

from jobhunt import cli, config
from jobhunt.jobs.sources import Context, ats
from jobhunt.scaffold import init
from jobhunt.tracker import applications, followup

from test_jobs import FakeNet


def ctx(cfg, routes):
    return Context(cfg=cfg, today=dt.date(2026, 10, 8), get=FakeNet(routes))


def test_ats_readers(cfg):
    routes = {
        "api.lever.co/v0/postings/acme": [
            {"id": "aaaa1111-2222-3333-4444-555566667777", "text": "Robotics Intern",
             "categories": {"location": "Boston, MA", "commitment": "Intern"}, "createdAt": 1790000000000,
             "hostedUrl": "https://jobs.lever.co/acme/aaaa"}],
        "api.ashbyhq.com/posting-api/job-board/beta": {"jobs": [
            {"id": "b1", "title": "ML Intern", "location": "Santa Clara", "employmentType": "Intern",
             "address": {"postalAddress": {"addressCountry": "United States"}}, "jobUrl": "https://ashby/b1"},
            {"id": "b2", "title": "Hidden", "isListed": False}]},
        "nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/Ext/jobs": {"total": 1, "jobPostings": [
            {"title": "Robotics Software Intern", "externalPath": "/job/US-CA-Santa-Clara/Robotics-Intern_JR2001234",
             "bulletFields": ["JR2001234"], "locationsText": "US, CA, Santa Clara", "postedOn": "Posted 3 Days Ago"}]},
    }
    c = ctx(cfg, routes)
    lever = ats.fetch_company({"company": "Acme", "ats": "lever", "board": "acme"}, c)
    assert (lever[0].id, lever[0].employment, lever[0].posted) == ("lever-acme-aaaa1111-2222-3333-4444-555566667777",
                                                                    "intern", "2026-09-21")
    ashby = ats.fetch_company({"company": "Beta", "ats": "ashby", "board": "beta"}, c)
    assert [(j.id, j.countries) for j in ashby] == [("ashby-beta-b1", ["US"])]
    wd = ats.fetch_company({"company": "NVIDIA", "ats": "workday", "board": "nvidia.wd5/Ext"}, c)
    assert (wd[0].id, wd[0].posted, wd[0].tokens) == ("workday-nvidia-JR2001234", "2026-10-05", ["jr2001234"])


def test_ats_one_company_failing_is_a_warning(cfg):
    c = ctx(cfg, {"boards-api.greenhouse.io/v1/boards/ok": {"jobs": []}})
    spec = {"name": "ats", "companies": [{"company": "OK", "ats": "greenhouse", "board": "ok"},
                                         {"company": "Down", "ats": "greenhouse", "board": "down"}]}
    assert ats.fetch(spec, c) == []
    assert spec["_failed_prefixes"] == ["greenhouse-down-"] and "Down" in c.warnings[0]


def test_followup(cfg):
    fields, rows = applications.load(cfg)
    rows += [
        {"job_id": "1", "company": "A", "role": "r", "status": "Applied", "applied_date": "2026-09-20",
         "last_update": "2026-09-20", "contact": "Pat"},                                 # 18 days + contact → nudge
        {"job_id": "2", "company": "B", "role": "r", "status": "Applied", "last_update": "2026-09-01"},   # ghosted
        {"job_id": "3", "company": "C", "role": "r", "status": "Interviewing", "next_action": "thank-you note",
         "next_action_date": "2026-10-08"},
        {"job_id": "4", "company": "D", "role": "r", "status": "To apply"},
    ]
    applications.save(cfg, fields, rows)
    out = followup.run(cfg, dt.date(2026, 10, 8))
    assert any("follow up with Pat" in t for t in out["todo"]) and any("thank-you note" in t for t in out["todo"])
    assert len(out["ghost"]) == 1 and "No response" in out["ghost"][0]
    assert "Reply rate (any response / sent): 33%" in out["text"]


def test_track_from_jobs(cfg, workspace):
    (workspace / "data" / "jobs.csv").write_text(
        "id,track,tier,company,title,locations,degrees,posted,link,source,also,sponsor,h1b,h1b_lca\n"
        "s1,robotics,1,Waymo,Perception Intern,CA,,2026-10-01,https://x,simplify,gh-1,,,\n")
    row = applications.add_from_jobs(cfg, "gh-1", today=dt.date(2026, 10, 8))
    assert (row["job_id"], row["resume_version"], row["status"]) == ("s1", "robotics", "To apply")
    assert cli.main(["--workspace", str(workspace), "track", "s1"]) == 1          # already tracked


def test_init_zh_tw_and_does_not_overwrite(tmp_path):
    root = tmp_path / "w"
    created = init.create(root, language="zh-TW")
    assert (root / "playbooks/review-lenses/ats.md").exists() and (root / ".claude/skills/resume-review/SKILL.md").exists()
    assert (root / ".github/workflows/jobhunt-daily.yml").exists() and (root / "submitted").is_dir()
    cfg = config.load(root)
    assert cfg.lang == "zh-TW" and cfg["statuses"]["applied"] == "已投遞"
    (root / "resume.yaml").write_text("mine")
    assert init.create(root) == [] and (root / "resume.yaml").read_text() == "mine"
    assert len(created) == len(init.files())


def test_cli_build_check_and_errors(workspace, tmp_path, capsys):
    ws = ["--workspace", str(workspace)]
    assert cli.main([*ws, "build", "swe"]) == 0
    assert "V3.1.0" in capsys.readouterr().out
    assert cli.main([*ws, "check"]) == 0
    assert cli.main([*ws, "build", "nope"]) == 1
    assert cli.main(["--workspace", str(tmp_path), "build"]) == 2                  # no jobhunt.yaml
    assert cli.main([*ws, "ats", str(workspace / "dist" / "resume-swe.pdf"), "--keywords", "Flask,Kubernetes"]) == 0
    out = capsys.readouterr().out
    assert "Present: Flask" in out and "Missing: Kubernetes" in out
