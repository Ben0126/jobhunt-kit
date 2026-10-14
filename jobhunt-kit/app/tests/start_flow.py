"""Browser walk-through of the start screen of the one-for-all kit (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/start_flow.py            (needs bun on PATH and `pip install playwright`)

A folder whose jobhunt.yaml names no market opens on the start screen in English; the switch turns the page Chinese;
choosing "both" opens the board with the 104 and Jobs tabs, and me/mode.yaml says [us, tw]; switching back keeps the mode.
"""
import re
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ui_flow import FIXTURE, start  # noqa: E402


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-start-"))
    folder = tmp / "job-hunt"
    shutil.copytree(FIXTURE, folder)
    y = folder / "jobhunt.yaml"
    text = y.read_text(encoding="utf-8")
    text = re.sub(r"^market:.*\n", "", text, flags=re.M)
    text = re.sub(r"^language: \S+", "language: en", text, flags=re.M)
    y.write_text(text, encoding="utf-8")
    proc, lock = start(folder)
    url = f"http://127.0.0.1:{lock['port']}/?t={lock['token']}"
    failures = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1200, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator("#page-start")).to_be_visible()
            expect(page.locator("#page-start h2")).to_have_text("Welcome")
            expect(page.locator(".tabs")).to_be_hidden()
            page.screenshot(path=str(tmp / "start-en.png"))
            print("ok   no mode yet: English start screen, no tabs")

            page.locator("#lang-switch").click()
            expect(page.locator("#page-start h2")).to_have_text("歡迎")
            assert "language: zh-TW" in y.read_text(encoding="utf-8")
            print("ok   the switch turns the page Chinese (jobhunt.yaml language: zh-TW)")

            page.get_by_text("兩邊都找").click()
            page.get_by_role("button", name="開始").click()
            expect(page.locator("#page-progress")).to_be_visible()
            expect(page.locator('.tabs a[data-tab="104"]')).to_be_visible()
            expect(page.locator('.tabs a[data-tab="jobs"]')).to_be_visible()
            mode = (folder / "me" / "mode.yaml").read_text(encoding="utf-8")
            assert "markets: [us, tw]" in mode, mode
            print("ok   both: board with 104 and Jobs tabs; me/mode.yaml markets: [us, tw]")

            # looking in both: each job says its country, and the board can show one country
            page.locator("#add-open").click()
            f = page.locator("#add-form")
            f.locator("input[name=company]").fill("台北公司")
            f.locator("input[name=role]").fill("行政助理")
            f.locator("details.more summary").click()
            f.locator("select[name=market]").select_option("tw")
            f.locator("button[type=submit]").click()
            card = page.locator("#board .card", has_text="台北公司")
            expect(card).to_contain_text("台灣")
            page.locator("#market-filter").select_option("us")
            expect(page.locator("#board .card", has_text="台北公司")).to_have_count(0)
            page.locator("#market-filter").select_option("tw")
            expect(page.locator("#board .card", has_text="台北公司")).to_have_count(1)
            page.locator("#market-filter").select_option("")
            print("ok   both: a job's country on its card, and the board filter")

            page.locator("#lang-switch").click()
            expect(page.locator('.tabs a[data-tab="progress"]')).to_have_text("Progress")
            expect(page.locator('.tabs a[data-tab="jobs"]')).to_be_visible()
            expect(page.locator('.tabs a[data-tab="104"]')).to_be_visible()
            expect(page.locator("#page-start")).to_be_hidden()
            print("ok   back to English, the mode stays")
            assert not errors, errors
            browser.close()
    except Exception as e:  # noqa: BLE001
        print("FAIL", e)
        failures.append(str(e))
    finally:
        proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
