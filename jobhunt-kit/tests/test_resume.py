import pymupdf
import pytest
import yaml

from jobhunt import config
from jobhunt.resume import archive, build, fact_check, model, tailor, versioning
from jobhunt.resume.model import ResumeError
from jobhunt.resume.voice_check import Voice
from jobhunt.tracker import applications

from conftest import git

TARGET = "example-acme-perception"


def edit_target(root, **changes):
    path = root / "targets" / f"{TARGET}.yaml"
    t = yaml.safe_load(path.read_text(encoding="utf-8"))
    t.update(changes)
    path.write_text(yaml.safe_dump(t, sort_keys=False, allow_unicode=True), encoding="utf-8")


def test_template_builds_one_page_each(cfg):
    results = build.build(cfg)
    assert [r.error for r in results if not r.ok] == []
    assert {r.name for r in results} == {"robotics", "ml", "swe", TARGET}
    assert all(r.pages == 1 for r in results)
    assert [r.version for r in results] == ["V1.1.0", "V2.1.0", "V3.1.0", "V1.1.0"]


def test_pdf_text_layer_is_ats_friendly(cfg):
    (r,) = build.build(cfg, ["robotics"])
    with pymupdf.open(r.path) as pdf:
        text = pdf[0].get_text()
        links = [l["uri"] for l in pdf[0].get_links()]
    assert "field tests" in text                                   # ligatures expanded, not "ﬁeld"
    assert not any(0xFB00 <= ord(c) <= 0xFB06 for c in text)
    assert "Carnegie Mellon University, Pittsburgh, PA\nAug 2026 – May 2028" in text   # date next to its school
    assert "https://github.com/alexchen-example" in links


def test_same_content_keeps_version_and_draft_when_uncommitted(cfg, workspace):
    first = build.build(cfg, ["robotics"])[0]
    again = build.build(cfg, ["robotics"])[0]
    assert (first.version, again.version, again.note) == ("V1.1.0", "V1.1.0", "")
    data = (workspace / "resume.yaml").read_text(encoding="utf-8")
    (workspace / "resume.yaml").write_text(data.replace("cut average path time by 18%", "cut average path time by 18% in tests"),
                                           encoding="utf-8")
    draft = build.build(cfg, ["robotics"])[0]
    assert draft.version == "V1.2.0-draft"
    assert versioning.read_stamp(draft.path) == "V1.2.0-draft"
    git(workspace, "commit", "-qam", "edit")
    assert build.build(cfg, ["robotics"])[0].version == "V1.2.0"


def test_invented_number_fails_the_build(cfg, workspace):
    edit_target(workspace, bullet_overrides={"acme_planner": "Wrote a C++ planner for 14 robots, 18% faster paths."})
    (r,) = build.build(cfg, [TARGET])
    assert not r.ok and "14" in r.error and "bullet_overrides.acme_planner" in r.error


def test_ai_voice_fails_the_build(cfg, workspace):
    edit_target(workspace, summary="Leveraged robust planning; shipped it.")
    (r,) = build.build(cfg, [TARGET])
    assert not r.ok
    assert "Leveraged" in r.error and "robust" in r.error and "semicolon" in r.error


def test_voice_config_extra_and_allowed_words():
    v = Voice(extra_words=["synergize"], allow_words=["proven"])
    assert v.problems("We synergize.") and not v.problems("A proven method.")


def test_unknown_or_wrong_variant_bullet(cfg, workspace):
    edit_target(workspace, bullet_order={"x": ["nope"]})
    assert "unknown bullet id 'nope'" in build.build(cfg, [TARGET])[0].error
    edit_target(workspace, bullet_order={"projects": ["tasks_api"]})          # swe-only project
    assert "not in the 'robotics' variant" in build.build(cfg, [TARGET])[0].error


def test_tailor_order_overrides_and_skills(cfg):
    data = model.load(cfg.resume_source)
    t = tailor.load_target(cfg.path("targets") / f"{TARGET}.yaml")
    doc = model.resolve(tailor.tailor(data, t), "robotics")
    secs = {s["kind"]: s for s in doc["sections"]}
    acme = secs["experience"]["items"][0]
    assert len(acme["bullets"]) == 2 and acme["bullets"][0].startswith("Wrote a C++ motion planner")
    assert secs["experience"]["items"][1]["bullets"][0].startswith("Trained a YOLO pallet detector")
    assert [p["name"] for p in secs["projects"]["items"]] == ["Drone racing policy"]
    assert secs["skills"]["lines"][0] == {"label": "Robotics", "items": ["ROS 2, Gazebo, motion planning, state estimation"]}
    assert secs["summary"]["text"].endswith("Jetson Orin.")


def test_variant_tags_filter_content(cfg):
    data = model.load(cfg.resume_source)
    swe = {s["kind"]: s for s in model.resolve(data, "swe")["sections"]}
    names = [p["name"] for p in swe["projects"]["items"]]
    assert names == ["Drone racing policy", "Team task tracker"]
    assert swe["projects"]["items"][0]["bullets"] == [
        "Ran a 3-seed ablation and reported which design choices mattered and which did not."]


def test_resume_validation():
    with pytest.raises(ResumeError, match="basics.name"):
        model.validate({"variants": {"a": {}}})
    with pytest.raises(ResumeError, match="unknown variant 'zz'"):
        model.validate({"basics": {"name": "x"}, "variants": {"a": {}},
                        "experience": [{"bullets": [{"text": "t", "variants": ["zz"]}]}]})


def test_fact_check_units_and_dates():
    assert fact_check.numbers("40% faster, 3x, 2,000 images, Jan 2025, 2023–24") == {"40%", "3x", "2000"}
    assert fact_check.unsupported({"summary": "40 percent"}, {"a": "40%"}) == {}


def test_archive_freezes_sent_pdf(cfg, workspace):
    fields, rows = applications.load(cfg)
    rows.append({"job_id": "job-1", "company": "Acme Robotics", "role": "Perception Intern",
                 "resume_version": f"targets/{TARGET}", "status": "Applied", "applied_date": "2026-10-08"})
    applications.save(cfg, fields, rows)
    preview = archive.run(cfg, TARGET)
    assert preview["written"] is None and preview["stem"] == "2026-10-08_acme-robotics_example-acme-perception"
    out = archive.run(cfg, TARGET, write=True)
    assert out["written"].name == "2026-10-08_acme-robotics_example-acme-perception_V1.1.0.pdf"
    row = applications.find(applications.load(cfg)[1], "job-1")
    assert row["resume_rev"] == "V1.1.0" and row["resume_file"].startswith("submitted/")
    with pytest.raises(archive.ArchiveError, match="already archived"):
        archive.run(cfg, TARGET, write=True)


def test_archive_refuses_drafts(cfg, workspace):
    fields, rows = applications.load(cfg)
    rows.append({"job_id": "job-2", "company": "Beta", "role": "Intern", "resume_version": "swe", "status": "Applied"})
    applications.save(cfg, fields, rows)
    (workspace / "resume.yaml").write_text((workspace / "resume.yaml").read_text().replace("25 lab members", "25 lab members daily"))
    with pytest.raises(archive.ArchiveError, match="no registered version"):
        archive.run(cfg, "job-2", write=True)


def test_custom_renderer_module(workspace):
    (workspace / "my_renderer.py").write_text(
        "import pymupdf\n"
        "def render(doc, out, options):\n"
        "    pdf = pymupdf.open(); page = pdf.new_page(); page.insert_text((72, 72), doc['basics']['name'])\n"
        "    pdf.save(out)\n", encoding="utf-8")
    text = (workspace / "jobhunt.yaml").read_text().replace("renderer: builtin", "renderer: {module: my_renderer.py}")
    (workspace / "jobhunt.yaml").write_text(text)
    cfg = config.load(workspace)
    (r,) = build.build(cfg, ["swe"])
    assert r.ok and r.pages == 1 and r.version == "V3.1.0-draft"      # jobhunt.yaml + module uncommitted
