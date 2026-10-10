// US kit, phase P1: ID numbers blocked in every market, both source markers, visa words kept out of the resume.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyText, paragraphs, parse104, SOURCE_LINE } from "../src/blocks104.ts";
import { runCheck, runChecks } from "../src/check.ts";
import { replaceSection } from "../src/checksfile.ts";
import { ID_MASK, maskIdNumbers, runRead } from "../src/docx.ts";
import { Folder } from "../src/folder.ts";
import { extraIdMatches } from "../src/ids.ts";
import { cleanup, copyFixture } from "./helpers.ts";
import { makeDocx, para } from "./ziptools.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf-8");
const write = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const edit = (dir: string, rel: string, from: string | RegExp, to: string) => {
  const before = read(dir, rel);
  const after = before.replace(from, to);
  if (after === before) throw new Error(`fixture edit did not apply: ${rel} ${from}`);
  write(dir, rel, after);
};

/** The fixture with its one real problem fixed; `us` switches jobhunt.yaml to market: us. */
function cleanFolder(us = false): string {
  const dir = copyFixture();
  dirs.push(dir);
  for (const rel of ["resume.yaml", "resumes/261008-01.html", "104/履歷欄位.md"]) edit(dir, rel, /OO大學/g, "逢甲大學");
  if (us) edit(dir, "jobhunt.yaml", /^market:.*$/m, "market: us");
  return dir;
}

async function check(dir: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCheck(["check", ...args], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

const BASE_104 = "2024-03 獲得月度優秀員工。";
const PERSONAL = "個人證號"; // the message for a personal ID number (the Taiwan one keeps its own wording)

// ---------------------------------------------------------------- ID numbers

for (const us of [false, true]) {
  test(`證號擋下（${us ? "us" : "tw"} 市場）：SSN、SEVIS、A 號碼、中國身分證算個人資料，不算編造的數字；輸出和結果檔只留遮住的`, async () => {
    const dir = cleanFolder(us);
    const ids = ["123-45-6789", "078 05 1120", "N0012345678", "A-123456789", "A-12345678", "A123-456-789", "11010519491231002X"];
    edit(dir, "104/履歷欄位.md", BASE_104, `${BASE_104}${ids.map((id, i) => `備註${"abcdefg"[i]} ${id}。`).join("")}`);
    const { code, out } = await check(dir, "--104");
    expect(code).toBe(1);
    const doc = read(dir, "checks/_104.md");
    for (const id of ids) {
      expect(out).not.toContain(id);
      expect(doc).not.toContain(id);
    }
    expect(out).toContain("***-**-****");
    expect(out).toContain("N**********");
    const probs = (await runChecks(new Folder(dir), { ids: [], general: true })).general!.blocks.flatMap((b) => b.problems);
    expect(probs.filter((p) => p.message.includes(PERSONAL)).length).toBe(ids.length);
    // reported as personal data, not as invented numbers 123 / 45 / 6789
    expect(probs.filter((p) => p.message.startsWith("數字")).length).toBe(0);
  });
}

test("證號：電話、9 位數學號、學號 A12345678、日期、金額、郵遞區號不當成證號", async () => {
  const dir = cleanFolder(true);
  const okay = ["電話 415-555-1234", "學號 123456789", "學號 A12345678", "日期 2024-03-05", "金額 $1,200,000", "郵遞區號 94105-1234", "訂單 X323456789"];
  edit(dir, "104/履歷欄位.md", BASE_104, `${BASE_104}${okay.map((s) => `${s}。`).join("")}`);
  const probs = (await runChecks(new Folder(dir), { ids: [], general: true })).general!.blocks.flatMap((b) => b.problems);
  expect(probs.filter((p) => p.message.includes(PERSONAL) || p.message.includes("身分證"))).toEqual([]);
});

test("證號：履歷檔（HTML）上的 SSN 也擋，引文是遮住的", async () => {
  const dir = cleanFolder(true);
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", "<li>收銀。SSN 123-45-6789。</li>");
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain(PERSONAL);
  expect(out).not.toContain("123-45-6789");
  expect(read(dir, "checks/261008-01.md")).not.toContain("123-45-6789");
});

test("Word 讀取器：SSN、SEVIS、A 號碼、中國身分證遮住並計數；電話、9 位數、學號 A12345678 不遮；台灣身分證照舊", () => {
  const m = maskIdNumbers("SSN 123-45-6789 與 078 05 1120\nSEVIS N0012345678\nA-Number: A-123456789\n身分證 11010519491231002X\n台灣 A123456789");
  expect(m.count).toBe(6);
  expect(m.text).toBe(`SSN ${ID_MASK} 與 ${ID_MASK}\nSEVIS ${ID_MASK}\nA-Number: ${ID_MASK}\n身分證 ${ID_MASK}\n台灣 ${ID_MASK}`);
  const keep = "電話 415-555-1234、9 位數 123456789、學號 A12345678、日期 2024-03-05";
  expect(maskIdNumbers(keep)).toEqual({ text: keep, count: 0 });
  expect(maskIdNumbers("ＳＳＮ １２３－４５－６７８９ x").count).toBe(1); // full-width
  expect(maskIdNumbers("1​23-45-6789").count).toBe(1); // invisible character inside
  expect(maskIdNumbers("Alien registration number 12345678").count).toBe(1); // labelled 8 digits
});

test("Word 讀取器（整個指令）：輸出裡沒有 SSN 和 SEVIS，最後一行講遮了幾個", () => {
  const dir = copyFixture();
  dirs.push(dir);
  mkdirSync(join(dir, "inbox"), { recursive: true });
  writeFileSync(join(dir, "inbox", "resume.docx"), makeDocx({ body: para("Name: Jane Doe") + para("SSN: 123-45-6789") + para("SEVIS ID N0012345678") }));
  const lines: string[] = [];
  const code = runRead(["--dir", dir, "read", "inbox/resume.docx"], dir, (s) => lines.push(s));
  const out = lines.join("\n");
  expect(code).toBe(0);
  expect(out).not.toContain("123-45-6789");
  expect(out).not.toContain("N0012345678");
  expect(out).toContain("Jane Doe");
  expect(lines[lines.length - 1]).toContain("2 個");
});

// ---------------------------------------------------------------- Source: / 來源：

test("104 檔：Source: 行和 來源： 行一樣，不複製、算來源、不當成文字檢查", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", /^來源：/gm, "Source: ");
  const body = parse104(read(dir, "104/履歷欄位.md"))[0].body;
  expect(copyText(body)).not.toContain("Source");
  expect(paragraphs(body).map((p) => p.sources)).toEqual([["學歷", "求職方向"], ["S-001"]]);
  const { code, out } = await check(dir);
  expect(out).toContain("全部通過");
  expect(code).toBe(0);
});

test("104 檔：Source: 指到草稿經歷、或整段沒有來源，照樣抓", async () => {
  const dir = cleanFolder(true);
  edit(dir, "104/履歷欄位.md", /^來源：S-001$/m, "Source: S-002");
  edit(dir, "104/履歷欄位.md", /^來源：學歷、求職方向$/m, "");
  const msgs = (await runChecks(new Folder(dir), { ids: [], general: true })).general!.blocks.flatMap((b) => b.problems).map((p) => p.message);
  expect(msgs.some((m) => m.includes("S-002") && m.includes("草稿"))).toBe(true);
  expect(msgs.some((m) => m.includes("沒有「來源：」"))).toBe(true);
});

test("履歷檔上出現 Source: 行也擋（和 來源： 一樣會被印出來）", async () => {
  const dir = cleanFolder(true);
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", "<li>收銀。</li><li>Source: S-001</li>");
  const report = await runChecks(new Folder(dir), { ids: ["261008-01"], general: false });
  expect(report.items[0].problems.some((p) => p.message.includes("不該有"))).toBe(true);
});

test("檢查結果檔：「## Program check」（英文標題）也認得，換掉它、不重複，其他段落不動", () => {
  const doc = "# AI manual check (not the program check)\n\n## Resume file\nmine\n\n## Program check\n- old\n\n## Notes\nkeep\n";
  const out = replaceSection(doc, "## 程式檢查\n- 結果：通過\n");
  expect(out.match(/^## (?:程式檢查|Program check)$/gm)?.length).toBe(1);
  expect(out).toContain("- 結果：通過");
  expect(out).not.toContain("- old");
  expect(out).toContain("## Resume file\nmine");
  expect(out).toContain("## Notes\nkeep");
});

// ---------------------------------------------------------------- visa words (market us only)

const VISA_BAD = ["F-1 student", "OPT authorized", "CPT in my program", "H-1B", "H1B holder", "visa required", "needs sponsorship", "green card pending", "work authorization", "Form I-20", "EAD card", "Employment Authorization Document", "f-1"];
const VISA_OK = [
  "option to extend", "opt-in emails", "adopt a process", "optimize workflows", "chose to opt for filing", "optical scanner",
  "Visa and Mastercard payments", "processed Visa card payments", "Analyst at Visa Inc.", "CPT coding and ICD-10", "billing with CPT codes",
  "secured event sponsorship", "corporate sponsorship", "sponsored a team lunch", "F1 score", "headed the club", "already read", "I-95 corridor",
];

const visaQuotes = (report: Awaited<ReturnType<typeof runChecks>>) => report.items[0].problems.filter((p) => p.message.includes("簽證")).map((p) => p.quote ?? "");

test("簽證字眼（us）：履歷檔上的 F-1、OPT、CPT、H-1B、visa、sponsorship、green card、work authorization、I-20、EAD 都擋", async () => {
  const dir = cleanFolder(true);
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", `<li>收銀。</li>${VISA_BAD.map((s) => `<li>${s}</li>`).join("")}`);
  const quotes = visaQuotes(await runChecks(new Folder(dir), { ids: ["261008-01"], general: false }));
  for (const s of VISA_BAD) expect(quotes.some((q) => q.includes(s))).toBe(true);
  expect(quotes.length).toBe(VISA_BAD.length);
});

test("簽證字眼（us）：option、opt-in、Visa 信用卡、Visa Inc.、CPT 編碼、活動 sponsorship、F1 score 不誤擋", async () => {
  const dir = cleanFolder(true);
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", `<li>收銀。</li>${VISA_OK.map((s) => `<li>${s}</li>`).join("")}`);
  expect(visaQuotes(await runChecks(new Folder(dir), { ids: ["261008-01"], general: false }))).toEqual([]);
});

test("簽證字眼：台灣市場不查（同一份 HTML）", async () => {
  const dir = cleanFolder(false);
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", "<li>收銀。F-1 OPT visa</li>");
  expect(visaQuotes(await runChecks(new Folder(dir), { ids: ["261008-01"], general: false }))).toEqual([]);
});

test("簽證字眼（us）：profiles/*.md 也擋；台灣市場不讀 profiles", async () => {
  const us = cleanFolder(true);
  write(us, "me/profile.md", "# Job goals\n\n## Work they want\n- Cashier\n"); // P8-fix: the roles in "Looking for ... roles" must be written here
  write(us, "profiles/linkedin.md", "# LinkedIn\n\n## About\nI am on F-1 OPT and need H-1B sponsorship.\nSource: S-001\n");
  // P4: handshake.md is held to the Handshake block format now, so the clean file uses a real Handshake block (it was "## About", a LinkedIn-only name).
  write(us, "profiles/handshake.md", "# Handshake profile text (draft)\n\n## My Journey\n- Fill: paste\n\nLooking for cashier roles.\nSource: Job goals\n"); // P8: My Journey holds only the fixed Education / Job goals sentences
  const report = await runChecks(new Folder(us), { ids: [], general: false });
  expect(report.profiles.map((p) => p.file)).toEqual(["profiles/handshake.md", "profiles/linkedin.md"]);
  expect(report.profiles[0].problems).toEqual([]);
  expect(report.profiles[1].problems.filter((p) => p.message.includes("簽證")).length).toBe(4); // F-1, OPT, H-1B, sponsorship
  expect(report.ok).toBe(false);
  const { code, out } = await check(us);
  expect(code).toBe(1);
  expect(out).toContain("profiles/linkedin.md");
  expect(read(us, "checks/_profiles.md")).toContain("簽證");

  const tw = cleanFolder(false);
  write(tw, "profiles/linkedin.md", "# LinkedIn\nF-1 OPT\n");
  expect((await runChecks(new Folder(tw), { ids: [], general: false })).profiles).toEqual([]);
});

// Red before P1: the last step needs "Source:" recognised as a source line (blocks104 SOURCE_LINE). The Folder part
// (me/work-auth.md is not readable) was already true.
test("me/work-auth.md 不是來源：app 讀不到它，來源寫它被擋，裡面的職稱也不能讓「希望職稱」過關", async () => {
  expect(Folder.allowed("me/work-auth.md", "read")).toBe(false);
  const dir = cleanFolder(true);
  write(dir, "me/work-auth.md", "# Work authorization\nF-1 OPT. Target role: 人資總監\n");
  edit(dir, "resumes/261008-01.html", "希望職稱：人資行政助理", "希望職稱：人資總監");
  const report = await runChecks(new Folder(dir), { ids: ["261008-01"], general: false });
  expect(report.items[0].problems.some((p) => p.message.includes("希望職稱不是你說過想找的工作"))).toBe(true);
  edit(dir, "104/履歷欄位.md", /^來源：S-001$/m, "Source: work-auth");
  const g = (await runChecks(new Folder(dir), { ids: [], general: true })).general!;
  expect(g.blocks.flatMap((b) => b.problems).some((p) => p.message.includes("work-auth") && p.message.includes("來源只能寫"))).toBe(true);
});

// ---------------------------------------------------------------- review fixes

test("台灣版：小寫 n／a 加手機號碼的 email 不是證號；真正的大寫 SEVIS 照擋", async () => {
  const dir = cleanFolder(false);
  edit(dir, "104/履歷欄位.md", BASE_104, `${BASE_104}信箱 n0912345678@gmail.com，另一個 a312345678@gmail.com。`);
  const { out } = await check(dir, "--104");
  expect(out).not.toContain(PERSONAL);
  const same = "Email：n0912345678@gmail.com，電話：0912345678，a312345678@gmail.com，handled a number 12345678 calls";
  const masked = maskIdNumbers(same);
  expect(masked.count).toBe(0);
  expect(masked.text).toBe(same);
  expect(maskIdNumbers("SEVIS N0012345678.").count).toBe(1);
  expect(maskIdNumbers("A-Number: A12345678").count).toBe(1);
  expect(maskIdNumbers("alien registration number 12345678").count).toBe(1);
});

test("證號的其他寫法：en-dash、點、空格夾橫線的 SSN；USCIS #: 123-456-789", () => {
  for (const s of ["123–45–6789", "123.45.6789", "123 - 45 - 6789", "USCIS #: 123-456-789", "USCIS number 123-456-789"])
    expect([s, extraIdMatches(s).length]).toEqual([s, 1]);
  expect(maskIdNumbers("SSN 123–45–6789 and 123 - 45 - 6789").count).toBe(2);
  expect(extraIdMatches("version 1.2.3, call 555 0100, 2024-05-17")).toEqual([]);
});

test("台灣版：template 寫 us 要報錯（沒有 resume-us.html）；美國版寫 us 沒事", async () => {
  const dir = cleanFolder(false);
  edit(dir, "targets/261008-01.yaml", /^(id:.*)$/m, "$1\ntemplate: us");
  const msgs = (await runChecks(new Folder(dir), { ids: ["261008-01"], general: false })).items[0].problems.map((p) => p.message);
  expect(msgs.some((m) => m.includes("履歷樣式寫錯了"))).toBe(true);
  const us = cleanFolder(true);
  edit(us, "targets/261008-01.yaml", /^(id:.*)$/m, "$1\ntemplate: us");
  const usMsgs = (await runChecks(new Folder(us), { ids: ["261008-01"], general: false })).items[0].problems.map((p) => p.message);
  expect(usMsgs.some((m) => m.includes("履歷樣式寫錯了"))).toBe(false);
});

test("Source: 只認大小寫正確的（source: 和 SOURCE: 是普通文字）", () => {
  expect(SOURCE_LINE.test("Source: S-001")).toBe(true);
  expect(SOURCE_LINE.test("來源：S-001")).toBe(true);
  expect(SOURCE_LINE.test("source: 2023 年報")).toBe(false);
  expect(SOURCE_LINE.test("SOURCE: 2023 年報")).toBe(false);
});

test("profiles/LinkedIn.MD（大寫副檔名）也要檢查，不能被默默跳過", async () => {
  const dir = cleanFolder(true);
  write(dir, "profiles/LinkedIn.MD", "I am on F-1 OPT and need H-1B sponsorship. SSN 123-45-6789\n");
  const report = await runChecks(new Folder(dir), { ids: [], general: false });
  expect(report.profiles.map((f) => f.file)).toEqual(["profiles/LinkedIn.MD"]);
  expect(report.ok).toBe(false);
  expect(report.profiles[0].problems.length).toBeGreaterThan(0);
});
