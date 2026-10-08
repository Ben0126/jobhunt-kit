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
