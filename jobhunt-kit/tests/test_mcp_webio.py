"""MCP tools (guardrails enforced by the tools) and the web app backup ⇄ workspace round trip."""
import asyncio
import json
import sys

import pytest
import yaml

from jobhunt import config, webio
from jobhunt.mcp_server import Tools

TARGET = "example-acme-perception"


def target_text(workspace, **changes):
    t = yaml.safe_load((workspace / "targets" / f"{TARGET}.yaml").read_text())
    t.update(id="acme-perception", **changes)
    return json.dumps(t)


def test_tools_enforce_the_rules(workspace):
    tools = Tools(workspace)
    assert tools.overview()["tracks"][0]["id"] == "robotics"
    assert "Tailor a resume to one job" in tools.get_playbook("tailor-resume")
    assert "Lens 1" in tools.get_playbook("ats")
    bad = tools.save_target(target_text(workspace, summary="Leveraged robust skills to fly 14 drones."))
    assert not bad["saved"] and any("14" in p for p in bad["problems"]) and any("Leveraged" in p for p in bad["problems"])
    assert not (workspace / "targets" / "acme-perception.yaml").exists()
    ok = tools.save_target(target_text(workspace, confirm=["Fair to say 'ships'?"]))
    assert ok["saved"] and ok["open_confirm"] == ["Fair to say 'ships'?"]
    assert not tools.save_target(target_text(workspace))["saved"]                  # exists, no overwrite
    assert tools.build_pdf("acme-perception")["ok"]
    assert not tools.save_resume("basics: {name: X}", user_confirmed=False)["saved"]
    assert not tools.save_resume("basics: {name: X}", user_confirmed=True)["saved"]   # invalid: no variants


def test_web_backup_round_trip(workspace, tmp_path):
    cfg = config.load(workspace)
    backup = webio.export_backup(cfg)
    assert backup["format"] == "jobhunt-backup" and backup["resume"]["basics"]["name"] == "Alex Chen"
    backup["settings"]["lang"] = "zh-TW"
    backup["settings"]["tracks"] = [{"id": "robotics", "label": "機器人", "titles": ["robot"]}, {"id": "swe", "label": "軟體", "titles": ["software"]}]
    backup["resume"]["variants"] = {"robotics": {"title": "機器人", "major": 1}, "swe": {"title": "軟體", "major": 2}}
    for sec in ("experience", "projects", "skills"):
        for item in backup["resume"].get(sec) or []:
            for node in [item, *(item.get("bullets") or [])]:
                if node.get("variants"):
                    node["variants"] = [v for v in node["variants"] if v in ("robotics", "swe")] or ["robotics"]
    backup["targets"][TARGET]["confirm"] = ["a?", "b?"]
    backup["targets"][TARGET]["confirmed"] = ["a?"]
    backup["applications"] = [{"job_id": "s1", "company": "Acme", "role": "Intern", "status": "interview",
                               "applied_date": "2026-10-01", "resume_version": f"targets/{TARGET}", "resume_rev": "V1.1.0",
                               "snapshot": {"huge": True}}]
    new = tmp_path / "from-web"
    out = webio.import_backup(new, backup)
    assert out == {"targets": 1, "applications": 1}
    cfg2 = config.load(new)
    assert cfg2.lang == "zh-TW" and [t.id for t in cfg2.tracks] == ["robotics", "swe"]
    assert yaml.safe_load((new / "targets" / f"{TARGET}.yaml").read_text())["confirm"] == ["b?"]
    row = (new / "data" / "applications.csv").read_text()
    assert "面試中" in row and "V1.1.0" in row and "huge" not in row
    assert not list((new / "targets").glob("example-*.yaml")) or (new / "targets" / f"{TARGET}.yaml").exists()
    back = webio.export_backup(cfg2)
    assert back["applications"][0]["status"] == "interview"


def test_mcp_protocol_over_stdio(workspace):
    """A real MCP client talks to `jobhunt mcp` over stdio, like Claude Desktop would."""
    mcp = pytest.importorskip("mcp")
    from mcp.client.stdio import StdioServerParameters, stdio_client

    async def run():
        params = StdioServerParameters(command=sys.executable, args=["-m", "jobhunt", "--workspace", str(workspace), "mcp"])
        async with stdio_client(params) as (read, write):
            async with mcp.ClientSession(read, write) as session:
                await session.initialize()
                names = {t.name for t in (await session.list_tools()).tools}
                assert {"get_overview", "save_target", "build_pdf", "get_playbook"} <= names
                res = await session.call_tool("save_target", {"target": target_text(workspace, summary="Flew 99 drones.")})
                text = res.content[0].text
                assert '"saved": false' in text and "99" in text
    asyncio.run(run())
