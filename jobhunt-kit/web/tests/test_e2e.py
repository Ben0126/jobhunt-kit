"""Browser walk-through of the web app (Playwright + Chromium). Skipped when Playwright isn't installed.

    python -m pytest web/tests/test_e2e.py
"""
import functools
import http.server
import json
import threading
from pathlib import Path

import pytest

sync_api = pytest.importorskip("playwright.sync_api")

WEB = Path(__file__).resolve().parents[1]
FIX = WEB / "tests" / "fixtures"
SHOTS = Path(__import__("os").environ.get("JOBHUNT_SHOTS", "")) if __import__("os").environ.get("JOBHUNT_SHOTS") else None


@pytest.fixture(scope="module")
def server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(WEB))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture
def page(server):
    with sync_api.sync_playwright() as p:
        exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
        browser = p.chromium.launch(**({"executable_path": exe} if Path(exe).exists() else {}))
        ctx = browser.new_context(viewport={"width": 1100, "height": 900}, locale="zh-TW")
        ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/feed/intern.json", lambda r: r.fulfill(path=str(FIX / "feed.json"), content_type="application/json"))
        page.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        page.goto(server)
        yield page
        assert errors == [], errors
        browser.close()


def shot(page, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def test_full_flow(page):
    # setup wizard (browser locale zh-TW → Chinese UI)
    page.get_by_text("開始設定").wait_for()
    page.get_by_text("機器人／嵌入式").click()
    page.get_by_text("軟體工程").click()
    page.locator("input[name=visa][data-v='1']").check()
    shot(page, "1-start")
    page.get_by_role("button", name="下一步").click()
    assert "Never invent experience" not in page.locator("#import-prompt").input_value()   # import prompt
    assert "Copy facts exactly" in page.locator("#import-prompt").input_value()
    page.get_by_role("button", name="先用範例試試看").click()
    page.get_by_role("button", name="完成").click()

    # jobs from the feed
    page.get_by_text("Perception Intern").first.wait_for()
    assert page.locator(".job").count() > 5
    shot(page, "2-jobs")
    page.locator(".job", has_text="Acme Robotics").get_by_role("button", name="客製").click()

    # tailor: copy prompt, paste a padded answer → rejected; corrected answer → accepted
    page.get_by_text("針對職缺客製履歷").wait_for()
    prompt = page.locator("#tailor-prompt").input_value()
    assert "acme_planner" in prompt and '"base_variant": "robotics"' in prompt
    target = json.loads((FIX / "target.json").read_text())
    target.pop("id")
    bad = dict(target, summary="Leveraged robust skills to fly 14 drones.")
    page.locator("[data-bind='ui.cur.answer']").fill("Here you go:\n```json\n" + json.dumps(bad) + "\n```")
    page.get_by_role("button", name="檢查").click()
    fix = page.locator("#fix-prompt").input_value()
    assert "14" in fix and "Leveraged" in fix
    target["confirm"] = ["Is 'ships tested robot software' fair?"]
    page.locator("[data-bind='ui.cur.answer']").fill("```json\n" + json.dumps(target) + "\n```")
    page.get_by_role("button", name="檢查").click()
    page.get_by_text("通過檢查").wait_for()
    assert "Alex Chen" in page.locator("#tailor-page").inner_text()
    assert page.locator(".warn", has_text="1 個 AI 不確定").count() == 1
    page.locator(".checklist input").check()
    page.get_by_text("全部確認完畢").wait_for()
    shot(page, "3-tailor")
    page.get_by_role("button", name="我投了，記錄下來").click()
    page.get_by_text("已記錄，版本 V1.1.0").wait_for()

    # applications + persistence across reload
    page.goto(page.url.split("#")[0] + "#/apps")
    page.reload()
    page.get_by_text("寄出版本: V1.1.0").wait_for()
    shot(page, "4-apps")

    # resume editor shows the AI-wording warning live
    page.goto(page.url.split("#")[0] + "#/resume")
    box = page.locator("[data-bind='resume.experience.0.bullets.0.text']")
    box.fill("Leveraged a planner.")
    assert page.locator(".warn-inline", has_text="Leveraged").count() == 1
    page.get_by_role("button", name="預覽／下載 PDF — 機器人／嵌入式 版").click()
    page.locator("#preview .page").wait_for()
    shot(page, "5-resume")

    # backup round-trip through settings
    page.goto(page.url.split("#")[0] + "#/settings")
    with page.expect_download() as d:
        page.get_by_role("button", name="匯出備份（backup.json）").click()
    data = json.loads(Path(d.value.path()).read_text())
    assert data["format"] == "jobhunt-backup" and data["applications"][0]["resume_rev"] == "V1.1.0"
