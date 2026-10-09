// Same cases as tests/test_parity.py — the web app and the Python engine must agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../js/core/rules.js";

const CASES = JSON.parse(readFileSync(new URL("../../tests/parity/cases.json", import.meta.url), "utf8"));
const codes = (ps) => ps.map((p) => (p.code === "ai_word" ? `ai_word:${p.word}` : p.code));

test("numbers (parity)", () => {
  for (const [text, expected] of CASES.numbers) assert.deepEqual([...R.numbers(text)].sort(), expected, text);
});
test("voice (parity)", () => {
  for (const [text, expected] of CASES.voice) assert.deepEqual(codes(new R.Voice().problems(text)), expected, text);
});
test("unsupported (parity)", () => {
  for (const [target, resume, expected] of CASES.unsupported) assert.deepEqual(R.unsupported(target, resume), expected);
});
test("facts skip marker fields (parity)", () => {
  for (const [resume, expected] of CASES.facts) assert.deepEqual([...R.facts(resume)].sort(), expected);
});
test("application answers (parity)", () => {
  for (const [target, resume, expected] of CASES.answers) assert.deepEqual(R.unsupported(target, resume, ["application_answers"]), expected);
});
test("sentences (parity)", () => {
  for (const [text, expected] of CASES.sentences) assert.deepEqual(R.sentences(text), expected, text);
});
test("long sentences (parity)", () => {
  for (const [text, expected] of CASES.long) assert.deepEqual(R.longSentences(text), expected, text);
});
test("id numbers (parity)", () => {
  for (const [text, expected] of CASES.id_numbers) assert.deepEqual(R.idNumbers(text), expected, text);
});
test("job ids (parity)", () => {
  for (const [text, existing, today, expected] of CASES.job_ids) assert.equal(R.jobId(text, existing, today), expected, text);
});
