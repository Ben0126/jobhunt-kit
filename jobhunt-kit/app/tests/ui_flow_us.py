"""Browser walk-through of the app for a US kit folder (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/ui_flow_us.py         (from jobhunt-kit/; needs bun on PATH and `pip install playwright`)

The same kind of walk as ui_flow.py, on a copy of jobhunt/scaffold/workspace-us (language: en, market: us, paper: letter):
1. Every page shows English only (no Chinese text anywhere on screen), and the 104 tab is hidden.
2. Board: English status names, reminders, edit window, and the "tracker changed" message keeps what was typed.
3. Resume page: problems in English, the Save as PDF steps say Letter (never A4), the page note is the US one-page tip.
4. Save a copy of the resume that was sent.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

APP = Path(__file__).resolve().parents[1]
SCAFFOLD = APP.parent / "jobhunt" / "scaffold" / "workspace-us"
CJK = re.compile(r"[⺀-鿿豈-﫿︰-﹏＀-￯]")
HEADER = ("job_id,company,role,track,tier,resume_version,status,applied_date,last_update,next_action,next_action_date,"
          "contact,source,notes,resume_file,resume_commit,resume_rev,link")


def make_folder() -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-ui-us-"))
    folder = tmp / "Job Search"
    shutil.copytree(SCAFFOLD, folder)
    today = dt.date.today()
    old = (today - dt.timedelta(days=40)).isoformat()
    past = (today - dt.timedelta(days=3)).isoformat()
    rows = [
        f"northfield,Northfield State,HR Assistant,,,,todo,,{today.isoformat()},,,,,,,,,",
        f"birchwood,Birchwood Bank,Teller,,,,applied,{old},{old},,,,,,,,,",
        f"pine,Pine Logistics,Operations Assistant,,,,interview,{old},{old},,{past},,,,,,,",
    ]
    (folder / "data" / "applications.csv").write_text(HEADER + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
    # A resume file made from the US template (placeholders left in: the checker has things to say), long enough for 2 pages.
    html = (folder / "templates" / "resume-us.html").read_text(encoding="utf-8")
    filler = "".join(f"<p>Line {i} of long test content so the resume runs past one page.</p>" for i in range(int(os.environ.get("FILLER", "40"))))
    i = html.lower().rfind("</main>")
    if i < 0:
        i = html.lower().rfind("</body>")
    (folder / "resumes").mkdir(exist_ok=True)
    (folder / "resumes" / "northfield.html").write_text(html[:i] + filler + html[i:], encoding="utf-8")
    return folder


def start(folder: Path):
    bun = os.environ.get("BUN") or subprocess.run(  # the real bun.exe (on Windows `bun` can be a .cmd wrapper)
        [shutil.which("bun") or "bun", "-e", "console.log(process.execPath)"], capture_output=True, text=True).stdout.strip()
    p = subprocess.Popen([bun, str(APP / "src" / "main.ts"), "--dir", str(folder), "--no-open"],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    lock = folder / ".jobhunt" / "app.lock"
    for _ in range(100):
        if lock.exists():
            try:
                return p, json.loads(lock.read_text(encoding="utf-8"))
            except Exception:
                pass
        time.sleep(0.2)
    p.kill()
    raise RuntimeError("app did not start")


def main() -> int:
    folder = make_folder()
    proc, lock = start(folder)
    url = f"http://127.0.0.1:{lock['port']}/?t={lock['token']}"
    base = url.split("?")[0]
    csv = folder / "data" / "applications.csv"
    failures = []

    def step(name, fn):
        try:
            fn()
            print(f"ok   {name}")
        except Exception as e:  # noqa: BLE001 - report and keep going
            print(f"FAIL {name}\n     {str(e).splitlines()[0] if str(e) else type(e).__name__}")
            failures.append(name)

    def english_only(page, where):
        text = page.inner_text("body")
        m = CJK.search(text)
        assert not m, f"{where}: Chinese on screen near: {text[max(0, m.start() - 30):m.start() + 30]!r}"

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1400, "height": 1000}, locale="en-US")
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator("#board .card").first).to_be_visible()

            def board():
                expect(page.locator("html")).to_have_attribute("lang", "en")
                expect(page.locator(".tabs a[data-tab='104']")).to_be_hidden()
                expect(page.locator(".tabs a[data-tab='progress']")).to_have_text("Progress")
                expect(page.locator("#board .col h3").first).to_contain_text("To apply")
                expect(page.locator("#closed summary")).to_contain_text("Closed")
                follow = page.locator("#follow-list")
                expect(follow).to_contain_text("No news for 40 days")
                expect(follow).to_contain_text("The interview date")
                english_only(page, "progress page")
                page.goto(base + "#104")  # no 104 for the US: goes back to the progress page
                expect(page.locator("#page-progress")).to_be_visible()

            step("進度頁：全英文、沒有 104 分頁、狀態和提醒是英文", board)

            def keep_typed_input():
                page.goto(url.split("?")[0] + "#progress")
                page.locator("#board .card .open", has_text="Northfield").click()
                dlg = page.locator("#edit")
                expect(dlg).to_be_visible()
                english_only(page, "edit window")
                dlg.locator("input[name=notes]").fill("My note must stay")
                csv.write_text(csv.read_text(encoding="utf-8").replace("Birchwood Bank", "Birchwood Credit Union"), encoding="utf-8")
                page.locator("#edit-save").click()
                expect(page.locator("#edit-error")).to_be_visible()
                expect(page.locator("#edit-error")).to_contain_text("The tracker was just changed")
                expect(page.locator("#edit-error")).to_contain_text("What you typed is still here")
                expect(dlg.locator("input[name=notes]")).to_have_value("My note must stay")
                page.locator("#edit-save").click()
                expect(dlg).to_be_hidden()
                assert "My note must stay" in csv.read_text(encoding="utf-8")

            step("修改視窗：存檔失敗訊息是英文，打的字還在", keep_typed_input)

            def resume_page():
                page.goto(base + "#resumes")
                detail = page.locator("#resume-detail")
                expect(detail.locator(".result.bad")).to_be_visible(timeout=10000)
                expect(detail.locator(".result.bad")).to_contain_text("This resume has not passed the check")
                english_only(page, "resume page")
                pages = detail.locator(".pages")
                expect(pages).to_be_visible(timeout=10000)
                print("     page note:", pages.text_content())
                expect(pages).to_contain_text("Estimated 2 pages")
                expect(pages).to_contain_text("A US resume should be one page")
                assert "Taiwan" not in pages.text_content() and "A4" not in pages.text_content()
                expect(detail.locator(".pdf > button").first).to_be_enabled()
                expect(detail.locator(".hint", has_text="photo")).to_have_count(0)

            step("履歷頁：英文、頁數提示是美國版、沒有照片提示", resume_page)

            def pdf_steps():
                detail = page.locator("#resume-detail")
                detail.locator(".pdf > button").first.click()
                box = detail.locator(".confirm-box")
                expect(box).to_be_visible()
                steps = box.locator(".steps").inner_text()
                print("     steps:", steps.replace("\n", " | "))
                assert 'Paper size "Letter"' in steps and '"US Letter"' in steps and "A4" not in steps, steps
                english_only(page, "pdf confirm box")
                box.get_by_role("button", name="Not now").click()

            step("存成 PDF：步驟寫 Letter，不寫 A4", pdf_steps)

            def print_tab():
                detail = page.locator("#resume-detail")
                detail.locator(".pdf > button").first.click()
                with page.context.expect_page() as popup:
                    detail.get_by_role("button", name="I understand, save as PDF anyway").click()
                tab = popup.value
                tab.wait_for_load_state()
                css = tab.evaluate("() => [...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => r.type === CSSRule.PAGE_RULE).map(r => r.cssText).join(' | ')")
                print("     @page rules:", css)
                assert "letter" in css.lower() or "8.5in 11in" in css.lower(), css
                tab.close()

            step("列印分頁：@page 是 Letter", print_tab)

            def archive():
                detail = page.locator("#resume-detail")
                name = f"{dt.date.today().isoformat()}_northfield.html"
                detail.get_by_role("button", name="I applied, save a copy").click()
                box = detail.locator(".archive-box")
                expect(box).to_contain_text(name)
                english_only(page, "save-a-copy box")
                assert not (folder / "submitted" / name).exists(), "preview wrote a file"
                box.get_by_role("button", name="Yes, save a copy").click()
                expect(page.locator("#notice")).to_contain_text("It is also recorded in your tracker")
                assert (folder / "submitted" / name).exists(), f"copy not saved: {list((folder / 'submitted').iterdir())}"
                assert f"submitted/{name}" in csv.read_text(encoding="utf-8"), csv.read_text(encoding="utf-8")
                detail.get_by_role("button", name="I applied, save a copy").click()
                expect(detail.locator(".archive-box")).to_contain_text("already saved")

            step("I applied, save a copy：先預覽、確定才存、再按不會蓋掉", archive)

            if errors:
                failures.append("page errors")
                print("FAIL page errors:", errors)
            shots = os.environ.get("JOBHUNT_SHOTS")
            if shots:
                Path(shots).mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(Path(shots) / "resumes-us.png"), full_page=False)
                page.goto(base + "#progress")
                page.wait_for_timeout(500)
                page.screenshot(path=str(Path(shots) / "progress-us.png"), full_page=False)
            browser.close()
    finally:
        proc.kill()
        shutil.rmtree(folder.parent, ignore_errors=True)
    print("\nUI FLOW (US) FAILED" if failures else "\nUI FLOW (US) PASSED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
