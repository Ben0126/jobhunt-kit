"""Which postings to keep: country, employment type, term, PhD-only. All driven by `search:` in jobhunt.yaml.

Country matchers are per country. Only the US has one today; adding Taiwan means adding `is_tw` to
COUNTRY_MATCHERS (city/county names + 台灣/Taiwan) — nothing else in the pipeline is US-specific.
"""
from __future__ import annotations

import re

from jobhunt.jobs.model import Job

INTERN = re.compile(r"\bintern(s|ship|ships)?\b|\bco-?op\b|實習", re.I)
NEW_GRAD = re.compile(r"new grad|new graduate|university grad|early career|entry[- ]level|graduate (engineer|program)|"
                      r"\b(engineer|developer|scientist)\s+(i|1)\b|associate|junior|社會新鮮人", re.I)
_SENIOR = re.compile(r"\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp)\b|資深|主管|經理", re.I)
_YEAR = re.compile(r"\b20\d\d\b")
_SEASONS = ("spring", "summer", "fall", "autumn", "winter")
_OTHER_TIME = re.compile(r"\b(january|february|march|april|september|october|november|december)\b|"
                         r"part[- ]time|year[- ]round", re.I)
_LOWER_DEGREE = re.compile(r"\b(ms|msc|m\.s|masters?|master's|meng|bs|b\.s|bachelors?|bachelor's|undergrad\w*|mba)\b")

# ---------------------------------------------------------------- United States

_STATES = ("alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|"
           "illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|"
           "mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|"
           "north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|"
           "south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming")
_ABBR = ("AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|"
         "OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC")
_US_EXPLICIT = re.compile(r"(?i:united states)|\bU\.?S\.?(A\.?)?(?!\w)")
_US_STATE = re.compile(rf"\b({_STATES})\b", re.I)
_US_ABBR = re.compile(rf"(^|[\s,(])({_ABBR})($|[\s,)])")          # state abbreviations must be upper case
_US_ABBR_COMMA = re.compile(rf",\s*({_ABBR})\s*$", re.I)
_US_CITY = re.compile(r"^(SF|NYC|LA|South SF|Bay Area|San Francisco|New York|Seattle|Boston|Austin)\b", re.I)
NON_US = re.compile(r"\b(canada|united kingdom|uk|ireland|germany|india|china|japan|singapore|israel|taiwan|"
                    r"france|netherlands|poland|spain|mexico|australia|korea|vietnam|malaysia|philippines|"
                    r"switzerland|sweden|finland|denmark|belgium|italy|brazil|costa rica|estonia|toronto|"
                    r"bc|london|munich|shanghai|beijing|bangalore|bengaluru|hyderabad|tel aviv|"
                    r"hsinchu|taipei|tokyo|seoul|paris|amsterdam|berlin|frankfurt|stockholm|warsaw|ontario|"
                    r"utrecht|oxford|serbia|belgrade|helsinki|zurich|tbilisi|europe|emea|apac|pune|montreal|quebec|"
                    r"[A-Z][a-z]+, (DE|IN|QC|ON|MH)(, [A-Z]{2})?)\b", re.I)


def is_us(loc: str) -> bool | None:
    """True = clearly US, False = clearly elsewhere, None = can't tell (e.g. just "Santa Clara")."""
    s = str(loc or "").replace("-", " ").strip()
    if not s:
        return None
    if _US_EXPLICIT.search(s):
        return True
    if NON_US.search(s):
        return False
    if (_US_STATE.search(s) or _US_ABBR.search(s) or _US_ABBR_COMMA.search(s) or _US_CITY.search(s)
            or re.match(r"remote\b", s, re.I)):
        return True
    return None


COUNTRY_MATCHERS = {"US": is_us}
COUNTRY_ALIASES = {"US": {"us", "usa", "united states", "united states of america"}}


def in_country(job: Job, country: str) -> bool:
    """Any location in the country counts (multi-location postings often mix countries)."""
    if not country:
        return True
    country = country.upper()
    if job.countries:
        names = COUNTRY_ALIASES.get(country, {country.lower()})
        return any(str(c).strip().lower() in names for c in job.countries)
    match = COUNTRY_MATCHERS.get(country)
    if match is None:
        raise ValueError(f"no location matcher for country {country!r} yet (have: {sorted(COUNTRY_MATCHERS)})")
    verdicts = [match(l) for l in job.locations]
    if any(v is True for v in verdicts):
        return True
    return job.local_default and not any(v is False for v in verdicts)


def employment_ok(job: Job, employment: str) -> bool:
    if employment == "any":
        return True
    intern = job.employment == "intern" or (not job.employment and bool(INTERN.search(job.title)))
    if employment == "intern":
        return intern
    if intern or _SENIOR.search(job.title):
        return False
    return job.employment == "fulltime" or bool(NEW_GRAD.search(job.title)) or job.employment == ""


def term_ok(job: Job, term: str) -> bool:
    """term = "Summer 2027": tagged terms must include it; otherwise the title must not name another year or season."""
    if not term:
        return True
    if job.terms:
        return term.lower() in (t.lower() for t in job.terms)
    m = re.search(r"\b(20\d\d)\b", term)
    year = m.group(1) if m else ""
    season = next((s for s in _SEASONS if s in term.lower()), "")
    title = job.title.lower()
    years = set(_YEAR.findall(title))
    if year and years and year not in years:
        return False
    if season:
        if season in title:
            return True
        others = [s for s in _SEASONS if s != season and not (season == "fall" and s == "autumn")]
        if any(re.search(rf"\b{s}\b", title) for s in others) or _OTHER_TIME.search(title):
            return False
    return True


def phd_only(title: str, degrees=()) -> bool:
    """PhD-only postings. Tagged degrees win (["Master's", "PhD"] isn't PhD-only); else the title must say PhD
    without mentioning MS/BS ("MS/PhD" is fine)."""
    if degrees:
        return list(degrees) == ["PhD"]
    t = re.sub(r"ph\.\s?d\.?", "phd", title.lower())
    return "phd" in t and not _LOWER_DEGREE.search(t)


def keep(job: Job, search: dict) -> bool:
    return (in_country(job, search.get("country", ""))
            and employment_ok(job, search.get("employment", "any"))
            and term_ok(job, search.get("term", ""))
            and not (search.get("exclude_phd_only") and phd_only(job.title, job.degrees)))
