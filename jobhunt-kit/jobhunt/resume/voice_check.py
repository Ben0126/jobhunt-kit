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
Notes (printed only): a sentence longer than MAX_WORDS words.
"""
from __future__ import annotations

import re

from jobhunt.resume.model import BULLET_SECTIONS
from jobhunt.resume.tailor import PRINTED

MAX_WORDS = 35
AI_WORDS = [
    r"architect(?:ed|ing)", "engineered", r"leverag(?:e|ed|es|ing)", r"utiliz(?:e|ed|es|ing)", r"robust(?:ly|ness)?",
    "proven", r"extensive(?:ly)?", "expertise", r"rigorous(?:ly)?", r"spearhead(?:ed|ing)?", "cutting-edge",
    "state-of-the-art", r"seamless(?:ly)?", r"synerg(?:y|ies|istic)", "passionate", "successfully",
    r"meticulous(?:ly)?", r"showcas(?:e|ed|ing)", r"delv(?:e|ed|ing)", "innovative", "holistic",
    r"streamlin(?:e|ed|ing)", r"pivotal", r"transformative", r"empower(?:ed|ing)?", r"orchestrat(?:e|ed|ing)",
]
_ENUM = re.compile(r"\(\d+\)")
_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")


class Voice:
    def __init__(self, extra_words=(), allow_words=()):
        allow = {w.lower() for w in allow_words or []}
        words = [w for w in [*AI_WORDS, *(extra_words or [])] if w.lower() not in allow]
        self.ai = re.compile(r"\b(" + "|".join(words) + r")\b", re.I) if words else None

    @classmethod
    def from_config(cls, cfg) -> "Voice":
        v = (cfg["resume"].get("voice") or {}) if cfg is not None else {}
        return cls(v.get("extra_words"), v.get("allow_words"))

    def problems(self, text: str, skills: bool = False) -> list[str]:
        out = [f"AI-sounding word {m.group(0)!r}" for m in self.ai.finditer(text)] if self.ai else []
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


def notes(text: str) -> list[str]:
    return [f"{len(s.split())} words in one sentence (over {MAX_WORDS}, consider splitting): {s[:60]!r}…"
            for s in sentences(text) if len(s.split()) > MAX_WORDS]


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
