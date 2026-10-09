"""Plain-voice check: sentences on the PDF should read like a person wrote them, not like an AI stacked them.

Why: AI rewrites lean on the same words (Architected, Leveraged, robust…), pile several parentheses into one
sentence, and chain clauses with semicolons. A recruiter skimming for 6–10 seconds can't get through those
sentences, and spots them as AI-written. This turns that into a mechanical gate.

It only catches surface problems; a sentence doing too much, unexplained acronyms, burying the result at the
end — that's the resume-review skill's recruiter lens.

Problems (fail the build for printed target fields):
  - AI-sounding words: AI_WORDS, plus `resume.voice.extra_words` in jobhunt.yaml, minus `allow_words`.
  - More than one parenthesis in a sentence (skills lines are exempt: "RL (PPO), Imitation Learning (Flow Matching)").
  - Semicolons: split into two sentences.
Full-width （）；and letters count the same as half-width (text is NFKC-normalized first). Chinese AI words
match anywhere (Chinese has no word boundaries); English ones only as whole words.
Notes (printed only): a sentence longer than MAX_WORDS words, or MAX_CHARS characters for a Chinese sentence.
Same rules as web/js/core/rules.js; tests/parity/cases.json keeps them in step.
"""
from __future__ import annotations

import re
import unicodedata

from jobhunt.resume.fact_check import INVISIBLE
from jobhunt.resume.model import BULLET_SECTIONS
from jobhunt.resume.tailor import PRINTED

MAX_WORDS = 35
MAX_CHARS = 60   # Chinese sentences: characters (an English word or a number counts as one)
AI_WORDS = [
    r"architect(?:ed|ing)", "engineered", r"leverag(?:e|ed|es|ing)", r"utiliz(?:e|ed|es|ing)", r"robust(?:ly|ness)?",
    "proven", r"extensive(?:ly)?", "expertise", r"rigorous(?:ly)?", r"spearhead(?:ed|ing)?", "cutting-edge",
    "state-of-the-art", r"seamless(?:ly)?", r"synerg(?:y|ies|istic)", "passionate", "successfully",
    r"meticulous(?:ly)?", r"showcas(?:e|ed|ing)", r"delv(?:e|ed|ing)", "innovative", "holistic",
    r"streamlin(?:e|ed|ing)", r"pivotal", r"transformative", r"empower(?:ed|ing)?", r"orchestrat(?:e|ed|ing)",
    "賦能", "打造", "致力於", "全方位", "無縫", "極致", "卓越", "熱忱", "充滿熱情", "成功地", "積極主動", "具備優秀",
]
_ENUM = re.compile(r"\(\d+\)")
# English: split after . ! ? when a capital follows. Chinese: split after 。！？ (not before a closing quote).
_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])|(?<=[。！？])\s*(?=[^\s。！？」』）)\]])|(?<=[!?])\s*(?=[\u3400-\u9fff])")
_CJK = re.compile(r"[\u3400-\u9fff]")


class Voice:
    def __init__(self, extra_words=(), allow_words=()):
        allow = {w.lower() for w in allow_words or []}
        words = [w for w in [*AI_WORDS, *(extra_words or [])] if w.lower() not in allow]
        # English words need a boundary (not inside another word); Chinese words have none, so they match as-is.
        # Chinese words also match with spaces between the characters (打 造); plain words only, not patterns.
        en = [w for w in words if w.isascii()]
        zh = [w if re.search(r"[\^$.*+?()[\]{}|]", w) else "[ \t]*".join(w) for w in words if not w.isascii()]
        parts = ([r"(?<![A-Za-z0-9])(?:" + "|".join(en) + r")(?![A-Za-z0-9])"] if en else []) + zh
        self.ai = re.compile("(" + "|".join(parts) + ")", re.I) if parts else None

    @classmethod
    def from_config(cls, cfg) -> "Voice":
        v = (cfg["resume"].get("voice") or {}) if cfg is not None else {}
        return cls(v.get("extra_words"), v.get("allow_words"))

    def problems(self, text: str, skills: bool = False) -> list[str]:
        text = unicodedata.normalize("NFKC", INVISIBLE.sub("", text))   # full-width （）；and letters = half-width
        out =[f"AI-sounding word {m.group(0)!r}" for m in self.ai.finditer(text)] if self.ai else []
        if skills:
            return out
        for s in sentences(text):
            n = s.count("(") - len(_ENUM.findall(s))
            if n > 1:
                out.append(f"{n} parentheses in one sentence (max 1): {s[:60]!r}…")
        if ";" in text:
            out.append("semicolon (split into two sentences)")
        return out

    def check(self, target: dict, names=PRINTED, soft: bool = False) -> dict[str, list[str]]:
        """{field: [problems]} (or notes with soft=True); empty dict = clean."""
        out: dict[str, list[str]] = {}
        for name, text in _fields(target, names):
            found = notes(text) if soft else self.problems(text, skills=name.startswith("skills_order"))
            if found:
                out.setdefault(name, []).extend(found)
        return out

    def check_resume(self, data: dict, soft: bool = False) -> dict[str, list[str]]:
        out = {}
        for name, text in resume_texts(data):
            found = notes(text) if soft else self.problems(text)
            if found:
                out[name] = found
        return out


def sentences(text: str) -> list[str]:
    return [s for s in _SENT.split(" ".join(text.split())) if s]


def sentence_length(s: str) -> int:
    """Chinese → characters (no spaces; "Excel" or "2024" = 1); English → words."""
    if _CJK.search(s):
        return len(re.sub(r"[A-Za-z0-9]+", "a", re.sub(r"\s+", "", s)))
    return len(s.split(" "))


def _long(s: str) -> bool:
    return sentence_length(s) > (MAX_CHARS if _CJK.search(s) else MAX_WORDS)


def long_sentences(text: str) -> list[str]:
    """First 60 characters of every sentence over the limit (same as rules.js longSentences)."""
    return [s[:60] for s in sentences(text) if _long(s)]


def notes(text: str) -> list[str]:
    out = []
    for s in sentences(text):
        if _long(s):
            unit, limit = ("characters", MAX_CHARS) if _CJK.search(s) else ("words", MAX_WORDS)
            out.append(f"{sentence_length(s)} {unit} in one sentence (over {limit}, consider splitting): {s[:60]!r}…")
    return out


def _fields(target: dict, names):
    for name in names:
        val = target.get(name)
        if isinstance(val, dict):
            yield from ((f"{name}.{k}", str(v)) for k, v in val.items() if v)
        elif isinstance(val, list):
            yield from ((name, str(v)) for v in val if v)
        elif val:
            yield name, str(val)


def resume_texts(data: dict):
    s = data.get("summary") or {}
    for k, v in (s.items() if isinstance(s, dict) else [("default", s)]):
        if v:
            yield f"summary.{k}", str(v)
    for sec in BULLET_SECTIONS:
        for e in data.get(sec) or []:
            for i, b in enumerate(e.get("bullets") or []):
                if isinstance(b, dict) and b.get("text"):
                    yield f"{sec}.{e.get('id', '?')}.{b.get('id') or i}", str(b["text"])


def describe(found: dict[str, list[str]]) -> str:
    return "; ".join(f"{k}: {', '.join(v)}" for k, v in found.items())
