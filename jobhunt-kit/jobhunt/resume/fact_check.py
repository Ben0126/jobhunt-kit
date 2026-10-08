"""Fact check for tailored resumes: every number a target writes must already exist in resume.yaml.

Why: numbers are where rewriting goes wrong — "10 drones" becomes "12", a "40% faster" appears from nowhere —
and an interviewer asking about it is where it falls apart. This is a mechanical gate: it only checks numbers.
Wording, new actions, new tools are for the resume-review skill's fact comparison.

Rules:
  - Checks the overrides that get printed: summary, skills_order, bullet_overrides. A number that isn't in
    resume.yaml fails the build. application_answers are only pasted into forms: warnings, not failures.
  - "Found" = the same number appears in any text field of resume.yaml (YAML comments don't count).
  - Percentages and multiples must match with their unit: "40%" needs 40% (or 40 percent), "3x" needs 3x / 3×.
  - Years (1990–2039), year ranges (2023–24) and dates are ignored.
If the number is true but resume.yaml doesn't say it, add it to resume.yaml (one source of truth) — don't
make an exception here.
"""
from __future__ import annotations

import re

from jobhunt.resume.tailor import PRINTED

_DATE = re.compile(r"\b(?:19|20)\d\d\s?[–—-]\s?(?:(?:19|20)\d\d|\d\d)\b(?![-/.]\d)|"        # 2023–24, 2023-2024
                   r"\b(19|20)\d\d[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?\b|"
                   r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d\d\b|"
                   r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d\d\b", re.I)
_NUM = re.compile(r"(?<![A-Za-z0-9.])(\d+(?:,\d{3})*(?:\.\d+)?)"
                  r"(\s?(?:%|percent\b|x\b|×|-fold\b))?(?![A-Za-z0-9])", re.I)
_YEAR = re.compile(r"(19[9]\d|20[0-3]\d)")


def numbers(text: str) -> set[str]:
    """Numbers in text, without dates and years: '40%', '3x', '5.4', '1000'."""
    out = set()
    for raw, unit in _NUM.findall(_DATE.sub(" ", text)):
        num = raw.replace(",", "")
        if "." in num:
            num = num.rstrip("0").rstrip(".") or "0"
        if _YEAR.fullmatch(raw) and not unit:             # "2,000" has a comma: a count, not a year
            continue
        unit = (unit or "").strip().lower()
        out.add(num + ("%" if unit in ("%", "percent") else "x" if unit in ("x", "×", "-fold") else ""))
    return out


def strings(node) -> list[str]:
    """Every string value in parsed YAML (not keys, not numeric fields like order: 1)."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for v in node.values() for s in strings(v)]
    if isinstance(node, list):
        return [s for v in node for s in strings(v)]
    return []


def facts(resume_data: dict) -> set[str]:
    return numbers("\n".join(strings(resume_data)))


def fields(target: dict, names) -> list[tuple[str, str]]:
    """(field, text): bullet_overrides split into bullet_overrides.<id>; one per skills_order line."""
    out = []
    for name in names:
        val = target.get(name)
        if isinstance(val, dict):
            out += [(f"{name}.{k}", str(v)) for k, v in val.items() if v]
        elif isinstance(val, list):
            out += [(name, str(v)) for v in val if v]
        elif val:
            out.append((name, str(val)))
    return out


def unsupported(target: dict, resume_data: dict, names=PRINTED) -> dict[str, list[str]]:
    """{field: [numbers not found in resume.yaml]}; empty when everything is backed."""
    known = facts(resume_data)
    out = {}
    for name, text in fields(target, names):
        missing = sorted(numbers(text) - known)
        if missing:
            out.setdefault(name, [])
            out[name] += [m for m in missing if m not in out[name]]
    return out


def describe(missing: dict[str, list[str]]) -> str:
    return "; ".join(f"{k}: {', '.join(v)}" for k, v in missing.items())
