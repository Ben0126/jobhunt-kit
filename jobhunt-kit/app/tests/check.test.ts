// 程式檢查：jobhunt check 對模擬使用者的資料夾（tests/fixture 的複本）跑。
import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { copyText, paragraphs, parse104 } from "../src/blocks104.ts";
import { runCheck, runChecks, parseCheckArgs } from "../src/check.ts";
import { FIRST_LINE, replaceSection } from "../src/checksfile.ts";
import { Folder } from "../src/folder.ts";
import { visibleLines } from "../src/htmltext.ts";
import { cleanup, copyFixture, emptyTemp } from "./helpers.ts";

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

/** The fixture with the one real problem in it (the school name left as 「OO大學」) fixed. */
function cleanFolder(): string {
  const dir = copyFixture();
  dirs.push(dir);
  for (const rel of ["resume.yaml", "resumes/261008-01.html", "104/履歷欄位.md"]) edit(dir, rel, /OO大學/g, "逢甲大學");
  return dir;
}

async function check(dir: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCheck(["check", ...args], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

const SUMMARY = "  中國文學系 2025-06 畢業，在好市多做過收銀員，2024-03 獲得月度優秀員工。";

test("乾淨的資料夾：全部通過，結束碼 0，結果寫進 checks 的「## 程式檢查」", async () => {
  const dir = cleanFolder();
  const { code, out } = await check(dir);
  expect(out).toContain("全部通過");
  expect(code).toBe(0);
  for (const rel of ["checks/261008-01.md", "checks/_104.md"]) {
    const doc = read(dir, rel);
    expect(doc).toContain("## 程式檢查");
    expect(doc).toContain("- 結果：通過");
    expect(doc).toContain("- 檢查者：jobhunt 程式（不是 AI）");
  }
});

test("原本的測試資料夾：佔位字「OO」在履歷檔和 104 自傳都被抓到，結束碼 1", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const { code, out } = await check(dir);
  expect(code).toBe(1);
  expect(out).toContain("履歷檔：還有佔位字「OO」，要換成真的內容。原文：「OO大學中國文學系」");
  expect(out).toContain("104 總履歷・中文自傳：還有佔位字「OO」");
  // the quote keeps the original full-width comma
  expect(out).toContain("我是李欣怡，2025-06 畢業於OO大學");
});

test("捏造的數字：自我介紹多了「每天服務 500 位顧客」→ 沒通過，說出是哪個數字", async () => {
  const dir = cleanFolder();
  edit(dir, "targets/261008-01.yaml", SUMMARY, `${SUMMARY.trimEnd()}每天服務 500 位顧客。`);
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain("客製履歷・自我介紹：數字「500」在確認過的經歷裡找不到");
  expect(out).toContain("每天服務 500 位顧客");
});

test("中文數字：「服務五十位顧客」一樣要對到確認過的數字", async () => {
  const dir = cleanFolder();
  edit(dir, "targets/261008-01.yaml", SUMMARY, `${SUMMARY.trimEnd()}每天服務五十位顧客。`);
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain("數字「50」在確認過的經歷裡找不到");
});

test("AI 腔用詞：「打造」被抓到", async () => {
  const dir = cleanFolder();
  edit(dir, "targets/261008-01.yaml", SUMMARY, `${SUMMARY.trimEnd()}擅長打造流程。`);
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain("客製履歷・自我介紹：用了 AI 腔的詞「打造」");
});

test("佔位字：自我介紹裡的「（姓名）」被抓到", async () => {
  const dir = cleanFolder();
  edit(dir, "targets/261008-01.yaml", SUMMARY, "  我是（姓名），中國文學系 2025-06 畢業。");
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain("客製履歷・自我介紹：還有佔位字「(姓名)」");
});

test("履歷檔裡 AI 自己打的字也會被查（不在客製履歷設定裡的數字）", async () => {
  const dir = cleanFolder();
  edit(dir, "resumes/261008-01.html", "<li>收銀。</li>", "<li>收銀，每日服務500+位顧客。</li>");
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain("履歷檔：數字「500」在確認過的經歷裡找不到");
});

test("104：一段下面沒有「來源：」那一行 → 沒通過", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "我是李欣怡，2025-06 畢業於逢甲大學 中國文學系，想找行政或人資助理的工作。\n來源：學歷、求職方向", "我是李欣怡，2025-06 畢業於逢甲大學 中國文學系，想找行政或人資助理的工作。");
  const { code, out } = await check(dir, "--104");
  expect(code).toBe(1);
  expect(out).toContain("104 總履歷・中文自傳：這一段下面沒有「來源：」那一行");
  expect(out).not.toContain("宏遠精密"); // --104 only checks the 104 file
});

test("104：來源是還沒確認的草稿 → 沒通過", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "來源：S-001", "來源：S-001、S-003");
  const { code, out } = await check(dir, "--104");
  expect(code).toBe(1);
  expect(out).toContain("來源 S-003 還是草稿，本人還沒確認，不能用");
});

test("104：超過字數上限 → 沒通過（上限寫在檔案裡，或照 104 公布的表）", async () => {
  const dir = cleanFolder();
  const long = "我在好市多當收銀員。".repeat(101); // 1,010 字
  const doc = read(dir, "104/履歷欄位.md");
  write(dir, "104/履歷欄位.md", `${doc}\n## 個人簡介\n- 怎麼填：直接貼上\n\n${long}\n來源：S-001\n\n## 專長描述\n- 上限：500 字（截圖確認 2026-10-09）\n\n${"顧客的小問題先處理，大的叫主管。".repeat(32)}\n來源：S-001\n`);
  const { code, out } = await check(dir, "--104");
  expect(code).toBe(1);
  expect(out).toContain("104 總履歷・個人簡介：有 1,010 字，超過上限 1,000 字");
  expect(out).toContain("104 總履歷・專長描述：有 512 字，超過上限 500 字");
});

test("104：身分證字號被擋，而且檢查結果檔裡只留遮住的號碼", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "2024-03 獲得月度優秀員工。", "2024-03 獲得月度優秀員工。身分證 A123456789。");
  const { code, out } = await check(dir, "--104");
  expect(code).toBe(1);
  expect(out).toContain("看起來像身分證或居留證號碼（A1********）");
  expect(out).not.toContain("A123456789");
  expect(read(dir, "checks/_104.md")).not.toContain("A123456789");
});

test("104 應徵信與問答：每題一張卡，問題算在那個職缺", async () => {
  const dir = cleanFolder();
  write(
    dir,
    "jobs/261008-01/104-apply.md",
    "# 應徵 宏遠精密股份有限公司 人資行政助理：104 應徵信與問答（草稿）\n更新日期：2026-10-09\n每段下面「來源：」那一行不要貼進 104。\n\n" +
      "## 應徵信\n- 字數：約 40 字（上限待確認，以 104 畫面為準）\n\n我想應徵人資行政助理。我在好市多當過收銀員。\n來源：S-001、求職方向\n\n" +
      "## 應徵問答\n### 問：你為什麼想做人資？\n\n我致力於服務同事。\n來源：求職方向\n",
  );
  const r = await runChecks(new Folder(dir), { ids: ["261008-01"], general: false });
  const apply = r.items[0].apply!;
  expect(apply.blocks.map((b) => b.name)).toEqual(["應徵信", "應徵問答・問：你為什麼想做人資？"]);
  expect(apply.blocks[0].limit).toBeNull();
  expect(apply.blocks[0].problems).toEqual([]);
  expect(apply.blocks[1].problems[0].message).toContain("「致力於」");
  expect(r.items[0].problems.some((p) => p.where === "104 應徵信與問答・應徵問答・問：你為什麼想做人資？")).toBe(true);
  const { code } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(read(dir, "checks/261008-01.md")).toContain("### 104 應徵信與問答：每一欄");
});

test("回歸：104 應徵信的問題不算在履歷上（履歷頁的「存成 PDF」不該因為應徵信變紅）", async () => {
  const dir = cleanFolder();
  write(dir, "jobs/261008-01/104-apply.md", "## 應徵信\n\n我在好市多當過收銀員，每天服務 500 位顧客。\n來源：S-001\n");
  const r = await runChecks(new Folder(dir), { ids: ["261008-01"], general: false });
  const item = r.items[0];
  expect(item.problems.length).toBe(1); // the checks file still lists it
  expect(item.resumeProblems).toEqual([]);
});

test("客製履歷排序裡有不存在的重點 → 用白話說", async () => {
  const dir = cleanFolder();
  edit(dir, "targets/261008-01.yaml", "s001: [s001_a, s001_b, s001_c]", "s001: [s001_a, s001_b, s001_x]");
  const { code, out } = await check(dir, "261008-01");
  expect(code).toBe(1);
  expect(out).toContain("排序裡有一條重點，在確認過的履歷資料裡找不到");
  expect(out).toContain("（給 AI：重點代號 s001_x）"); // the id stays out of the UI, but the AI still gets it
});

test("只換「## 程式檢查」這一節：AI 寫的其他節一字不動，第二次跑不會重複", async () => {
  const dir = cleanFolder();
  const before = read(dir, "checks/261008-01.md");
  await check(dir);
  const once = read(dir, "checks/261008-01.md");
  expect(once.startsWith(before.trimEnd())).toBe(true);
  edit(dir, "targets/261008-01.yaml", SUMMARY, `${SUMMARY.trimEnd()}擅長打造流程。`);
  await check(dir);
  const twice = read(dir, "checks/261008-01.md");
  expect(twice.split("## 程式檢查").length).toBe(2);
  expect(twice.startsWith(before.trimEnd())).toBe(true);
  expect(twice).toContain("沒通過，有 1 個問題");
});

test("checks 檔不存在就新建，第一行固定", async () => {
  const dir = cleanFolder();
  rmSync(join(dir, "checks", "261008-01.md"));
  await check(dir, "261008-01");
  const doc = read(dir, "checks/261008-01.md");
  expect(doc.split("\n")[0]).toBe(FIRST_LINE);
  expect(doc).toContain("職缺：宏遠精密股份有限公司人資行政助理（代號 261008-01）");
});

test("replaceSection：程式檢查在中間時只換那一節，保留 BOM 和 CRLF", () => {
  const doc = "﻿# AI 手動檢查（不是程式檢查）\r\n\r\n## 客製履歷\r\n- 結果：通過\r\n\r\n## 程式檢查\r\n\r\n- 舊的\r\n### 要處理的問題\r\n1. 舊\r\n\r\n## 履歷檔\r\n- 結果：通過\r\n";
  const out = replaceSection(doc, "## 程式檢查\n\n- 新的\n");
  expect(out.startsWith("﻿# AI")).toBe(true);
  expect(out).not.toContain("舊");
  expect(out).toContain("## 程式檢查\r\n\r\n- 新的\r\n\r\n## 履歷檔\r\n- 結果：通過\r\n");
  expect(out).toContain("## 客製履歷\r\n- 結果：通過\r\n");
  expect(out.replace(/\r\n/g, "")).toBe(out.replace(/\r\n/g, "").replace(/\n/g, "")); // no bare \n
});

test("命令列：代號不存在、看不懂的參數、不是求職資料夾 → 結束碼 2", async () => {
  const dir = cleanFolder();
  let r = await check(dir, "no-such-job");
  expect(r.code).toBe(2);
  expect(r.out).toContain("找不到這些職缺代號：no-such-job");
  r = await check(dir, "--fast");
  expect(r.code).toBe(2);
  const empty = emptyTemp();
  dirs.push(empty);
  r = await check(empty);
  expect(r.code).toBe(2);
  expect(r.out).toContain("不是求職資料夾");
});

test("命令列參數寬鬆：檔名、路徑、104 都認得", () => {
  expect(parseCheckArgs(["check", "targets/261008-01.yaml", "resumes\\a.html", "--dir", "x"])).toEqual({ ids: ["261008-01", "a"], general: false, all: false, unknown: [] });
  expect(parseCheckArgs(["check", "104"]).general).toBe(true);
  expect(parseCheckArgs(["check", "_104"]).general).toBe(true);
  expect(parseCheckArgs(["check", "--all"]).all).toBe(true);
});

test("104 檔案格式：欄位說明那幾行不算內容，來源行不複製，小標算在下一段", () => {
  const blocks = parse104(
    "# 104 履歷欄位建議（草稿）\n更新日期：2026-10-08\n\n## 中文自傳\n- 上限：4,000 字\n- 字數：約 10 字\n- 怎麼填：直接貼上\n\n【我是誰】\n我是欣怡。\n來源：學歷\n\n第二段沒有來源。\n",
  );
  expect(blocks.length).toBe(1);
  expect(blocks[0].meta["上限"]).toBe("4,000 字");
  expect(copyText(blocks[0].body)).toBe("【我是誰】\n我是欣怡。\n\n第二段沒有來源。");
  const ps = paragraphs(blocks[0].body);
  expect(ps.map((p) => p.unsourced)).toEqual([null, "第二段沒有來源。"]);
  expect(ps[0].sources).toEqual(["學歷"]);
});

test("履歷檔上看得到的字：不含註解、樣式、程式、黃色列印提醒", () => {
  const lines = visibleLines(
    `<html><head><title>X 履歷</title><style>.a{}</style></head><body><!-- 說明 {{x}} -->
     <div class="print-tip"><strong>存成 PDF：</strong>按 Ctrl+P 3 次</div>
     <main><h1>王小明</h1><ul class="skills"><li><span class="label">語言</span>：英文（TOEIC 750）（中級）</li></ul>
     <p>A &amp; B</p></main><script>if (a<b) { x = "<p>不算</p>" }</script></body></html>`,
  );
  expect(lines).toEqual([
    { text: "王小明", skills: false },
    { text: "語言：英文（TOEIC 750）（中級）", skills: true },
    { text: "A & B", skills: false },
  ]);
});

// ---------------------------------------------------------------- W4：審查找到的繞過方式（每個都是修前會通過檢查的寫法）

const HTML = "resumes/261008-01.html";
const T = "targets/261008-01.yaml";

async function fails(dir: string, ...args: string[]) {
  const r = await check(dir, ...args);
  expect(r.code).toBe(1);
  return r.out;
}

test("回歸：履歷檔上多一條編造的重點（沒有數字、沒有 AI 腔）→ 對不上 AI 準備的內容", async () => {
  for (const extra of ["<li>負責新人教育訓練與排班。</li>", "<li>收銀，並升任好市多副店長。</li>"]) {
    const dir = cleanFolder();
    edit(dir, HTML, "<li>收銀。</li>", `<li>收銀。</li>\n        ${extra}`);
    const out = await fails(dir, "261008-01");
    expect(out).toContain("履歷檔：這一句和 AI 準備的內容對不上");
    expect(out).toContain(extra.replace(/<\/?li>/g, ""));
  }
});

test("回歸：AI 準備的自我介紹改了，履歷檔還是舊的 → 履歷檔那一句對不上", async () => {
  const dir = cleanFolder();
  edit(dir, T, SUMMARY, "  中國文學系 2025-06 畢業，在好市多做過收銀員。");
  const out = await fails(dir, "261008-01");
  expect(out).toContain("履歷檔：這一句和 AI 準備的內容對不上");
});

test("回歸：履歷檔上的「來源：」行也會被查（它會印出來）", async () => {
  const dir = cleanFolder();
  edit(dir, HTML, "<li>收銀。</li>", "<li>收銀。</li><li>來源：每月業績很好</li>");
  const out = await fails(dir, "261008-01");
  expect(out).toContain("履歷檔上不該有「來源：」這一行");
});

test("回歸：藏起來不給程式看、但印得出來的寫法，一律擋下", async () => {
  const tricks: [string, string][] = [
    ["no-print class", `<p class="no-print">每月業績很好。</p>`],
    ["screen-only class", `<p class="screen-only">每月業績很好。</p>`],
    ["print-tip-note class", `<p class="print-tip-note">每月業績很好。</p>`],
    ["hidden in an attribute value", `<p data-note="not hidden here">每月業績很好。</p>`],
    ["button", `<button>每月業績很好。</button>`],
    ["svg text", `<svg><text x="0" y="10">每月業績很好。</text></svg>`],
    ["input value", `<input value="每月業績很好。">`],
    ["textarea", `<textarea>每月業績很好。</textarea>`],
    ["css content", `<style>.summary::after{content:"每月業績很好"}</style>`],
    ["comment trick 1", `<!--><p>每月業績很好。</p><!-- x -->`],
    ["comment trick 2", `<!-- a --!><p>每月業績很好。</p><!-- b -->`],
    ["extra script", `<script>document.write("每月業績很好")</script>`],
    ["foreign image", `<img src="data:image/png;base64,AAAA" alt="每月業績很好">`],
  ];
  for (const [name, html] of tricks) {
    const dir = cleanFolder();
    edit(dir, HTML, "</main>", `${html}\n</main>`);
    const r = await check(dir, "261008-01");
    expect({ name, code: r.code }).toEqual({ name, code: 1 });
  }
  // a <p> written inside <head> is shown (the browser moves it into the body)
  const dir = cleanFolder();
  edit(dir, HTML, "</head>", "<p>每月業績很好。</p>\n</head>");
  expect((await check(dir, "261008-01")).code).toBe(1);
});

test("回歸：專長寫了還沒確認的項目（Excel（精通））→ 不在確認過的履歷資料裡", async () => {
  const dir = cleanFolder();
  edit(dir, T, "skills_order: []", "skills_order: ['文書工具: Excel（精通）、Word']");
  const out = await fails(dir, "261008-01");
  expect(out).toContain("專長「Excel（精通）」不在確認過的履歷資料裡");
  expect(out).toContain("專長「Word」不在確認過的履歷資料裡");
});

test("專長照確認過的履歷資料寫 → 通過；那一行的來源是草稿 → 擋下", async () => {
  const dir = cleanFolder();
  edit(dir, "resume.yaml", "{label: 文書工具, items: [], sources: [], variants: [tw]}", "{label: 文書工具, items: [Word, Excel（樞紐分析）], sources: [S-001], variants: [tw]}");
  edit(dir, T, "skills_order: []", "skills_order: ['文書工具: Word、Excel（樞紐分析）']");
  edit(dir, HTML, "</main>", `<section class="block"><h2>專長、證照與語言</h2><ul class="skills"><li><span class="label">文書工具：</span>Word、Excel（樞紐分析）</li></ul></section>\n</main>`);
  let r = await check(dir, "261008-01");
  expect(r.out).toContain("全部通過");
  edit(dir, "resume.yaml", "sources: [S-001], variants: [tw]}", "sources: [S-003], variants: [tw]}");
  r = await check(dir, "261008-01");
  expect(r.code).toBe(1);
  expect(r.out).toContain("來源 S-003 還是草稿");
});

test("專長那一行寫錯格式時，訊息講清楚要用半形冒號", async () => {
  const dir = cleanFolder();
  edit(dir, T, "skills_order: []", "skills_order: ['文書工具：Word']");
  const out = await fails(dir, "261008-01");
  expect(out).toContain("冒號要用半形的「:」");
});

test("回歸：用日期把年資灌大（2019 年起）、「連續 6 月」→ 擋下", async () => {
  let dir = cleanFolder();
  edit(dir, T, SUMMARY, "  中國文學系 2025-06 畢業，2019-07 – 2025-05 在好市多做收銀員。");
  let out = await fails(dir, "261008-01");
  expect(out).toContain("日期「2019-07」在確認過的經歷裡找不到");
  dir = cleanFolder();
  edit(dir, T, SUMMARY, `${SUMMARY.trimEnd()}連續 6 月獲得優秀員工。`);
  out = await fails(dir, "261008-01");
  expect(out).toContain("數字「6」在確認過的經歷裡找不到");
});

test("回歸：104 欄位的「怎麼填」寫了「可以不填」，內容一樣要查", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "- 怎麼填：直接貼上（小標要貼就算字數）", "- 怎麼填：直接貼上，這欄可以不填");
  edit(dir, "104/履歷欄位.md", "想找行政或人資助理的工作。", "想找行政或人資助理的工作，我致力於服務。");
  const out = await fails(dir, "--104");
  expect(out).toContain("「致力於」");
});

test("回歸：不用複製的欄位（建議選、請自己填）也查 AI 腔和佔位字", async () => {
  const dir = cleanFolder();
  const doc = read(dir, "104/履歷欄位.md");
  write(dir, "104/履歷欄位.md", `${doc}\n## 希望職類\n- 怎麼填：下拉選單\n\n建議選我的原因：我致力於服務 OO 公司。\n`);
  const out = await fails(dir, "--104");
  expect(out).toContain("「致力於」");
  expect(out).toContain("佔位字「OO」");
});

test("回歸：來源寫「學歷」，內容卻是還沒確認的經歷（系學會）→ 擋下", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "想找行政或人資助理的工作。\n來源：學歷、求職方向", "想找行政或人資助理的工作。\n來源：學歷、求職方向\n\n我在系學會擔任總務，負責管帳。\n來源：學歷");
  const out = await fails(dir, "--104");
  expect(out).toContain("提到還沒確認的經歷「系學會");
});

test("回歸：來源只寫「學歷」，內容卻講工作經歷（好市多）→ 擋下", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "想找行政或人資助理的工作。\n來源：學歷、求職方向", "想找行政或人資助理的工作。\n來源：學歷、求職方向\n\n我在好市多也負責排班。\n來源：學歷");
  const out = await fails(dir, "--104");
  expect(out).toContain("寫到經歷「好市多」，來源卻只寫了學歷或求職方向");
});

test("回歸：檔案裡寫一個很大的上限，不能讓超過 104 公布上限的內容通過", async () => {
  const dir = cleanFolder();
  edit(dir, "104/履歷欄位.md", "- 上限：4,000 字（2023 年公布，待確認）", "- 上限：99,999 字");
  edit(dir, "104/履歷欄位.md", "顧客的小問題我會先處理，大的叫主管。", "顧客的小問題我會先處理，大的叫主管。".repeat(250));
  const out = await fails(dir, "--104");
  expect(out).toMatch(/中文自傳：有 4,[0-9]{3} 字，超過上限 4,000 字/);
});

test("回歸：checks 資料夾寫不進去時，用白話說，不印英文", async () => {
  const dir = cleanFolder();
  rmSync(join(dir, "checks"), { recursive: true });
  write(dir, "checks", "not a folder");
  const r = await check(dir, "261008-01");
  expect(r.code).toBe(2);
  expect(r.out).toContain("檢查做完了，但結果檔寫不進去");
  expect(r.out).not.toMatch(/outside|EEXIST|ENOTDIR|Error|not allowed/i);
});

test("英文版用 targets 的 en_names（學校、公司的英文名稱）：不算對不上", async () => {
  const dir = cleanFolder();
  edit(dir, T, "skills_order: []", "skills_order: []\nen_names:\n  逢甲大學: Feng Chia University");
  edit(dir, HTML, ">逢甲大學<", ">Feng Chia University<");
  const r = await check(dir, "261008-01");
  expect(r.out).toContain("全部通過");
});
