// 「兩邊都找」的資料夾：每個職缺照自己的市場檢查；中文句子要有中文卡；104 照台灣規則、個人檔案照美國規則。
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfirmedZh, runChecks } from "../src/check.ts";
import { Folder } from "../src/folder.ts";
import { marketForTarget, writeMode } from "../src/mode.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const edit = (dir: string, rel: string, from: string | RegExp, to: string) => {
  const p = join(dir, rel);
  const t = readFileSync(p, "utf-8");
  const n = t.replace(from, to);
  if (n === t) throw new Error(`no change in ${rel}: ${from}`);
  writeFileSync(p, n);
};

const ZH_CARD = "\n## 中文確認時的句子（不能改）\n\n職稱：收銀員\n機構：好市多\n1. 顧客的小問題先處理，大的叫主管。\n2. 收銀。\n3. 2024-03 獲得月度優秀員工。\n";

/** The Taiwan fixture, clean (it passes every check), turned into a folder that looks in both markets. */
async function bothFolder(withChineseCard = true): Promise<string> {
  const dir = copyFixture();
  dirs.push(dir);
  for (const rel of ["resume.yaml", "resumes/261008-01.html", "104/履歷欄位.md"]) edit(dir, rel, /OO大學/g, "逢甲大學");
  edit(dir, "jobhunt.yaml", /^market:.*\n/m, "");
  await writeMode(new Folder(dir), ["us", "tw"]);
  if (withChineseCard) writeFileSync(join(dir, "me/stories/S-001.md"), readFileSync(join(dir, "me/stories/S-001.md"), "utf-8") + ZH_CARD);
  return dir;
}

test("marketForTarget：一個市場就是那個；兩邊都找時看 market:，沒寫就看 base_variant", () => {
  expect(marketForTarget({ base_variant: "en" }, ["tw"], "tw")).toBe("tw");
  expect(marketForTarget({ market: "tw" }, ["us"], "us")).toBe("us");
  const both: ("us" | "tw")[] = ["us", "tw"];
  expect(marketForTarget({ base_variant: "en" }, both, "us")).toBe("us");
  expect(marketForTarget({ base_variant: "en-swe" }, both, "us")).toBe("us");
  expect(marketForTarget({ base_variant: "tw" }, both, "us")).toBe("tw");
  expect(marketForTarget({ base_variant: "en", market: "tw" }, both, "us")).toBe("tw"); // English resume for a Taiwan employer
  expect(marketForTarget(null, both, "us")).toBe("tw");
});

test("parseConfirmedZh（比對用，全形標點先換成半形）：職稱／機構／日期加編號句子；格式不對就是 bad；沒有這一節是 null", () => {
  expect(parseConfirmedZh("x\n" + ZH_CARD)).toEqual({ title: "收銀員", org: "好市多", dates: null, sentences: ["顧客的小問題先處理,大的叫主管。", "收銀。", "2024-03 獲得月度優秀員工。"] });
  expect(parseConfirmedZh("## 中文確認時的句子（不能改）\n\n職稱：收銀員\n這行沒有編號\n")!.bad).toBe(true);
  expect(parseConfirmedZh("## 中文確認時的句子\n\n職稱：收銀員\n")!.bad).toBe(true); // a title with no sentence
  expect(parseConfirmedZh("## 你說的原話\n")).toBeNull();
});

test("兩邊都找：台灣的職缺照台灣規則（A4 中文範本、中文用詞），中文句子對得上中文卡 → 全部通過", async () => {
  const dir = await bothFolder();
  const r = await runChecks(new Folder(dir));
  expect([...r.items.flatMap((i) => i.problems), ...(r.resumeData ?? []), ...(r.general ? r.general.blocks.flatMap((b) => b.problems) : [])]).toEqual([]);
  expect(r.ok).toBe(true);
  expect(r.general).not.toBeNull(); // 104 is checked (Taiwan is one of the markets)
});

test("兩邊都找：中文句子沒有中文卡 → 報錯（中文只能來自確認過的中文卡）", async () => {
  const dir = await bothFolder(false);
  const r = await runChecks(new Folder(dir));
  expect((r.resumeData ?? []).map((p) => p.message)).toEqual(["S-001 還沒有中文卡：resume.yaml 的中文句子要先出中文卡、本人打「確認中文 S-001」才能用"]);
  expect(r.ok).toBe(false);
});

test("兩邊都找：中文句子被改寫、職稱或單位和中文卡不同 → 報錯", async () => {
  const dir = await bothFolder();
  edit(dir, "resume.yaml", "text: 收銀。", "text: 負責收銀與結帳。");
  edit(dir, "resume.yaml", "role: 收銀員", "role: 收銀組長");
  edit(dir, "resume.yaml", "org: 好市多", "org: 好市多 台中店");
  const msgs = ((await runChecks(new Folder(dir))).resumeData ?? []).map((p) => p.message);
  expect(msgs).toContain("resume.yaml 的這句中文和 S-001 中文卡上確認過的句子不一樣（不能自己改寫，要改就重新出中文卡）");
  expect(msgs).toContain("resume.yaml 這一筆的職稱和 S-001 中文卡上的職稱「收銀員」不一樣");
  expect(msgs).toContain("resume.yaml 這一筆的單位名稱和 S-001 中文卡上的「好市多」不一樣");
});

test("兩邊都找：台灣的職缺不能用美國版範本，美國的職缺不能用台灣的 A4 範本（每個職缺照自己的市場）", async () => {
  const dir = await bothFolder();
  edit(dir, "targets/261008-01.yaml", /^(id:.*)$/m, "$1\ntemplate: us");
  let ps = (await runChecks(new Folder(dir), { ids: ["261008-01"], general: false })).items[0].problems.map((p) => p.message);
  expect(ps.some((m) => m.includes("履歷樣式寫錯了"))).toBe(true);
  // the same job marked for the US: now tw is the wrong one
  edit(dir, "targets/261008-01.yaml", "template: us", "template: tw\nmarket: us");
  ps = (await runChecks(new Folder(dir), { ids: ["261008-01"], general: false })).items[0].problems.map((p) => p.message);
  expect(ps.some((m) => m.includes("履歷樣式寫錯了"))).toBe(true);
});

test("只找台灣的舊資料夾：行為不變（沒有中文卡也通過，沒有美國的檢查）", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  for (const rel of ["resume.yaml", "resumes/261008-01.html", "104/履歷欄位.md"]) edit(dir, rel, /OO大學/g, "逢甲大學");
  const r = await runChecks(new Folder(dir));
  expect(r.ok).toBe(true);
  expect(r.resumeData).toBeUndefined();
});
