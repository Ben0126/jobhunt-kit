"""Check a resume PDF the way an applicant tracking system (Workday, Greenhouse, Lever…) first sees it: plain text.

    jobhunt ats dist/resume-robotics.pdf
    jobhunt ats dist/targets/Alex_Chen_acme.pdf --jd jd.txt
    jobhunt ats resume.pdf --keywords "C++,ROS 2,PyTorch" --text

Checks: page count, standard section headings, contact info (email, phone, LinkedIn/GitHub URLs as text, not only
as hyperlinks), dates separated from their entry, garbled characters (U+FFFD, private-use, ﬁ-style ligatures),
keyword coverage. Heuristics, not any vendor's real algorithm — evidence for the resume-review skill's ATS lens.
Text comes from PyMuPDF in two orders: content order (what most parsers read) and a column-guessing order.
"""
from __future__ import annotations

import re
from pathlib import Path

import pymupdf

HEADINGS = {
    "summary": r"(professional\s+)?summary|profile|objective",
    "skills": r"(technical\s+)?skills",
    "education": r"education",
    "experience": r"(professional\s+|work\s+|research\s+|relevant\s+)?experience|work\s+history|employment",
    "projects": r"(technical\s+|selected\s+|personal\s+)?projects",
    "publications": r"(selected\s+)?publications",
}
HEADING_TAIL = r"(?:\s*(?::|&|and\s).*)?"   # "Skills:", "Experience & Leadership"
MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
DATE = rf"(?:(?:Expected\s+)?{MONTH}\s+\d{{4}}|\d{{4}}|Present)"
DATE_RANGE = rf"{DATE}(?:\s*[–—-]\s*{DATE})?"
# tech-looking tokens in a JD: capitalized acronyms, +, #, digits or slashes — C++, ROS 2, PyTorch, SLAM, CI/CD
TECH_TOKEN = r"\b(?:[A-Z][A-Za-z0-9]*(?:[+#]{1,2}|/[A-Z]{1,4}|\s\d(?!\d))?|[a-z]+[A-Z][A-Za-z]+)(?![\w])"
STOP = {"The", "This", "You", "We", "Our", "In", "If", "As", "At", "For", "And", "Or", "To", "With", "On",
        "Your", "An", "A", "Of", "Is", "Are", "Be", "It", "All", "Who", "What", "About", "Summer", "Intern",
        "Internship", "Requirements", "Qualifications", "Responsibilities", "Preferred", "Bonus", "Must",
        "Experience", "Strong", "Familiarity", "Knowledge", "Ability", "Excellent", "Currently", "Pursuing",
        "Degree", "Engineering", "Engineer", "Software", "Team", "Work", "Working", "Role", "Join", "Help",
        "Equal", "Opportunity", "Employer", "Benefits", "Salary", "Pay", "Location", "Hybrid", "Remote",
        "United", "States", "US", "USA", "PhD", "MS", "BS", "Bachelor", "Master", "Masters", "Computer",
        "Science", "Electrical", "Mechanical", "Robotics", "Company", "Will", "May", "Can", "Have", "Has",
        "Design", "Build", "Develop", "Collaborate", "Minimum", "Implement", "Create", "Use", "Using", "Write",
        "Own", "Drive", "Lead", "Partner", "Apply", "Analyze", "Support", "Nice", "Plus", "Preferred", "Required",
        "Basic", "What", "How", "When", "Where", "Why", "Please", "Note", "Ideal", "Candidate", "Opportunity"}
# lower-case multi-word skills TECH_TOKEN can't see, yet often the JD's key requirements
PHRASES = ["motion planning", "path planning", "trajectory optimization", "state estimation", "sensor fusion",
           "kalman filter", "computer vision", "deep learning", "machine learning", "reinforcement learning",
           "imitation learning", "behavior cloning", "point cloud", "object detection", "segmentation",
           "localization", "mapping", "control theory", "controls", "optimization", "simulation",
           "embedded", "real-time", "multithreading", "data analysis", "statistics", "data pipeline",
           "unit testing", "testing", "distributed systems", "backend", "frontend", "full-stack", "numpy",
           "linux", "git", "manipulation", "perception", "autonomy", "dynamics", "data structures", "algorithms",
           "object-oriented", "rest api", "microservices", "cloud", "databases", "version control", "code review"]


def find_sections(text):
    """{section key: line number}, only for lines that are just a heading."""
    found = {}
    for i, line in enumerate(text.splitlines()):
        s = line.strip()
        for key, pat in HEADINGS.items():
            if key not in found and re.fullmatch(rf"(?:{pat}){HEADING_TAIL}", s, re.I):
                found[key] = i
    return found


def has_phone(text):
    """A number with 10+ digits; a run of years (2019 2020 2021) doesn't count."""
    for m in re.finditer(r"\+?\(?\d[\d\s().-]{8,}\d", text):
        s = m.group(0)
        if len(re.sub(r"\D", "", s)) >= 10 and not re.fullmatch(r"(?:(?:19|20)\d\d[\s,–-]*)+", s.strip()):
            return True
    return False


def contact(text):
    return {
        "email": bool(re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", text)),
        "phone": has_phone(text),
        "linkedin_url": bool(re.search(r"linkedin\.com/", text, re.I)),
        "github_url": bool(re.search(r"github\.com/", text, re.I)),
    }


def detached_dates(text):
    """Lines holding only 2+ dates → dates got separated from their school/company."""
    hits = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        dates = re.findall(DATE_RANGE, s)
        if len(dates) >= 2 and re.fullmatch(rf"(?:{DATE_RANGE}[\s|,;]*)+", s):
            hits.append(s)
    return hits


def bad_chars(text):
    return sorted({c for c in text if c == "�" or 0xE000 <= ord(c) <= 0xF8FF or 0xFB00 <= ord(c) <= 0xFB4F})


def loose(keyword):
    """keyword → regex allowing optional space/hyphen between characters: ROS 2 = ROS2 = ros-2."""
    chars = re.sub(r"[\s\-_]+", "", keyword.lower())
    return r"[\s\-_]*".join(re.escape(c) for c in chars)


def keyword_coverage(text, keywords):
    """(found, missing). Ignores case, spaces, hyphens; no synonyms. 1–2 letter keywords (C, R, Go) must
    stand alone: the "C." in "C.H. Liu" or the C in C++ is not C."""
    body = text.lower()
    hit, miss = [], []
    for k in keywords:
        k = k.strip()
        if not k:
            continue
        if len(k) <= 2 and k.isalpha():
            found = re.search(rf"(?<![\w.]){re.escape(k)}(?![\w.+#])", text, re.I if len(k) == 2 else 0)
        else:
            found = re.search(r"(?<![a-z0-9+#])" + loose(k) + r"(?![a-z0-9+#])", body)
        (hit if found else miss).append(k)
    return hit, miss


def jd_terms(jd):
    """Tech-looking tokens and known skill phrases from a job description, deduplicated, in order.
    Heuristic: noisy and incomplete. For a real comparison pass the JD's must-haves with --keywords."""
    seen, out = set(), []
    low = jd.lower()
    for ph in PHRASES:
        if re.search(r"(?<![a-z])" + re.escape(ph) + r"(?![a-z])", low):
            seen.add(ph)
            out.append(ph)
    for m in re.finditer(TECH_TOKEN, jd):
        t = m.group(0).strip()
        if t in STOP or len(t) < 2 or t.lower() in seen:
            continue
        seen.add(t.lower())
        out.append(t)
    return out


def pdf_text(pdf, sort: bool = False) -> tuple[str, int]:
    """(text, pages). sort=False: the PDF's content order; sort=True: top-to-bottom, left-to-right guessing."""
    with pymupdf.open(pdf) as doc:
        return "\n".join(p.get_text(sort=sort) for p in doc), doc.page_count


def report(pdf, keywords=None, jd=None, show_text=False, one_page=True) -> tuple[str, list[str]]:
    text, pages = pdf_text(pdf)
    lines = [f"# ATS text check: {Path(pdf).name}", "", f"Pages: {pages}"]
    warn = []
    if one_page and pages != 1:
        warn.append(f"{pages} pages (internship / new-grad resumes are usually 1 page)")
    secs = find_sections(text)
    lines.append("Section headings found: " + (", ".join(sorted(secs, key=secs.get)) or "(none)"))
    for need in ("education", "experience", "skills"):
        if need not in secs:
            warn.append(f"no '{need}' heading found (a parser may file that content under the wrong field)")
    c = contact(text)
    lines.append("Contact: " + ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in c.items()))
    warn += [f"no {k} in the text" for k in ("email", "phone") if not c[k]]
    no_url = [k.split("_")[0] for k in ("linkedin_url", "github_url") if not c[k]]
    if no_url:
        lines.append(f"(hint) {', '.join(no_url)} URL only exists as a hyperlink, not as text.")
    det = detached_dates(text)
    if det:
        warn += [f"date separated from its entry: {d!r} — a parser may pair it with the wrong job" for d in det]
    elif detached_dates(pdf_text(pdf, sort=True)[0]):
        lines.append("(hint) dates separate from their entries only in column-guessing order; content order is fine.")
    bc = bad_chars(text)
    if bc:
        warn.append("garbled / private-use / ligature characters: " + " ".join(f"U+{ord(ch):04X}" for ch in bc))
    if jd:
        terms = jd_terms(jd)
        hit, miss = keyword_coverage(text, terms)
        lines += ["", f"## Job description terms (heuristic, {len(terms)} found, noisy)",
                  "Present: " + (", ".join(hit) or "(none)"), "Missing: " + (", ".join(miss) or "(none)")]
    if keywords:
        hit, miss = keyword_coverage(text, keywords)
        lines += ["", f"## Keywords ({len(hit)}/{len(hit) + len(miss)} present verbatim)",
                  "Present: " + (", ".join(hit) or "(none)"), "Missing: " + (", ".join(miss) or "(none)")]
    lines += ["", "## Warnings" if warn else "## Warnings: none"] + [f"- {w}" for w in warn]
    if show_text:
        lines += ["", "## Full text as a parser reads it", "```", text.strip(), "```"]
    return "\n".join(lines), warn
