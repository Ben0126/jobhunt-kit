"""Browser walk-through of the fuller "add a job" form (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/addjob_flow.py            (needs bun on PATH and `pip install playwright`)

Quick path stays quick (company + title + Enter); "more details" gives source, status, date applied, next step, contact,
notes. The card shows where it came from and who the contact is; the edit window can change both.
"""
import csv
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ui_flow import FIXTURE, start  # noqa: E402


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-add-"))
    folder = tmp / "求職"
    shutil.copytree(FIXTURE, folder)
    proc, lock = start(folder)
    url = f"http://127.0.0.1:{lock['port']}/?t={lock['token']}"
    csv_path = folder / "data" / "applications.csv"
    failures = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1400, "height": 1000}, locale="zh-TW")
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator("#board .card").first).to_be_visible()

            # quick path: two fields, nothing else
            page.locator("#add-open").click()
            f = page.locator("#add-form")
            expect(f.locator("details.more")).not_to_have_attribute("open", "")
            f.locator("input[name=company]").fill("快速公司")
            f.locator("input[name=role]").fill("行政助理")
            f.locator("button[type=submit]").click()
            expect(page.locator("#board .card", has_text="快速公司")).to_be_visible()
            print("ok   quick add (company + title only)")

            # full form
            page.locator("#add-open").click()
            f.locator("input[name=company]").fill("完整公司")
            f.locator("input[name=role]").fill("人資助理")
            f.locator("details.more summary").click()
            applied = f.locator("#add-applied-wrap")
            expect(applied).to_be_hidden()  # "to apply": a date applied means nothing yet
            f.locator("#add-status").select_option("applied")
            expect(applied).to_be_visible()
            f.locator("input[name=source]").fill("104")
            f.locator("input[name=contact]").fill("人資王小姐")
            f.locator("input[name=next_action]").fill("下週問進度")
            f.locator("input[name=next_action_date]").fill("2026-12-31")
            f.locator("input[name=notes]").fill("朋友推薦")
            f.locator("button[type=submit]").click()
            card = page.locator("#board .card", has_text="完整公司")
            expect(card).to_be_visible()
            expect(card).to_contain_text("104 · 人資王小姐")
            expect(card).to_contain_text("朋友推薦")
            expect(card).to_contain_text("下週問進度")
            rows = list(csv.DictReader(csv_path.open(encoding="utf-8-sig")))
            r = next(x for x in rows if x["company"] == "完整公司")
            assert (r["status"], r["source"], r["contact"], r["notes"], r["next_action_date"]) == ("applied", "104", "人資王小姐", "朋友推薦", "2026-12-31"), r
            assert r["applied_date"], "applied with no date should get today"
            print("ok   full add: fields reach the card and the file")

            # the form starts clean again, status back to "to apply"
            page.locator("#add-open").click()
            expect(f.locator("#add-status")).to_have_value("todo")
            expect(f.locator("input[name=source]")).to_have_value("")
            f.locator("#add-cancel").click()

            # edit window can change source and contact
            card.locator(".open").click()
            dlg = page.locator("#edit")
            expect(dlg.locator("input[name=source]")).to_have_value("104")
            dlg.locator("input[name=source]").fill("朋友介紹")
            dlg.locator("input[name=contact]").fill("陳經理")
            page.locator("#edit-save").click()
            expect(dlg).to_be_hidden()
            expect(page.locator("#board .card", has_text="完整公司")).to_contain_text("朋友介紹 · 陳經理")
            print("ok   edit source and contact")
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
