"""Browser walk-through of the US kit's Jobs page (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/jobs_flow.py            (needs bun on PATH and `pip install playwright`)

The sources are a small stand-in server on this computer (JOBHUNT_FEED_SERVER, see src/testserver.ts): no internet.
Opens the page with an empty list -> it reads the sources by itself; filters; "+ Track" puts the job on the board with where
it came from; after the posting disappears, an update marks the tracked job "closed".
"""
import gzip
import hashlib
import json
import os
import shutil
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ui_flow import start  # noqa: E402

SCAFFOLD_US = Path(__file__).resolve().parents[2] / "jobhunt" / "scaffold" / "workspace-us"


def sx(**o):
    base = dict(active=True, is_visible=True, category="Software", terms=["Summer 2027"], degrees=[], sponsorship="Other",
                locations=["Austin, TX"], date_posted=1790000000)
    base.update(o)
    return base


DATA = {
    "intern": [
        sx(id="a1", company_name="Acme Corp", title="Software Engineer Intern", url="https://acme.example/1"),
        sx(id="a2", company_name="Chipco", title="FPGA Design Intern", category="Hardware", url="https://chipco.example/2"),
        sx(id="a3", company_name="Bankco", title="Business Analyst Intern", category="Product", locations=["New York, NY"], url="https://bankco.example/3", sponsorship="Offers Sponsorship"),
        sx(id="a8", company_name="Defense Inc", title="Software Engineer Intern", sponsorship="U.S. Citizenship is Required", url="https://defense.example/8"),
    ],
}
IDX = gzip.compress(json.dumps(dict(k="x", n="Acme Corp", fy=2019, ly=2026, filed=40, cert=38, pwd=0, perm=3, ns=0)).encode())
PREFIX = "/github.com/msampath/h1b-sponsor-data/releases/download/index-latest/"


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def reply(self, body: bytes, ctype="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path
        if p.endswith("Summer2027-Internships/dev/.github/scripts/listings.json"):
            return self.reply(json.dumps(DATA["intern"]).encode())
        if p.endswith("New-Grad-Positions/dev/.github/scripts/listings.json"):
            return self.reply(b"[]")
        if p == PREFIX + "index-latest.json":
            return self.reply(json.dumps(dict(version="t1", sha256=hashlib.sha256(IDX).hexdigest(), filename="index-t.ndjson.gz")).encode())
        if p == PREFIX + "index-t.ndjson.gz":
            return self.reply(IDX, "application/gzip")
        return self.reply(b'{"jobs": []}')  # every company page: nothing open


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    tmp = Path(tempfile.mkdtemp(prefix="jobhunt-jobs-"))
    folder = tmp / "job-hunt-us"
    shutil.copytree(SCAFFOLD_US, folder)
    os.environ["JOBHUNT_FEED_SERVER"] = f"http://127.0.0.1:{server.server_port}"
    os.environ["JOBHUNT_DATA_DIR"] = str(tmp / "data")
    proc, lock = start(folder)
    url = f"http://127.0.0.1:{lock['port']}/?t={lock['token']}"
    failures = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1400, "height": 1000}, locale="en-US")
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator('.tabs a[data-tab="jobs"]')).to_be_visible()
            page.goto(url.split("?")[0] + "#jobs")

            # empty and old -> reads the sources by itself
            rows = page.locator("table.jobs tbody tr")
            expect(rows).to_have_count(3, timeout=20000)
            expect(page.locator("#jobs-count")).to_contain_text("3 jobs")
            expect(page.locator("#jobs-count")).to_contain_text("1 that need US citizenship are hidden")
            acme = rows.filter(has_text="Acme Corp")
            expect(acme).to_contain_text("40 H-1B filed, last 2026, 3 green card")
            expect(acme).to_contain_text("Software")
            expect(rows.filter(has_text="Chipco")).to_contain_text("Hardware")
            expect(rows.filter(has_text="Bankco")).to_contain_text("Business")
            expect(rows.filter(has_text="Bankco")).to_contain_text("Offers sponsorship")
            expect(rows.filter(has_text="Bankco")).to_contain_text("No record found")
            print("ok   opens empty, reads the sources, rows with track, sponsorship and H-1B facts")

            # filters
            expect(page.locator("#jobs-fields label")).to_have_count(3)  # only the fields that have jobs
            expect(page.locator("#jobs-fields")).to_contain_text("Software & data (1)")
            page.locator('#jobs-fields input[value="software"]').uncheck()
            expect(rows).to_have_count(2)
            page.locator('#jobs-fields input[value="software"]').check()
            page.locator('#jobs-filter input[name="q"]').fill("fpga")
            expect(rows).to_have_count(1)
            page.locator('#jobs-filter input[name="q"]').fill("")
            page.locator('#jobs-filter input[name="h1b"]').check()
            expect(rows).to_have_count(1)  # only Acme filed recently
            page.locator('#jobs-filter input[name="h1b"]').uncheck()
            page.locator('#jobs-filter input[name="citizen"]').check()
            expect(rows).to_have_count(4)
            page.locator('#jobs-filter input[name="citizen"]').uncheck()
            expect(rows).to_have_count(3)
            print("ok   filters: track, search, filed H-1B recently, citizen-only")

            # track a job
            acme.get_by_role("button", name="+ Track").click()
            expect(acme.get_by_role("button", name="Tracking")).to_be_disabled()
            page.goto(url.split("?")[0] + "#progress")
            card = page.locator("#board .card", has_text="Acme Corp")
            expect(card).to_be_visible()
            expect(card).to_contain_text("Simplify")
            page.goto(url.split("?")[0] + "#jobs")
            expect(page.locator("table.jobs tbody tr", has_text="Acme Corp").get_by_role("button", name="Tracking")).to_be_disabled()
            print("ok   + Track puts it on the board with its source")

            # the posting goes away -> update marks the tracked job closed
            DATA["intern"] = [x for x in DATA["intern"] if x["id"] != "a1"]
            page.locator("#jobs-refresh").click()
            expect(page.locator("table.jobs tbody tr", has_text="Acme Corp")).to_have_count(0, timeout=20000)
            page.goto(url.split("?")[0] + "#progress")
            expect(page.locator("#board .card", has_text="Acme Corp")).to_contain_text("This posting has closed")
            print("ok   a posting that disappeared is marked closed on the tracked job")
            assert not errors, errors
            browser.close()
    except Exception as e:  # noqa: BLE001
        print("FAIL", e)
        failures.append(str(e))
    finally:
        proc.kill()
        server.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
