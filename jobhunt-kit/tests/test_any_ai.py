"""Working without Claude Code: LLM tailoring with any provider, the chat kit, tool-neutral instructions."""
import sys
import types
import zipfile

import pytest
import yaml

from jobhunt import chat_kit, config, llm
from jobhunt.resume import auto_tailor, build

JD = ("Acme Robotics — Perception Intern (Summer 2027). You will build perception for warehouse robots. "
      "Requirements: C++, ROS 2, PyTorch, experience deploying models on embedded GPUs such as Jetson. "
      "Nice to have: TensorRT, CUDA. ") * 5

GOOD = """```yaml
id: acme-perception
base_variant: robotics
summary: Robotics student who ships tested robot software, including a detector that runs at 30 FPS on a Jetson Orin.
bullet_order:
  lab: [lab_detector, lab_eval]
  acme: [acme_planner]
bullet_overrides:
  lab_detector: Trained a YOLO pallet detector and got it to 30 FPS on a Jetson Orin with TensorRT.
company: Acme Robotics
role: Perception Intern
fit: 4/5
keywords_hit: [C++, ROS 2, PyTorch, TensorRT]
gaps: [CUDA]
confirm: ["Is 'ships tested robot software' fair for the Acme internship?"]
```"""
BAD = GOOD.replace("30 FPS on a Jetson Orin with TensorRT", "45 FPS on a Jetson Orin with TensorRT").replace(
    "Robotics student who ships", "Robotics student who leveraged robust skills and ships")


class Script:
    """Fake LLM: returns canned replies in order and records what it was sent."""

    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []

    def __call__(self, system, messages):
        self.calls.append((system, [dict(m) for m in messages]))
        return self.replies.pop(0)


@pytest.fixture
def jd_file(workspace):
    p = workspace / "jd.txt"
    p.write_text(JD)
    return p


def test_tailor_fixes_invented_numbers_and_voice(cfg, jd_file):
    fake = Script(BAD, GOOD)
    out = auto_tailor.run(cfg, str(jd_file), complete=fake, log=lambda *_: None)
    assert out["rounds"] == 2 and out["path"].name == "acme-perception.yaml"
    retry = fake.calls[1][1][-1]["content"]
    assert "45" in retry and "leveraged" in retry.lower()
    system, first = fake.calls[0]
    assert "Never invent experience" in system and "Tailor a resume to one job" in system
    assert "lab_detector" in first[0]["content"] and "Perception Intern" in first[0]["content"]
    text = out["path"].read_text()
    assert text.startswith("# Drafted by ") and "confirm:" in text
    (r,) = build.build(cfg, ["acme-perception"])                               # the draft really builds
    assert r.ok, r.error


def test_tailor_gives_up_without_writing_a_target(cfg, jd_file):
    with pytest.raises(auto_tailor.TailorError, match="no valid draft after 3 rounds"):
        auto_tailor.run(cfg, str(jd_file), complete=Script(BAD, BAD, BAD), log=lambda *_: None)
    assert not (cfg.path("targets") / "acme-perception.yaml").exists()
    assert list(cfg.data.glob("tailor-failed-*.yaml"))


def test_tailor_rejects_unknown_bullets_and_existing_ids(cfg, jd_file):
    wrong = GOOD.replace("lab_eval", "lab_secret")
    fake = Script(wrong, GOOD)
    auto_tailor.run(cfg, str(jd_file), complete=fake, log=lambda *_: None)
    assert "unknown bullet id 'lab_secret'" in fake.calls[1][1][-1]["content"]
    with pytest.raises(auto_tailor.TailorError, match="already exists"):
        auto_tailor.run(cfg, str(jd_file), want_id="acme-perception", complete=Script(GOOD))


def test_read_job_from_html_and_js_only_pages():
    page = "<html><head><style>x{}</style></head><body><h1>Perception Intern</h1><ul><li>C++</li></ul>" + "<p>text</p>" * 120 + "</body></html>"
    text, url = auto_tailor.read_job("https://example.com/job", get=lambda u: page)
    assert url == "https://example.com/job" and "Perception Intern\n- C++" in text and "x{}" not in text
    with pytest.raises(auto_tailor.TailorError, match="JavaScript"):
        auto_tailor.read_job("https://example.com/workday", get=lambda u: "<div id=root></div>")


def test_llm_config_errors():
    with pytest.raises(llm.LLMError, match="llm.provider"):
        llm.complete({"provider": ""}, "s", [{"role": "user", "content": "x"}])
    with pytest.raises(llm.LLMError, match="llm.model"):
        llm.complete({"provider": "openai"}, "s", [{"role": "user", "content": "x"}])


def _fake_module(monkeypatch, name, module):
    monkeypatch.setitem(sys.modules, name, module)


def test_anthropic_adapter_uses_fallbacks_on_supported_models(monkeypatch):
    seen = {}

    class Resp:
        stop_reason = "end_turn"
        content = [types.SimpleNamespace(type="thinking", thinking=""), types.SimpleNamespace(type="text", text="ok")]

    class Msgs:
        def create(self, **kw):
            seen.update(kw)
            return Resp()

    class Client:
        def __init__(self, **kw):
            self.messages, self.beta = Msgs(), types.SimpleNamespace(messages=Msgs())

    fake = types.SimpleNamespace(Anthropic=Client, AuthenticationError=KeyError, NotFoundError=KeyError,
                                 RateLimitError=KeyError, APIStatusError=KeyError, APIConnectionError=KeyError)
    _fake_module(monkeypatch, "anthropic", fake)
    assert llm.complete({"provider": "anthropic", "effort": "high"}, "sys", [{"role": "user", "content": "hi"}]) == "ok"
    assert seen["model"] == "claude-opus-5-5" and seen["fallbacks"] == "default"
    assert seen["betas"] == ["server-side-fallback-2026-07-01"] and seen["output_config"] == {"effort": "high"}
    seen.clear()
    llm.complete({"provider": "anthropic", "model": "claude-haiku-5-5"}, "sys", [{"role": "user", "content": "hi"}])
    assert "fallbacks" not in seen


def test_openai_adapter(monkeypatch):
    seen = {}

    class Responses:
        def create(self, **kw):
            seen.update(kw)
            return types.SimpleNamespace(output_text="ok")

    fake = types.SimpleNamespace(OpenAI=lambda **kw: types.SimpleNamespace(responses=Responses()),
                                 AuthenticationError=KeyError, RateLimitError=KeyError, APIStatusError=KeyError,
                                 APIConnectionError=KeyError)
    _fake_module(monkeypatch, "openai", fake)
    msgs = [{"role": "user", "content": "hi"}]
    assert llm.complete({"provider": "openai", "model": "some-model"}, "sys", msgs) == "ok"
    assert seen == {"model": "some-model", "instructions": "sys", "input": msgs}


def test_chat_kit(cfg, workspace):
    out = chat_kit.build(cfg)
    names = {p.name for p in out.iterdir()}
    assert {"INSTRUCTIONS.md", "ALL-IN-ONE.md", "AGENTS.md", "resume.yaml", "tailor-resume.md", "ats.md",
            "target-example-acme-perception.yaml", "jobhunt-runnable.zip"} <= names
    allin = (out / "ALL-IN-ONE.md").read_text()
    assert "## File: resume.yaml" in allin and "Alex Chen" in allin
    with zipfile.ZipFile(out / "jobhunt-runnable.zip") as z:
        zn = set(z.namelist())
    assert {"jobhunt/cli.py", "resume.yaml", "targets/example-acme-perception.yaml", "AGENTS.md"} <= zn
    assert not any("scaffold" in n or n.endswith(".pdf") for n in zn)
    assert (workspace / "chat-kit.zip").exists()


def test_instructions_are_tool_neutral(workspace):
    agents = (workspace / "AGENTS.md").read_text()
    assert "Checks by hand" in agents and "Red lines" in agents
    assert (workspace / "CLAUDE.md").read_text().startswith("@AGENTS.md")
    assert "AGENTS.md" in (workspace / "GEMINI.md").read_text()
    for skill in ("setup-job-hunt", "tailor-resume", "resume-review"):
        wrapper = (workspace / ".claude" / "skills" / skill / "SKILL.md").read_text()
        assert f"playbooks/{skill}.md" in wrapper and (workspace / "playbooks" / f"{skill}.md").exists()
    for p in (workspace / "playbooks").rglob("*.md"):
        assert "WebFetch" not in p.read_text() and "references/" not in p.read_text(), p
    raw = yaml.safe_load((workspace / "jobhunt.yaml").read_text())
    assert config.from_dict(raw, workspace)["llm"]["max_tokens"] == 16000
