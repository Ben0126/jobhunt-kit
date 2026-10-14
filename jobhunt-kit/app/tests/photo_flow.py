"""Browser walk-through of the photo box on the resume page (Playwright + the installed Chrome + Pillow). Not part of `bun test`.

    python app/tests/photo_flow.py            (needs bun on PATH, `pip install playwright pillow`)

A phone-style JPEG with GPS in its EXIF goes in through the real file picker, is cropped in the browser, and must end up
(1) only in the program's data folder (never inside the job folder), (2) without any EXIF, (3) in the preview, (4) removable.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ui_flow import FIXTURE, start  # noqa: E402


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-photo-"))
    folder = tmp / "求職"
    shutil.copytree(FIXTURE, folder)
    data = tmp / "data"
    os.environ["JOBHUNT_DATA_DIR"] = str(data)
    t = folder / "targets" / "261008-01.yaml"
    t.write_text(t.read_text(encoding="utf-8").replace("photo: false", "photo: true"), encoding="utf-8")
    r = folder / "resumes" / "261008-01.html"
    r.write_text(r.read_text(encoding="utf-8").replace(
        "</header>", '<div class="photo" id="photo-slot"><img src="photo.jpg" alt="大頭照"></div></header>', 1), encoding="utf-8")

    # a landscape phone photo (rotated 90 degrees by its EXIF flag) with a GPS position
    src = tmp / "phone.jpg"
    im = Image.new("RGB", (1200, 900), (120, 160, 200))
    ImageDraw.Draw(im).ellipse((450, 200, 750, 600), fill=(240, 200, 170))
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x8825] = {1: "N", 2: (25.0, 2.0, 0.0), 3: "E", 4: (121.0, 33.0, 0.0)}
    im.save(src, quality=90, exif=exif)
    assert b"Exif" in src.read_bytes()

    proc, lock = start(folder)
    url = f"http://127.0.0.1:{lock['port']}/?t={lock['token']}"
    failures = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1400, "height": 1100}, locale="zh-TW")
            errors = []
            page.on("dialog", lambda d: (errors.append("dialog: " + d.message), d.dismiss()))
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.goto(url.split("?")[0] + "#resumes")
            area = page.locator("#resume-detail .photo-area")
            expect(area).to_be_visible()
            expect(area).to_contain_text("還沒有照片")
            expect(area).to_contain_text("AI 看不到")

            area.locator("input[type=file]").set_input_files(str(src))
            canvas = area.locator("canvas.crop")
            expect(canvas).to_be_visible()
            box = canvas.bounding_box()
            assert round(box["width"]) == 280 and round(box["height"]) == 360, box
            page.mouse.move(box["x"] + 140, box["y"] + 180)
            page.mouse.down()
            page.mouse.move(box["x"] + 100, box["y"] + 150, steps=5)
            page.mouse.up()
            area.locator("input[type=range]").fill("1.6")
            area.get_by_role("button", name="用這張").click()
            expect(area.locator("img.thumb")).to_be_visible(timeout=10000)

            saved = list((data / "photos").glob("*.jpg"))
            assert len(saved) == 1, saved
            b = saved[0].read_bytes()
            assert b[:2] == b"\xff\xd8", "not a JPEG"
            for word in (b"Exif", b"GPS", b"JFIF"):
                assert word not in b, f"{word!r} left in the saved photo"
            with Image.open(saved[0]) as out:  # closed again: Windows can't delete a file something still holds open
                assert out.size == (700, 900), out.size
                assert not out.getexif(), "EXIF left"
            inside = [p for p in folder.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".heic")]
            assert not inside, f"picture inside the job folder: {inside}"
            print("ok   upload: cropped 700x900, no EXIF, only in the program's data folder")

            # the preview (iframe) shows it
            page.reload()
            frame = page.frame_locator("iframe.preview")
            expect(frame.locator("#photo-slot img")).to_be_visible(timeout=10000)
            src_attr = frame.locator("#photo-slot img").get_attribute("src")
            assert src_attr.startswith("data:image/jpeg;base64,"), src_attr[:40]
            page.screenshot(path=str(tmp / "resume-page.png"))
            print("ok   preview shows the photo")

            # Word download has it
            with page.expect_download() as dl:
                page.get_by_role("button", name="下載 Word 檔").click()
            path = dl.value.path()
            import zipfile
            names = zipfile.ZipFile(path).namelist()
            assert "word/media/photo.jpg" in names, names
            print("ok   Word file has the photo:", dl.value.suggested_filename)

            area = page.locator("#resume-detail .photo-area")
            area.get_by_role("button", name="移除照片").click()
            expect(area).to_contain_text("還沒有照片")
            assert not list((data / "photos").glob("*.jpg")), "photo file still there"
            print("ok   remove deletes the file")
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
