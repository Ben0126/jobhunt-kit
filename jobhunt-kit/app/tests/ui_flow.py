"""Browser walk-through of the app (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/ui_flow.py            (from jobhunt-kit/; needs bun on PATH and `pip install playwright`)

1. 修改視窗：存檔失敗（進度表剛被 AI 改過）時，使用者打的字要留在視窗裡，再按一次就能存。
2. 履歷頁：「未確認 N 段」「待回答 N 題」、改寫的逐字對照、超過 1 頁只提醒不擋、「我投了這份，存一份」。
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

APP = Path(__file__).resolve().parents[1]
FIXTURE = APP / "tests" / "fixture"


def make_folder() -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-ui-"))
    folder = tmp / "求職"
    shutil.copytree(FIXTURE, folder)
    t = folder / "targets" / "261008-01.yaml"
    text = t.read_text(encoding="utf-8")
    text = text.replace("bullet_overrides: {}", "bullet_overrides:\n  s001_b: 負責收銀與結帳。")
    text = text.replace("confirm: []", 'confirm:\n  - "第一題？"\n  - "第二題？"')
    t.write_text(text, encoding="utf-8")
    # make the resume long enough for 2 pages
    r = folder / "resumes" / "261008-01.html"
    html = r.read_text(encoding="utf-8")
    filler = "".join(f"<p>第 {i} 行測試用的長內容，讓履歷超過一頁。</p>" for i in range(int(os.environ.get("FILLER", "30"))))
    i = html.lower().rfind("</main>")
    if i < 0:
        i = html.lower().rfind("</body>")
    r.write_text(html[:i] + filler + html[i:], encoding="utf-8")
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
    csv = folder / "data" / "applications.csv"
    failures = []

    def step(name, fn):
        try:
            fn()
            print(f"ok   {name}")
        except Exception as e:  # noqa: BLE001 - report and keep going
            print(f"FAIL {name}\n     {str(e).splitlines()[0] if str(e) else type(e).__name__}")
            failures.append(name)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1400, "height": 1000}, locale="zh-TW")
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator("#board .card").first).to_be_visible()

            def keep_typed_input():
                page.locator("#board .card .open", has_text="宏遠精密").click()
                dlg = page.locator("#edit")
                expect(dlg).to_be_visible()
                dlg.locator("input[name=notes]").fill("我打的備註，不能不見")
                dlg.locator("input[name=next_action]").fill("10/20 打電話問")
                # the AI changes the file in the background
                csv.write_text(csv.read_text(encoding="utf-8").replace("誠品生活", "誠品書店"), encoding="utf-8")
                page.locator("#edit-save").click()
                expect(page.locator("#edit-error")).to_be_visible()
                expect(page.locator("#edit-error")).to_contain_text("剛剛被改過")
                expect(dlg).to_be_visible()
                expect(dlg.locator("input[name=notes]")).to_have_value("我打的備註，不能不見")
                expect(dlg.locator("input[name=next_action]")).to_have_value("10/20 打電話問")
                page.locator("#edit-save").click()
                expect(dlg).to_be_hidden()
                text = csv.read_text(encoding="utf-8")
                assert "我打的備註，不能不見" in text and "誠品書店" in text, "second save did not keep both changes"

            step("修改視窗：存檔失敗時打的字還在，再按一次就存好（AI 的修改也沒被蓋掉）", keep_typed_input)

            def resume_page():
                page.goto(url.split("?")[0] + "#resumes")
                pick = page.locator("#resume-list .pick").first
                expect(pick).to_contain_text("未確認 3 段")
                expect(pick).to_contain_text("待回答 2 題")
                detail = page.locator("#resume-detail")
                expect(detail.locator(".result.wait")).to_contain_text("系學會總務")
                expect(detail.locator(".rewrites ins").first).to_have_text("負責")
                expect(detail.locator(".rewrites .orig")).to_contain_text("收銀。")
                pages = detail.locator(".pages")
                expect(pages).to_be_visible(timeout=10000)
                print("     page note:", pages.text_content())
                expect(pages).to_contain_text("印成 2 頁")
                expect(pages).to_contain_text("最好 1 頁")
                expect(pages).to_have_class("pages long")
                # never blocks: the PDF button is still there and enabled
                pdf_btn = detail.locator(".pdf > button").first
                expect(pdf_btn).to_be_enabled()

            step("履歷頁：未確認／待回答徽章、逐字對照、超過 1 頁只提醒不擋", resume_page)

            def archive():
                detail = page.locator("#resume-detail")
                name = f"{dt.date.today().isoformat()}_261008-01.html"
                detail.get_by_role("button", name="我投了這份，存一份").click()
                box = detail.locator(".archive-box")
                expect(box).to_contain_text(name)
                expect(box).to_contain_text("宏遠精密股份有限公司")
                assert not (folder / "submitted" / name).exists(), "preview wrote a file"
                box.get_by_role("button", name="確定，存一份").click()
                expect(page.locator("#notice")).to_contain_text("已經存好")
                saved = folder / "submitted" / name
                assert saved.read_bytes() == (folder / "resumes" / "261008-01.html").read_bytes(), "saved copy differs"
                assert f"submitted/{name}" in csv.read_text(encoding="utf-8"), "resume_file not recorded"
                expect(detail.locator(".archive > .hint")).to_contain_text(name)
                detail.get_by_role("button", name="我投了這份，存一份").click()
                expect(detail.locator(".archive-box")).to_contain_text("已經存過")
                expect(detail.locator(".archive-box").get_by_role("button", name="確定，存一份")).to_have_count(0)

            step("我投了這份，存一份：先預覽、確定才存、再按一次不會蓋掉", archive)

            if errors:
                failures.append("page errors")
                print("FAIL page errors:", errors)
            shots = os.environ.get("JOBHUNT_SHOTS")
            if shots:
                Path(shots).mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(Path(shots) / "resumes.png"), full_page=False)
            browser.close()
    finally:
        proc.kill()
        shutil.rmtree(folder.parent, ignore_errors=True)
    print("\nUI FLOW FAILED" if failures else "\nUI FLOW PASSED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
