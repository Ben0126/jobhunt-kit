// P7: (1) a folder the program does not recognise speaks English when a path names the US kit (job-hunt-us), else Chinese
// as before; (2) a US folder rejects template tw / tw-classic; (3) the digit of F-1 / H-1B / I-20 is not also "an unconfirmed number".
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck, runChecks } from "../src/check.ts";
import { runRead } from "../src/docx.ts";
import { Folder } from "../src/folder.ts";
import { launch } from "../src/launch.ts";
import { pathNamesUsKit, unrecognisedLanguage } from "../src/market.ts";
import { maskVisaWords } from "../src/visa.ts";
import { cleanup, copyFixture, emptyTemp } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const hasChinese = (s: string) => /[⺀-鿿]/.test(s);
const US_PATHS = ["C:\\Users\\a\\AppData\\Local\\Temp\\Temp1_job-hunt-us-windows.zip\\job-hunt-us", "/Users/a/Downloads/job-hunt-us", "/Users/a/Downloads/Job-Hunt-US-mac-apple.zip/job-hunt-us"];
const TW_PATHS = ["C:\\Users\\a\\Temp\\Temp1_job-hunt-windows.zip\\job-hunt", "/Users/a/focus-us/job-hunt", "/Users/a/campus-users/x", "C:\\Users\\a\\job-hunt-user-notes", "/tmp/us"];

test("路徑判斷：job-hunt-us 資料夾或 job-hunt-us-*.zip 才算美國版；focus-us、campus-users 不算", () => {
  for (const p of US_PATHS) expect([p, pathNamesUsKit(p)]).toEqual([p, true]);
  for (const p of TW_PATHS) expect([p, pathNamesUsKit(p)]).toEqual([p, false]);
  // the program's own path counts too, and the folder path alone is enough
  expect(unrecognisedLanguage(null, "C:\\Temp1_job-hunt-us-windows.zip\\job-hunt-us\\jobhunt.exe")).toBe("en");
  expect(unrecognisedLanguage("C:\\x\\job-hunt-us", "C:\\bun\\bun.exe")).toBe("en");
  expect(unrecognisedLanguage("C:\\x\\job-hunt", "C:\\bun\\bun.exe")).toBe("zh-TW");
  expect(unrecognisedLanguage(null, "C:\\bun\\bun.exe")).toBe("zh-TW");
});

test("找不到求職資料夾：路徑有 job-hunt-us → check / read / launch 全英文；一般路徑與 focus-us 類 → 照舊中文", async () => {
  const base = emptyTemp();
  dirs.push(base);
  for (const [name, english] of [["job-hunt-us", true], ["Temp1_job-hunt-us-windows.zip", true], ["job-hunt", false], ["focus-us", false], ["campus-users", false]] as const) {
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    const out: string[] = [];
    const print = (s: string) => out.push(s);
    expect(await runCheck(["check"], dir, print)).toBe(2);
    expect(runRead(["read", "x.docx"], dir, print)).toBe(2);
    const r = await launch(dir, { open: false, print });
    expect(r.kind).toBe("not-folder");
    const text = out.join("\n");
    expect([name, hasChinese(text)]).toEqual([name, !english]);
    if (english) expect(text).toContain("does not look like a job-search folder");
  }
});

test("main.ts：zip 內（路徑有 job-hunt-us）沒解壓直接跑 → 英文；一般路徑照舊中文", async () => {
  const base = emptyTemp();
  dirs.push(base);
  const run = async (name: string) => {
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    const p = Bun.spawn([process.execPath, join(import.meta.dir, "..", "src", "main.ts"), "--dir", dir, "--no-open"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    return out;
  };
  const us = await run("Temp1_job-hunt-us-windows.zip");
  expect(hasChinese(us)).toBe(false);
  expect(us).toContain("does not look like a job-search folder");
  expect(hasChinese(await run("job-hunt"))).toBe(true);
});

// ---------------------------------------------------------------- template tw / tw-classic in a US folder

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
function cleanFolder(us: boolean, english = false): string {
  const dir = copyFixture();
  dirs.push(dir);
  for (const rel of ["resume.yaml", "resumes/261008-01.html", "104/履歷欄位.md"]) edit(dir, rel, /OO大學/g, "逢甲大學");
  if (us) edit(dir, "jobhunt.yaml", /^market:.*$/m, "market: us");
  if (us && english) edit(dir, "jobhunt.yaml", /^language:.*$/m, "language: en");
  return dir;
}
const problems = async (dir: string) => (await runChecks(new Folder(dir), { ids: ["261008-01"], general: false })).items[0].problems;

test("美國版：targets 的 template 寫 tw / tw-classic 要報錯（照資料夾語言）；en / us 沒事", async () => {
  for (const tpl of ["tw", "tw-classic"]) {
    const dir = cleanFolder(true);
    edit(dir, "targets/261008-01.yaml", /^(id:.*)$/m, `$1\ntemplate: ${tpl}`);
    const ps = await problems(dir);
    expect(ps.some((p) => p.message.includes("履歷樣式寫錯了") && p.detail === `template: ${tpl}`)).toBe(true);
    const en = cleanFolder(true, true);
    edit(en, "targets/261008-01.yaml", /^(id:.*)$/m, `$1\ntemplate: ${tpl}`);
    expect((await problems(en)).some((p) => p.message.includes("The resume style is not valid") && p.message.includes('"us"'))).toBe(true);
  }
  for (const tpl of ["en", "us"]) {
    const dir = cleanFolder(true);
    edit(dir, "targets/261008-01.yaml", /^(id:.*)$/m, `$1\ntemplate: ${tpl}`);
    expect((await problems(dir)).some((p) => p.message.includes("履歷樣式寫錯了"))).toBe(false);
  }
});

test("台灣版：template tw / tw-classic 照舊沒事", async () => {
  for (const tpl of ["tw", "tw-classic"]) {
    const dir = cleanFolder(false);
    edit(dir, "targets/261008-01.yaml", /^(id:.*)$/m, `$1\ntemplate: ${tpl}`);
    expect((await problems(dir)).some((p) => p.message.includes("履歷樣式寫錯了"))).toBe(false);
  }
});

// ---------------------------------------------------------------- visa digit is not a second error

test("簽證字眼的數字（F-1、H-1B、I-20）不再另外被報成「沒確認過的數字」；簽證錯誤還在，別的數字照報", async () => {
  const dir = cleanFolder(true);
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", "<li>收銀。</li><li>F-1 student</li><li>H-1B holder</li><li>Form I-20</li><li>Served 987 customers</li>");
  const ps = await problems(dir);
  const numbers = ps.filter((p) => p.message.startsWith("數字"));
  expect(numbers.map((p) => p.message).join("\n")).toContain("987");
  expect(numbers.map((p) => p.message).join("\n")).not.toMatch(/「(?:1|20|1B)」/);
  expect(ps.filter((p) => p.message.includes("簽證")).length).toBe(3);
});

test("maskVisaWords：只蓋掉簽證字眼，其他字不動", () => {
  expect(maskVisaWords("On F-1 and 5 jobs")).toBe("On     and 5 jobs");
  expect(maskVisaWords("no visa words 20")).toBe("no      words 20");
});

test("profiles（美國版）：同一行的 F-1 只報簽證，不另報數字", async () => {
  const dir = cleanFolder(true);
  write(dir, "profiles/linkedin.md", "# LinkedIn\n\n## About\nI am on F-1 OPT.\nSource: S-001\n");
  const report = await runChecks(new Folder(dir), { ids: [], general: false });
  const ps = report.profiles.find((p) => p.file === "profiles/linkedin.md")!.problems;
  expect(ps.some((p) => p.message.includes("簽證"))).toBe(true);
  expect(ps.filter((p) => p.message.startsWith("數字") && /「1」/.test(p.message))).toEqual([]);
});

// ---------------------------------------------------------------- unrecognised US-named folder is still the US kit (no Taiwan 104 wording)

test("認不得的資料夾：美國命名 → 用法說明與未知參數訊息不含 104；台灣命名照舊含 104", async () => {
  const base = emptyTemp();
  dirs.push(base);
  const usDir = join(base, "Temp1_job-hunt-us-windows.zip");
  const twDir = join(base, "Temp1_job-hunt-windows.zip");
  mkdirSync(usDir, { recursive: true });
  mkdirSync(twDir, { recursive: true });
  // runCheck: unknown option is rejected before the folder is looked at
  const usOut: string[] = [];
  expect(await runCheck(["check", "--bogus"], usDir, (s) => usOut.push(s))).toBe(2);
  expect(usOut.join("\n")).not.toContain("104");
  expect(hasChinese(usOut.join("\n"))).toBe(false);
  const twOut: string[] = [];
  expect(await runCheck(["check", "--bogus"], twDir, (s) => twOut.push(s))).toBe(2);
  expect(twOut.join("\n")).toContain("104");
  // main.ts: unknown command prints usage
  const run = async (dir: string) => {
    const p = Bun.spawn([process.execPath, join(import.meta.dir, "..", "src", "main.ts"), "frobnicate", "--dir", dir], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    return out;
  };
  const usMain = await run(usDir);
  expect(usMain).toContain("Usage");
  expect(usMain).not.toContain("104");
  expect(hasChinese(usMain)).toBe(false);
  expect(await run(twDir)).toContain("104");
});
