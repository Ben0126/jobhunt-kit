"""Browser walk-through of "which version of the resume do I look at" (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/versions_flow.py            (needs bun on PATH and `pip install playwright`)

General version (no job), the same words in another template, a saved copy sent with an application, and the PDF / Word
buttons following whichever version is on screen.
"""
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ui_flow import FIXTURE, start  # noqa: E402


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-ver-"))
    folder = tmp / "求職"
    shutil.copytree(FIXTURE, folder)
    (folder / "submitted").mkdir(exist_ok=True)
    (folder / "submitted" / "2026-10-08_261008-01.html").write_text(
        "<html><body><main class='page'><h1>投出去的那一份</h1></main></body></html>", encoding="utf-8")
    proc, lock = start(folder)
    url = f"http://127.0.0.1:{lock['port']}/?t={lock['token']}"
    failures = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1400, "height": 1200}, locale="zh-TW")
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.goto(url.split("?")[0] + "#resumes")
            frame = page.frame_locator("iframe.preview")
            detail = page.locator("#resume-detail")

            # the general version is in the list even though it belongs to no job
            general = page.locator("#resume-list .pick", has_text="通用版")
            expect(general).to_be_visible()
            general.click()
            expect(detail.locator("h2")).to_have_text("通用版（不針對特定職缺）")
            expect(detail).to_contain_text("沒有自我介紹")
            expect(frame.locator("h1.name")).to_have_text("李欣怡")
            expect(frame.locator("section.block h2").first).to_have_text("學歷")
            print("ok   general version shows resume content with no job")

            # two menus: which version of resume.yaml (中文履歷 / English), then which template
            expect(detail.locator(".versionbar select").first.locator("option")).to_have_text(["中文履歷", "English"])
            sel = detail.locator(".versionbar select").nth(1)
            expect(sel).to_be_visible()
            assert sel.locator("option").all_inner_texts() == ["深色抬頭", "精緻單欄", "英文版"], sel.locator("option").all_inner_texts()
            sel.select_option("tw-classic")
            expect(page.locator("iframe.preview")).to_have_attribute("src", __import__("re").compile("template=tw-classic"))
            expect(frame.locator("h1.name")).to_have_text("李欣怡")
            sel.select_option("en")
            expect(frame.locator("section.block h2").first).to_have_text("Education")
            print("ok   general version: switching the template redraws it")

            # Word follows the version on screen
            with page.expect_download() as dl:
                detail.get_by_role("button", name="下載 Word 檔").click()
            names = zipfile.ZipFile(dl.value.path()).namelist()
            assert "word/document.xml" in names, names
            print("ok   Word file of the general version:", dl.value.suggested_filename)

            # a job: file / another template / saved copy
            page.locator("#resume-list .pick", has_text="宏遠精密").click()
            bar = detail.locator(".versionbar")
            mode = bar.locator("select").first
            assert mode.locator("option").all_inner_texts() == ["這份履歷檔（程式檢查過的）", "換範本看看", "已投出的存檔"], mode.locator("option").all_inner_texts()
            expect(frame.locator("h1.name")).to_have_text("李欣怡")
            mode.select_option("template")
            expect(detail).to_contain_text("這是程式用同樣的內容、換成「深色抬頭」排出來的預覽，不是 AI 做的履歷檔")
            expect(frame.locator("p.summary")).to_contain_text("中國文學系 2025-06 畢業")
            bar.locator("select").nth(1).select_option("tw-classic")
            expect(detail).to_contain_text("「精緻單欄」")
            expect(page.locator("iframe.preview")).to_have_attribute("src", __import__("re").compile("template=tw-classic"))
            mode.select_option("submitted")
            expect(detail).to_contain_text("這是 2026-10-08 投出去時存下的那一份，永遠不會被改")
            expect(frame.locator("h1")).to_have_text("投出去的那一份")
            mode.select_option("file")
            expect(frame.locator("h1.name")).to_have_text("李欣怡")
            print("ok   job: file, another template, saved copy")
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
