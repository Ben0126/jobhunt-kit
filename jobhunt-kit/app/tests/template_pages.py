"""Print check of the resume templates (Playwright + the installed Chrome). Not part of `bun test`.

    python app/tests/template_pages.py      (from jobhunt-kit/; needs `pip install playwright` and Chrome)

For 深色抬頭 (resume-tw.html), 精緻單欄 (resume-tw-classic.html) and the English one:
1. 一般新鮮人的份量（自我介紹 3 句、學歷 1 筆、經歷 3 段共 8 條、專題 1 個、專長 3 行），有照片、沒照片都印成 1 頁 A4，
   螢幕上的黃色提醒不出現。
2. 一次多加一條重點：每一步都要「PDF 超過 1 頁」和「黃色提醒出現」一致（中文版說「估計會印成 N 頁…1 頁為目標」，英文版說超過一頁）。
"""
import copy
import re
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

TEMPLATES = Path(__file__).resolve().parents[2] / "jobhunt" / "scaffold" / "workspace-general" / "templates"


def fill_section(section: str, entries: list[dict]) -> str:
    block = re.search(r'<div class="entry">[\s\S]*?\n    </div>', section).group(0)

    def one(e: dict) -> str:
        h = re.sub(r" *<!--[^>]*location[^>]*-->\n", "", block)
        h = re.sub(r' *<div class="entry-sub">[^\n]*</div>\n', "", h)
        h = re.sub(r'(<div class="entry-title">)\{\{[^}]*\}\}', lambda m: m.group(1) + e["title"], h, count=1)
        if e.get("role"):
            h = re.sub(r'(<span class="role">)\{\{[^}]*\}\}', lambda m: m.group(1) + e["role"], h, count=1)
        else:
            h = re.sub(r'<span class="role">[^<]*</span>', "", h, count=1)
        h = re.sub(r'(<div class="entry-date">)\{\{[^}]*\}\}', lambda m: m.group(1) + e["date"], h, count=1)
        if e["bullets"]:
            lis = "".join(f"        <li>{b}</li>\n" for b in e["bullets"])
            h = re.sub(r" *<li>\{\{[^}]*\}\}</li>\n", lambda m: lis, h, count=1)
        else:
            h = re.sub(r" *<!--[^>]*-->\n *<ul>[\s\S]*?</ul>\n", "", h, count=1)
        return h

    return section.replace(block, "\n".join(one(e) for e in entries))


def fill(tpl: str, r: dict, photo: bool) -> str:
    h = tpl if photo else re.sub(r" *<!-- ===== 照片區塊開始[\s\S]*?照片區塊結束 ===== -->\n", "", tpl)

    def section(m: re.Match) -> str:
        title = m.group(1)
        if title in ("自我介紹", "Summary"):
            return re.sub(r"\{\{[^}]*\}\}", lambda _: r["summary"], m.group(0), count=1)
        if title == r["skills_title"]:
            li = re.search(r' *<li><span class="label">[^\n]*\n', m.group(0)).group(0)
            sep = "：" if "：" in li else ":"
            rows = "".join(f'      <li><span class="label">{k}{sep}</span>{" " if sep == ":" else ""}{v}</li>\n' for k, v in r["skills"])
            return m.group(0).replace(li, rows)
        entries = r["sections"].get(title)
        return fill_section(m.group(0), entries) if entries else ""

    h = re.sub(r'<section class="block">\s*<h2>([^<]*)</h2>[\s\S]*?</section>\n*', section, h)
    h = re.sub(r"\{\{(?:姓名|Full Name)\}\}", r["name"], h)
    h = h.replace("{{希望職稱}}", r.get("want", ""))
    h = re.sub(r" *<li>[^<\n]*\{\{([^}]*)\}\}</li>\n", lambda m: m.group(0).replace("{{" + m.group(1) + "}}", r["contact"][m.group(1)]) if m.group(1) in r["contact"] else "", h)
    left = re.search(r"\{\{[^}]*\}\}", re.sub(r"<!--[\s\S]*?-->", "", h))
    if left:
        raise SystemExit(f"filler left a slot: {left.group(0)}")
    return h


TW = {
    "name": "王小明",
    "want": "行政助理",
    "contact": {"手機": "0912-345-678", "Email": "xiaoming@example.com", "居住縣市": "新北市"},
    "summary": "企管系 2026-06 畢業，在全聯當過一年半的門市兼職，負責收銀和排班。在系學會管過活動報名和經費，"
    "活動當天一個人處理報到。想找行政助理的工作，把細的事情做好。",
    "skills_title": "專長、證照與語言",
    "skills": [("文書工具", "Word、Excel（樞紐分析）、Google 試算表"), ("語言", "英文（TOEIC 650）"), ("證照", "門市服務丙級")],
    "sections": {
        "學歷": [{"title": "輔仁大學", "role": "企業管理學系", "date": "2022-09 – 2026-06", "bullets": ["系學會活動組組員（2023-09 – 2024-06）"]}],
        "工作與社團經歷": [
            {"title": "全聯福利中心 中和店", "role": "門市兼職人員", "date": "2024-07 – 2025-12", "bullets": [
                "每週排班 3 天，負責收銀和結帳，尖峰時段一個人顧一台收銀機。",
                "負責排定十多位兼職人員的週班表，店長說那段時間沒有人臨時找不到人代班。",
                "協助每月盤點，對照系統數字和架上數量，找出差異交給店長。",
                "顧客的小問題先處理，退換貨和客訴交給值班主管。",
            ]},
            {"title": "輔仁大學企管系學會", "role": "活動組組員", "date": "2023-09 – 2024-06", "bullets": [
                "負責迎新活動的報名表和繳費名單，收齊 200 多份報名。",
                "活動當天負責報到，用 Google 試算表即時更新到場名單。",
                "和組員分工聯絡廠商，整理三家報價給會長決定。",
            ]},
            {"title": "大學圖書館", "role": "工讀生", "date": "2023-02 – 2023-06", "bullets": [
                "每週 2 天在流通櫃台辦理借還書，整理還書車上架。",
                "協助新書貼標和建檔。",
            ]},
        ],
        "專題與活動": [
            {"title": "畢業專題：社區超市顧客動線調查", "date": "2025-09 – 2026-05", "bullets": [
                "和組員分工做問卷，負責整理 120 份問卷的結果。",
                "用 Excel 做圖表，在期末發表報告調查結果。",
            ]},
            {"title": "寒假偏鄉課輔志工", "date": "2024-01", "bullets": ["連續 2 週帶國小三年級的數學課輔。"]},
        ],
    },
}

EN = {
    "name": "Xiaoming Wang",
    "contact": {"City, Country": "New Taipei, Taiwan", "Phone, e.g. +886 912 345 678": "+886 912 345 678", "Email": "xiaoming@example.com"},
    "summary": "Business administration graduate with eighteen months of part-time retail experience. Handled cashiering and weekly shift schedules.",
    "skills_title": "Skills & Certifications",
    "skills": [("Software", "Word, Excel (pivot tables), Google Sheets"), ("Languages", "English (TOEIC 650)")],
    "sections": {
        "Education": [{"title": "Fu Jen Catholic University", "role": "B.B.A. in Business Administration", "date": "Sep 2022 – Jun 2026", "bullets": []}],
        "Experience": [
            {"title": "PX Mart, Zhonghe Store", "role": "Part-time Store Associate", "date": "Jul 2024 – Dec 2025", "bullets": [
                "Worked the register three days a week, running a lane alone during peak hours.",
                "Scheduled weekly shifts for more than ten part-time staff.",
                "Helped with monthly stock counts and reported differences to the manager.",
            ]},
            {"title": "FJU Business Student Association", "role": "Events Team Member", "date": "Sep 2023 – Jun 2024", "bullets": [
                "Managed sign-up forms and payment lists for the freshman orientation.",
                "Ran on-site check-in with a live Google Sheets attendance list.",
            ]},
        ],
        "Projects & Activities": [
            {"title": "Capstone: Customer Flow Survey of a Local Supermarket", "date": "2025 – 2026", "bullets": [
                "Compiled results from 120 survey responses and built the charts in Excel.",
            ]},
        ],
    },
}

def normal(r: dict) -> dict:
    """一般新鮮人的份量：自我介紹 3 句、學歷 1 筆（1 個細項）、經歷 3 段共 8 條、專題 1 個 2 條、專長 3 行。"""
    r2 = copy.deepcopy(r)
    if "工作與社團經歷" in r2["sections"]:
        r2["sections"]["工作與社團經歷"][0]["bullets"] = r2["sections"]["工作與社團經歷"][0]["bullets"][:3]
        r2["sections"]["專題與活動"] = r2["sections"]["專題與活動"][:1]
    return r2


def plus(r: dict, k: int, zh: bool) -> dict:
    """r with k more one-line bullets in the first job."""
    r2 = copy.deepcopy(r)
    key = "工作與社團經歷" if zh else "Experience"
    extra = [f"第 {i} 條加長用的重點，一行寫得完。" if zh else f"Extra bullet number {i} that fits on one line." for i in range(1, k + 1)]
    r2["sections"][key][0]["bullets"] += extra
    return r2


def pdf_pages(data: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page(?!s)", data))


def render(page, work: Path, html: str) -> tuple[int, str, bool, float]:
    f = work / "r.html"
    f.write_text(html, encoding="utf-8")
    page.goto(f.as_uri())
    page.wait_for_load_state("load")
    warn = page.locator("#len-warn").inner_text().strip()
    shown = "long" in (page.locator("#print-tip").get_attribute("class") or "")
    fill_ratio = page.evaluate(
        "() => { const p = document.getElementById('page'); const l = p.lastElementChild;"
        " return (l.getBoundingClientRect().bottom - p.getBoundingClientRect().top - parseFloat(getComputedStyle(p).paddingTop)) / ((297 - 30) * 96 / 25.4) }"
    )
    return pdf_pages(page.pdf(prefer_css_page_size=True, print_background=True)), warn, shown, fill_ratio


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="jobhunt-tpl-"))
    failures: list[str] = []
    cases = [("resume-tw.html", TW, True), ("resume-tw-classic.html", TW, True), ("resume-en.html", EN, False)]
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            for name, data, zh in cases:
                tpl = (TEMPLATES / name).read_text(encoding="utf-8")
                base = normal(data)
                # 1. a normal amount: 1 page, no warning (with and without the photo frame)
                for photo in ([False, True] if zh else [False]):
                    n, warn, shown, ratio = render(page, work, fill(tpl, base, photo))
                    ok = n == 1 and not shown
                    print(f"{'ok  ' if ok else 'FAIL'} {name:24} 一般份量{'・有照片位置' if photo else '・沒照片  '} PDF {n} 頁，佔 {ratio:.0%}，黃色提醒：{warn or '（沒有）'}")
                    if not ok:
                        failures.append(f"{name} 一般份量")
                # 2. one bullet at a time: the warning shows exactly when the PDF has more than 1 page
                first_two = None
                for k in range(0, 41):
                    n, warn, shown, ratio = render(page, work, fill(tpl, plus(base, k, zh), False))
                    good_text = ("估計會印成" in warn and "1 頁為目標" in warn) if zh else "超過一頁" in warn
                    ok = shown == (n > 1) and (not shown or good_text)
                    if not ok:
                        print(f"FAIL {name:24} 多 {k} 條：PDF {n} 頁，佔 {ratio:.1%}，黃色提醒：{warn or '（沒有）'}")
                        failures.append(f"{name} 多 {k} 條")
                    if n > 1 and first_two is None:
                        first_two = k
                        print(f"{'ok  ' if ok else 'FAIL'} {name:24} 多 {k} 條開始印成 2 頁（佔 {ratio:.1%}），黃色提醒：{warn or '（沒有）'}")
                    if first_two is not None and k >= first_two + 3:
                        break
                if first_two is None:
                    failures.append(f"{name} 加到 40 條還是 1 頁")
                    print(f"FAIL {name:24} 加到 40 條還是 1 頁")
            browser.close()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    if failures:
        print("TEMPLATE PAGES FAILED:", "、".join(failures))
        return 1
    print("TEMPLATE PAGES PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
