"""The same cases run against the web app's JavaScript (web/tests/rules.test.mjs): both engines must agree."""
import json
import re
from pathlib import Path

import pytest

from jobhunt import util
from jobhunt.resume import fact_check, voice_check
from jobhunt.resume.voice_check import Voice

CASES = json.loads((Path(__file__).parent / "parity" / "cases.json").read_text(encoding="utf-8"))


def codes(problems):
    out = []
    for p in problems:
        m = re.match(r"AI-sounding word '(.+)'", p)
        out.append(f"ai_word:{m.group(1)}" if m else "parens" if "parentheses" in p else "semicolon" if "semicolon" in p else p)
    return out


@pytest.mark.parametrize("text,expected", CASES["numbers"])
def test_numbers(text, expected):
    assert sorted(fact_check.numbers(text)) == expected


@pytest.mark.parametrize("text,expected", CASES["voice"])
def test_voice(text, expected):
    assert codes(Voice().problems(text)) == expected


@pytest.mark.parametrize("target,resume,expected", CASES["unsupported"])
def test_unsupported(target, resume, expected):
    assert fact_check.unsupported(target, resume) == expected


@pytest.mark.parametrize("resume,expected", CASES["facts"])
def test_facts(resume, expected):
    assert sorted(fact_check.facts(resume)) == expected


@pytest.mark.parametrize("target,resume,expected", CASES["answers"])
def test_answers(target, resume, expected):
    assert fact_check.unsupported(target, resume, ("application_answers",)) == expected


@pytest.mark.parametrize("text,expected", CASES["sentences"])
def test_sentences(text, expected):
    assert voice_check.sentences(text) == expected


@pytest.mark.parametrize("text,expected", CASES["long"])
def test_long_sentences(text, expected):
    assert voice_check.long_sentences(text) == expected


@pytest.mark.parametrize("text,expected", CASES["id_numbers"])
def test_id_numbers(text, expected):
    assert fact_check.id_numbers(text) == expected


@pytest.mark.parametrize("text,existing,today,expected", CASES["job_ids"])
def test_job_ids(text, existing, today, expected):
    assert util.job_id(text, existing, today) == expected
