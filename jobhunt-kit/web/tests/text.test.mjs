// Helpers the local app uses on any printed text (104 fields, cover letters): checkText, countChars, checkAnswers.
// JS only — the Python engine has no equivalent of these; the shared rules underneath are covered by the parity cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/core/rules.js";

const RESUME = {
  basics: { name: "李欣怡", phone: "0922-555-666" },
  experience: [{ id: "s001", bullets: [{ id: "s001_a", text: "服務 3 位主管，營收提升三成", source: "S-003" }] }],
};
const codes = (ps) => ps.map((p) => p.code).sort();

test("checkText: clean text passes, source lines are ignored", () => {
  assert.deepEqual(R.checkText("我服務過 3 位主管，營收提升 30%。\n來源：S-003", RESUME), []);
  assert.deepEqual(R.checkText("電話 0922-555-666", RESUME), []);
});

test("checkText: invented numbers, AI words, ；, parentheses", () => {
  const p = R.checkText("業績成長 3 倍；我們賦能團隊（門市）與倉庫（盤點）。\n來源：S-003", RESUME);
  assert.deepEqual(codes(p), ["ai_word", "numbers", "parens", "semicolon"]);
  assert.deepEqual(p.find((x) => x.code === "numbers").numbers, ["3x"]);
  assert.equal(p.find((x) => x.code === "ai_word").word, "賦能");
});

test("checkText: long Chinese sentence (over 60 characters)", () => {
  const p = R.checkText("協助".repeat(31) + "。", RESUME);
  assert.deepEqual(codes(p), ["long"]);
  assert.equal(p[0].length, 63);
  assert.deepEqual(R.checkText("協助".repeat(29) + "好。", RESUME), []);
});

test("checkText: ID number pattern is blocked", () => {
  const p = R.checkText("身分證字號 A123456789", RESUME);
  assert.deepEqual(codes(p), ["id_number"]);
  assert.equal(p[0].text, "A123456789");
});

test("checkText: placeholders", () => {
  for (const t of ["OO大學 企管系", "○○ 公司", "XX 部門", "我是（姓名）", "（學校）畢業", "你好 {{name}}", "ＯＯ大學"])
    assert.deepEqual(codes(R.checkText(t, RESUME)), ["placeholder"], t);
  for (const t of ["GOOGLE 與 FOOD PANDA", "XXL 尺寸", "二〇〇五年畢業"])
    assert.deepEqual(R.checkText(t, RESUME), [], t);
});

test("checkText: skills lines only check words, numbers and personal data", () => {
  assert.deepEqual(R.checkText("Excel（樞紐分析）、Word（合併列印）", RESUME, { skills: true }), []);
  assert.deepEqual(codes(R.checkText("Excel（樞紐分析）、Word（合併列印）", RESUME)), ["parens"]);
});

test("checkText: voice option (owner's extra and allowed words)", () => {
  const voice = new R.Voice(["很棒"], ["卓越"]);
  assert.deepEqual(codes(R.checkText("在卓越科技打工，很棒。", RESUME, { voice })), ["ai_word"]);
});

test("countChars counts every character except line breaks", () => {
  assert.equal(R.countChars("ab\n中文\r\n。"), 5);
  assert.equal(R.countChars("我 是"), 3);
  assert.equal(R.countChars("😀"), 1);
  assert.equal(R.countChars(""), 0);
});

test("checkAnswers: application answers use the same number and wording rules", () => {
  const target = { application_answers: { q1: "服務 99 位顧客", q2: "營收提升三成", q3: "我們賦能團隊" } };
  assert.deepEqual(R.checkAnswers(RESUME, target), [
    { code: "numbers", field: "application_answers.q1", numbers: ["99"] },
    { code: "voice", field: "application_answers.q3", problems: [{ code: "ai_word", word: "賦能" }] },
  ]);
});

test("checkText: more placeholder spellings (OOO, XXX, 某某, ◯◯, ＿＿, [公司名稱], 【姓名】, （待補）, TODO)", () => {
  const all = [
    "我畢業於OOO大學。", "我是王OOO。", "我在XXX公司打工。", "xx公司", "某某大學", "◯◯大學", "〇〇〇大學", "＿＿＿大學",
    "[公司名稱]", "【姓名】", "（公司名稱）", "（待補）", "TODO", "你好 { {name} }", "O O大學",
  ];
  for (const t of all) assert.deepEqual(codes(R.checkText(t, RESUME)), ["placeholder"], t);
  for (const t of ["GOOGLE 與 FOOD PANDA", "XXL 尺寸", "二〇〇五年畢業", "Excel、Word", "box_size", "【我是誰】"])
    assert.deepEqual(R.checkText(t, RESUME), [], t);
});

test("checkText: invisible characters are reported (they get pasted into 104 too)", () => {
  const p = R.checkText("我在門市打\u200b造好的服務。", RESUME);
  assert.deepEqual(codes(p), ["ai_word", "invisible"]);
  assert.deepEqual(codes(R.checkText("收銀\u00ad。", RESUME)), ["invisible"]);
});
