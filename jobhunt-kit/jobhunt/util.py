"""Small helpers shared by the job feed, the resume tools and the tracker."""
from __future__ import annotations

import csv
import re
import subprocess
from pathlib import Path

_CO_STOP = re.compile(r"\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|com|company|companies|the|plc|group|"
                      r"holdings?|technologies|technology|solutions|services|systems|international)\b")
_TITLE_STOP = re.compile(r"\b(summer|fall|spring|winter|20\d\d|intern|interns|internship|internships|co op|coop|"
                         r"new grad|new graduate|early career|university grad(?:uate)?)\b")
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_REQ = re.compile(_UUID.pattern + r"|(?<!\d)\d{5,}(?!\d)", re.I)


def norm_company(s: str) -> str:
    """'Amazon.com Services LLC' → 'amazon'; 'Acme & Co' → 'acme'. Used to match the same employer across sources."""
    s = re.sub(r"\bu s\b", "us", re.sub(r"[^a-z0-9]+", " ", str(s).lower().replace("&", " and ")))
    words = _CO_STOP.sub(" ", s).split()
    while len(words) > 1 and words[-1] in ("and", "us", "usa"):
        words.pop()
    return " ".join(words) or " ".join(s.split())


def norm_title(s: str) -> str:
    """Drop season/year/intern words so 'Software Engineering Intern, Summer 2027' == 'Software Engineer Intern'."""
    s = _TITLE_STOP.sub(" ", re.sub(r"[^a-z0-9]+", " ", str(s).lower()))
    return " ".join(re.sub(r"\bengineering\b", "engineer", s).split())


def req_tokens(s: str) -> list[str]:
    """Requisition ids in a URL or slug, in order: UUIDs (Lever, Ashby) and numbers with 5+ digits."""
    return [m.group(0).lower() for m in _REQ.finditer(str(s))]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


def read_csv(path: Path) -> tuple[list[str], list[dict]]:
    if not Path(path).exists():
        return [], []
    with open(path, encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        return list(r.fieldnames or []), list(r)


def write_csv(path: Path, fields: list[str], rows) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)


def git_out(repo: Path, *args) -> str | None:
    """Output of a git command, or None when it's not a repo / git fails."""
    try:
        r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    except OSError:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def committed(repo: Path, paths: list[str]) -> bool:
    """Are all these paths committed (no staged, unstaged or untracked changes)? Not a git repo → False."""
    status = git_out(repo, "status", "--porcelain", "--", *paths)
    return status is not None and not status


# ---------------------------------------------------------------- report strings (en / zh-TW)

STRINGS = {
    "en": {
        "new_jobs": "New jobs", "open_now": "Open now", "excluded": "excluded", "by_source": "Sources",
        "first_run": "(First run: baseline only, nothing is listed as new.)",
        "nothing_new": "No new jobs in your notify tracks today.",
        "baseline_sources": "(Newly added sources — baseline only today, their jobs aren't listed as new: {names}.)",
        "cols": "| Tier | Company | Role | Location | Visa | Source |",
        "repost": "↻ reposted (last {date})",
        "followup": "Follow-ups", "stats": "Status counts", "reply_rate": "Reply rate (any response / sent)",
        "today": "To do today", "ghosted": "Probably ghosted", "none": "(none)",
        "due": "due — please handle", "nudge": "{days} days since applying — you could follow up with {contact}",
        "ghost": "{days} days with no news — consider marking it \"{status}\"",
        "visa_yes": "JD: sponsors", "visa_no": "JD: no sponsorship", "visa_citizen": "US citizens only",
        "h1b": {"strong": "H-1B strong", "moderate": "H-1B moderate", "weak": "H-1B weak",
                "staffing": "H-1B staffing", "none": "H-1B none"},
    },
    "zh-TW": {
        "new_jobs": "新職缺", "open_now": "目前開放", "excluded": "已排除", "by_source": "來源",
        "first_run": "（第一次執行，只建立基準，不列新職缺。）",
        "nothing_new": "今天通知類別裡沒有新職缺。",
        "baseline_sources": "（新加入的來源今天只建立基準，它們的職缺不列為新職缺：{names}。）",
        "cols": "| Tier | 公司 | 職缺 | 地點 | 簽證 | 來源 |",
        "repost": "↻ 重貼（上次 {date}）",
        "followup": "求職追蹤", "stats": "狀態統計", "reply_rate": "回覆率（有任何回音／已投遞）",
        "today": "今天要做", "ghosted": "可能石沉大海", "none": "（沒有）",
        "due": "到期，請處理", "nudge": "已 {days} 天，可寄 follow-up 給 {contact}",
        "ghost": "投遞 {days} 天沒消息，建議狀態改為「{status}」",
        "visa_yes": "JD：可贊助", "visa_no": "JD：不贊助", "visa_citizen": "限美國公民",
        "h1b": {"strong": "H-1B 強", "moderate": "H-1B 中", "weak": "H-1B 弱", "staffing": "H-1B 派遣", "none": "H-1B 無"},
    },
}


def strings(lang: str) -> dict:
    return STRINGS.get(lang) or STRINGS["en"]
