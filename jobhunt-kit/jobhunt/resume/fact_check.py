"""Fact check for tailored resumes: every number a target writes must already exist in resume.yaml.

Why: numbers are where rewriting goes wrong — "10 drones" becomes "12", a "40% faster" appears from nowhere —
and an interviewer asking about it is where it falls apart. This is a mechanical gate: it only checks numbers.
Wording, new actions, new tools are for the resume-review skill's fact comparison.

Rules:
  - Checks the overrides that get printed: summary, skills_order, bullet_overrides. A number that isn't in
    resume.yaml fails the build. application_answers are only pasted into forms: warnings, not failures.
  - "Found" = the same number appears in any text field of resume.yaml (YAML comments don't count).
  - Percentages and multiples must match with their unit: "40%" needs 40% (or 40 percent), "3x" needs 3x / 3×.
  - Years (1990–2039), year ranges (2023–24) and dates are ignored, Chinese ones too (2024 年 3 月, 民國 113 年).
  - Text is NFKC-normalized first (２０％ = 20%). Chinese numerals count: 五十 = 50, 兩萬三千 = 23000,
    三成 = 30%, 1.2 萬 = 12000, 3 倍 = 3x (not 3). Approximations (三四十, 一兩百) must appear as written.
  - id / source / sources fields of resume.yaml are labels (S-003), not facts.
If the number is true but resume.yaml doesn't say it, add it to resume.yaml (one source of truth) — don't
make an exception here. Same rules as web/js/core/rules.js; tests/parity/cases.json keeps them in step.
"""
from __future__ import annotations

import re
import unicodedata

from jobhunt.resume.tailor import PRINTED

# Boundaries are explicit (no \b): Python treats Chinese characters as word characters and JS doesn't, so \b
# made the two engines disagree on text like "2025/06加入".
_DATE = re.compile(r"(?<![A-Za-z0-9])(?:19|20)[0-9][0-9]\s?[–—-]\s?(?:(?:19|20)[0-9][0-9]|[0-9][0-9])"   # 2023–24
                   r"(?![A-Za-z0-9])(?![-/.][0-9])|"
                   r"(?<![A-Za-z0-9])(?:19|20)[0-9][0-9][-/.](?:0?[1-9]|1[0-2])(?:[-/.][0-9]{1,2})?(?![A-Za-z0-9])|"
                   r"(?<![A-Za-z])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+[0-9]{1,2}"
                   r"(?:st|nd|rd|th)?,?\s+(?:19|20)[0-9][0-9](?![A-Za-z0-9])|"
                   r"(?<![A-Za-z])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)[0-9][0-9]"
                   r"(?![A-Za-z0-9])", re.I)
# Chinese dates: 2024 年 3 月, 民國 113 年, 112 學年度, 3 月 5 日 (ROC years without 民國: 80–149 before 年/年度).
_ZH_DATE = re.compile(r"(?<![0-9.,])(?:(?:19|20)[0-9][0-9]|民國\s?[0-9]{2,3}|[89][0-9]|1[0-4][0-9])\s?(?:學年度|年度|年)"
                      r"(?:\s?[0-9]{1,2}\s?月(?:\s?[0-9]{1,2}\s?[日號])?)?|"
                      r"(?<![0-9.,])(?:0?[1-9]|1[0-2])\s?月(?:\s?[0-9]{1,2}\s?[日號])?")
_NOT_CHENG = "(?![員功長為立績本果效交就熟品])"   # 成 as a unit (三成 = 30%), not 成員 / 成功 / 成長…
# A number may touch letters (TOEIC900, NT300000, Top3, 300K): only digits and "." next to it end it.
_NUM = re.compile(r"(?<![0-9.])([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(\s?[百千萬億]+|k(?![A-Za-z]))?"
                  r"(\s?(?:%|percent(?![A-Za-z0-9])|x(?![A-Za-z0-9])|×|-fold(?![A-Za-z0-9])|倍|成" + _NOT_CHENG + r"))?"
                  r"(?![0-9])", re.I)
_YEAR = re.compile(r"(19[9]\d|20[0-3]\d)")
_SHIFT = {"百": 2, "千": 3, "萬": 4, "億": 8, "k": 3, "K": 3}
# Characters nobody sees on screen or paper, but that split a word or a number for a checker (and get pasted into 104).
INVISIBLE = re.compile("[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]")
_NO_DOT = re.compile(r"(?<![A-Za-z])No\.\s?(?=[0-9])", re.I)   # No.1
_FAN_BEI = re.compile(r"翻了?一?倍")                           # 業績翻倍 = 2x

# Chinese numerals: 五十 → 50, 兩萬三千 → 23,000, 三成 → 30%, 百分之二十 → 20%, 二〇二四年 → 2024年.
_ZH_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_ZH_UNIT = {"十": 10, "百": 100, "千": 1000, "萬": 10000, "億": 100000000}
_ZH_RUN = re.compile(r"[零〇一二三四五六七八九兩十百千萬億]+")
# A lone numeral only counts as a number before one of these (三位、兩年、五成). 月 and 日 are left out (三月 is a
# date), 分 too (十分 = very).
_COUNTER_WORDS = (r"位|個|人|名|次|家|間|場|件|份|項|年|天|週|周|小時|元|塊|組|篇|本|張|台|臺|輛|種|門|堂|所|隻|"
                  r"條|筆|則|歲|屆|隊|班|頁|字|分鐘|秒|公斤|公里|坪|箱|包|杯|單|通|支|封|季|部|套|檔|期|批|趟|輪|科|倍|%|成"
                  + _NOT_CHENG)
_COUNTER = re.compile(r"\s?(?:" + _COUNTER_WORDS + ")")
_YEAR_COUNTER = re.compile(r"\s?(?!年)(?:" + _COUNTER_WORDS + ")")   # 2000 筆 is a count (2000 年 is a date)
_ZH_PERCENT = re.compile(r"百分之\s?([零〇一二三四五六七八九兩十百千]+|[0-9]+(?:\.[0-9]+)?)")
_ZH_CHENG_DIGIT = re.compile(r"([一二三四五六七八九])成([一二三四五六七八九])(?![零〇一二三四五六七八九兩十百千萬億])"
                             r"(?!\s?(?:位|個|人|名|次|家|間|場|件|份|項|年|天))")
# ①② and (1) (2) are list markers, not numbers — unless a counter follows (⑳位、(30)位).
_CIRCLED = re.compile(r"[\u2460-\u24ff\u2776-\u2793](?!\s?(?:" + _COUNTER_WORDS + "))")
_LIST_MARK = re.compile(r"\([0-9]{1,2}\)(?!\s?(?:" + _COUNTER_WORDS + r"))|^[ \t]*[0-9]{1,2}[.、)](?=[ \t]|[^\x00-\x7f])",
                        re.M)   # (1), "1. " at a line start
_WAN_QIAN = re.compile(r"(?<![0-9.,])([0-9]+)\s?萬\s?([0-9])\s?千")   # 3萬2千 = 32000
_ID_NUMBER = re.compile(r"(?<![A-Za-z0-9])[A-Z][1289][0-9]{8}(?![0-9])", re.I)
_ID_OLD = re.compile(r"(?<![A-Za-z0-9])[A-Z]{2}[0-9]{8}(?![0-9])")   # old resident certificate: FA12345678

MARKER_KEYS = ("id", "source", "sources")   # labels (S-003, s001_a): their digits are not facts


def zh_number(run: str) -> int:
    """Value of a Chinese numeral: 五十 → 50, 兩萬三千 → 23000, 三百五 → 350, 一百零五 → 105, 十五 → 15."""
    big = section = digit = 0
    for c in run:
        if c in _ZH_DIGIT:
            digit = _ZH_DIGIT[c]
            continue
        u = _ZH_UNIT[c]
        if u == 100000000:
            big = ((big + section + digit) or 1) * u
            section = 0
        elif u == 10000:
            big += ((section + digit) or 1) * u
            section = 0
        else:
            section += (digit or 1) * u
        digit = 0
    before = run[-2] if len(run) > 1 else ""
    if digit and _ZH_UNIT.get(before, 0) >= 100:            # 三百五 = 350, 兩萬五 = 25000
        digit *= _ZH_UNIT[before] // 10
    return big + section + digit


def _zh_to_digits(text: str, approx: list[str]) -> str:
    """Rewrite Chinese numerals as digits where they read as numbers; approximations (三四十) go to approx."""
    def sub(m):
        run, before, after = m.group(0), m.string[:m.start()], m.string[m.end():]
        if re.search(r"[0-9]\s?$", before):                  # 1.2 萬: the Arabic number owns the 萬
            return run
        counter = bool(_COUNTER.match(after))
        if run == "一":                                       # 一起、一次、每一位 are words, not counts
            ok = re.match(r"\s?(?:倍|成)", after) or (before.endswith("第") and re.match(r"\s?(?:名|$|[。、!,.;)」』\s])", after))
            return "1" if ok else run                         # 第一名、業績第一。 (not 第一次、第一線)
        if run == "零" and re.match(r"\s?(?:客訴|失誤|缺勤|錯誤|差錯|遲到|事故|投訴|退貨|誤差)", after):
            return "0"                                        # 零客訴
        if re.search(r"[十百千萬億]$", run) and re.match(r"[幾多餘來]", after):
            approx.append(run + after[0])                     # 十幾、百餘
            return " "
        if re.fullmatch(r"[十百千萬億]+", run):
            if not counter and re.search(r"[上破近逾超數幾]$", before):
                approx.append(before[-1] + run)               # 破千萬、好幾百
                return " "
            if len(run) > 1 and re.match(r"\s?[元預營業額]", after):
                return f"{zh_number(run):,}"                  # 百萬預算
        compound = re.search(r"[零〇一二三四五六七八九兩][十百千萬億]|^十[一二三四五六七八九]", run)
        if not counter and not compound:                      # 十分、百貨、千萬、萬一
            return run
        if re.fullmatch(r"[零〇一二三四五六七八九]+", run) and (len(run) >= 3 or re.search(r"[〇零]", run)):
            return "".join(str(_ZH_DIGIT[c]) for c in run)    # 二〇二四 → 2024 (read digit by digit)
        if re.search(r"[一二三四五六七八九兩]{2}", run):       # 三四十、一兩百: kept as written
            approx.append(run)
            return " "
        return f"{zh_number(run):,}"                         # commas: 兩千 is a count, never a year
    return _ZH_RUN.sub(sub, text)


def _shift(num: str, k: int) -> str:
    """num moved k decimal places: _shift('1.2', 4) = '12000'; trailing zeros after a point dropped."""
    i, _, f = num.partition(".")
    if k:
        if len(f) <= k:
            i, f = i + f + "0" * (k - len(f)), ""
        else:
            i, f = i + f[:k], f[k:]
        i = re.sub(r"^0+(?=\d)", "", i)
    f = f.rstrip("0")
    return f"{i}.{f}" if f else i


def _percent(m) -> str:
    n = m.group(1)
    return (n if re.search(r"[0-9]", n) else f"{zh_number(n):,}") + "%"


def numbers(text: str) -> set[str]:
    """Numbers in text, without dates and years: '40%', '3x', '5.4', '1000'; Chinese too: 三成 → '30%'."""
    approx: list[str] = []
    # ，is never a thousands separator in Chinese; NFKC would turn it into "," and glue "3，500" together
    t = unicodedata.normalize("NFKC", _CIRCLED.sub(" ", INVISIBLE.sub("", str(text))).replace("，", "、")).replace("一成不變", " ")
    t = _NO_DOT.sub("No ", _ID_OLD.sub(" ", _ID_NUMBER.sub(" ", t)))   # ID numbers are a problem of their own
    t = _WAN_QIAN.sub(lambda m: f"{int(m.group(1)) * 10000 + int(m.group(2)) * 1000:,}", _LIST_MARK.sub(" ", t))
    t = _FAN_BEI.sub(" 2倍", t.replace("百分百", "100%"))
    t = _ZH_PERCENT.sub(_percent, t)
    t = _ZH_CHENG_DIGIT.sub(lambda m: f"{_ZH_DIGIT[m.group(1)]}{_ZH_DIGIT[m.group(2)]}%", t)
    t = _zh_to_digits(t, approx)
    out = set()
    clean = _ZH_DATE.sub(" ", _DATE.sub(" ", t))
    for m in _NUM.finditer(clean):
        raw, mag, unit = m.group(1), (m.group(2) or "").strip(), (m.group(3) or "").strip().lower()
        # "2,000" has a comma and 2000 筆 a counter: counts, not years
        if _YEAR.fullmatch(raw) and not mag and not unit and not _YEAR_COUNTER.match(clean, m.end()):
            continue
        k = sum(_SHIFT[c] for c in mag) + (1 if unit == "成" else 0)
        num = _shift(raw.replace(",", ""), k)
        out.add(num + ("%" if unit in ("%", "percent", "成") else "x" if unit in ("x", "×", "-fold", "倍") else ""))
    return out | set(approx)


def id_numbers(text: str) -> list[str]:
    """Personal ID numbers: Taiwan ID card (A123456789), the new resident certificate (A823456789) and the old one
    (two capital letters and 8 digits: FA12345678)."""
    t = unicodedata.normalize("NFKC", INVISIBLE.sub("", str(text)))
    found = sorted([*_ID_NUMBER.finditer(t), *_ID_OLD.finditer(t)], key=lambda m: m.start())
    return [m.group(0).upper() for m in found]


def strings(node, skip=()) -> list[str]:
    """Every string value in parsed YAML (not keys, not numeric fields like order: 1), minus the keys in skip."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for k, v in node.items() if k not in skip for s in strings(v, skip)]
    if isinstance(node, list):
        return [s for v in node for s in strings(v, skip)]
    return []


def facts(resume_data: dict) -> set[str]:
    return numbers("\n".join(strings(resume_data, MARKER_KEYS)))


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
