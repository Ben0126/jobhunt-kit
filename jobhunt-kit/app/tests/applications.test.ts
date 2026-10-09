import { afterEach, expect, test } from "bun:test";
import { mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Applications, KIT_HEADER, followUps } from "../src/applications.ts";
import { parseCsv, rowToObject } from "../src/csv.ts";
import { Folder } from "../src/folder.ts";
import { cleanup, copyFixture, csvPath, readCsv, writeCsv } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

function setup(today = "2026-10-09") {
  const dir = copyFixture();
  dirs.push(dir);
  const apps = new Applications(new Folder(dir), () => today);
  return { dir, apps };
}

const rowsOf = (dir: string) => {
  const d = parseCsv(readCsv(dir));
  return d.rows.map((r) => rowToObject(d.header, r));
};

test("看板：讀出每一列、版本、今天、可不可以刪", async () => {
  const { apps } = setup();
  const b = await apps.board();
  expect(b.rows.map((r) => r.company)).toEqual(["宏遠精密股份有限公司", "全家便利商店", "國泰人壽", "誠品生活"]);
  expect(b.rows[1].notes).toBe('備註有逗號, 也有"引號"');
  expect(b.today).toBe("2026-10-09");
  expect(b.version).toMatch(/^[0-9a-f]{16}$/);
  // 國泰人壽（261005-01）在 submitted/ 有快照 → 不能刪
  expect(b.rows.map((r) => r._deletable)).toEqual([true, true, false, true]);
});

// 規格改過（業主 2026-10-09）：7 天改成 10 天，和業主自己的系統一致（細節見 board_rules.test.ts）。
test("該追蹤了：已投遞 10 天沒更新、面試日期已過；9 天和今天的面試不算", async () => {
  const { apps } = setup("2026-10-11");
  const f = (await apps.board()).followUps;
  expect(f.map((x) => [x.company, x.kind])).toEqual([
    ["宏遠精密股份有限公司", "applied"],
    ["國泰人壽", "interview"],
  ]);
  expect(f[0].message).toContain("10 天");

  const rows = [
    { status: "applied", applied_date: "2026-09-30", last_update: "2026-09-30" }, // 9 天
    { status: "applied", applied_date: "2026-09-01", last_update: "2026-10-05" }, // 最近有更新
    { status: "applied", applied_date: "", last_update: "" }, // 沒日期不提醒
    { status: "interview", next_action_date: "2026-10-09" }, // 今天
    { status: "interview", next_action_date: "" },
    { status: "oa", applied_date: "2026-01-01", last_update: "2026-01-01" },
    { status: "applied", applied_date: "2026-02-30", last_update: "亂寫" }, // 壞日期
  ];
  expect(followUps(rows as any, "2026-10-09")).toEqual([]);
});

test("新增：公司、職稱必填；職缺網址可不填，但要是網址；重複的擋掉", async () => {
  const { apps, dir } = setup();
  const before = readCsv(dir);
  const v = (await apps.board()).version;
  await expect(apps.add({ company: " ", role: "助理", version: v })).rejects.toThrow("請填公司名稱。");
  await expect(apps.add({ company: "A", role: "", version: v })).rejects.toThrow("請填職稱。");
  await expect(apps.add({ company: "A", role: "B", link: "javascript:alert(1)", version: v })).rejects.toThrow("http");
  await expect(apps.add({ company: "國泰人壽", role: "人資助理", version: v })).rejects.toThrow("已經有");
  expect(readCsv(dir)).toBe(before);
});

test("新增中文職缺：代號用 日期-流水號，看過所有資料夾和進度表，不撞號", async () => {
  const { apps, dir } = setup("2026-10-08");
  // 261008-01（jobs/targets/checks/resumes）和 261008-02（進度表）都用過了
  let b = await apps.add({ company: "台灣大哥大", role: "門市人員", link: "https://www.104.com.tw/job/x", version: (await apps.board()).version });
  b = await apps.add({ company: "統一超商", role: "儲備幹部", version: b.version });
  const added = rowsOf(dir).slice(-2);
  expect(added.map((r) => r.job_id)).toEqual(["261008-03", "261008-04"]);
  expect(added[0]).toMatchObject({
    company: "台灣大哥大", role: "門市人員", status: "todo", last_update: "2026-10-08",
    link: "https://www.104.com.tw/job/x", applied_date: "",
  });
  expect(added[1].link).toBe("");
});

test("新增英文名稱：代號照英文規則；同名加 -2", async () => {
  const { apps, dir } = setup();
  mkdirSync(join(dir, "jobs", "acme-hr-assistant"));
  await apps.add({ company: "ACME", role: "HR Assistant", version: (await apps.board()).version });
  expect(rowsOf(dir).at(-1)!.job_id).toBe("acme-hr-assistant-2");
});

test("新增：職缺原文已經存在（jobs/<id>/jd.md 公司職稱相同）就沿用那個代號，並連上客製履歷", async () => {
  const { apps, dir } = setup();
  writeCsv(dir, KIT_HEADER.join(",") + "\n"); // AI 存了職缺，但還沒記進度
  await apps.add({ company: "宏遠精密股份有限公司", role: "人資行政助理", version: (await apps.board()).version });
  expect(rowsOf(dir)[0]).toMatchObject({ job_id: "261008-01", resume_version: "targets/261008-01" });
});

test("改成已投遞：投遞日期空的就填今天，last_update 也更新；其他列一個字都不動", async () => {
  const { apps, dir } = setup("2026-10-09");
  const before = readCsv(dir).split("\n");
  const b = await apps.board();
  await apps.update({ index: 1, job_id: "261008-02", version: b.version, changes: { status: "applied" } });
  const after = readCsv(dir).split("\n");
  expect(rowsOf(dir)[1]).toMatchObject({ status: "applied", applied_date: "2026-10-09", last_update: "2026-10-09", notes: '備註有逗號, 也有"引號"' });
  expect(after.length).toBe(before.length);
  after.forEach((line, i) => {
    if (i !== 2) expect(line).toBe(before[i]);
  });
  expect(after[0].replace(/\r$/, "")).toBe(KIT_HEADER.join(","));
});

test("改成已投遞但已經有投遞日期：不覆蓋", async () => {
  const { apps, dir } = setup();
  const b = await apps.board();
  await apps.update({ index: 3, job_id: "261002-01", version: b.version, changes: { status: "applied" } });
  expect(rowsOf(dir)[3]).toMatchObject({ status: "applied", applied_date: "2026-09-15", last_update: "2026-10-09" });
});

// 規格改過（業主 2026-10-09）：只有狀態改變才更新 last_update，改日期也不更新。
test("last_update 只在狀態改變時更新；改公司、下一步、備註、日期都不更新", async () => {
  const { apps, dir } = setup("2026-10-20");
  let b = await apps.board();
  b = await apps.update({
    index: 0, job_id: "261008-01", version: b.version,
    changes: { company: "宏遠精密", next_action: "寄感謝信", notes: "人很好", role: "人資行政助理" },
  });
  expect(rowsOf(dir)[0]).toMatchObject({ company: "宏遠精密", next_action: "寄感謝信", notes: "人很好", last_update: "2026-10-01" });
  b = await apps.update({ index: 0, job_id: "261008-01", version: b.version, changes: { status: "applied", next_action_date: "2026-10-25" } });
  expect(rowsOf(dir)[0]).toMatchObject({ next_action_date: "2026-10-25", last_update: "2026-10-01" });
  // 狀態相同、日期相同 → 不算改變，也不寫檔
  const snap = readCsv(dir);
  await apps.update({ index: 0, job_id: "261008-01", version: b.version, changes: { status: "applied", applied_date: "2026-10-01" } });
  expect(readCsv(dir)).toBe(snap);
});

test("修改：擋掉壞資料（狀態、日期、空公司、不能改的欄位），換行變空白", async () => {
  const { apps, dir } = setup();
  const before = readCsv(dir);
  const v = (await apps.board()).version;
  const u = (changes: any) => apps.update({ index: 0, job_id: "261008-01", version: v, changes });
  await expect(u({ status: "hired" })).rejects.toThrow("狀態");
  await expect(u({ applied_date: "2026/10/01" })).rejects.toThrow("日期");
  await expect(u({ next_action_date: "2026-02-30" })).rejects.toThrow("日期");
  await expect(u({ company: "" })).rejects.toThrow("公司");
  await expect(u({ job_id: "x" })).rejects.toThrow("不能");
  await expect(u({ resume_rev: "3" })).rejects.toThrow("不能");
  expect(readCsv(dir)).toBe(before);
  await u({ notes: "第一行\n第二行" });
  expect(rowsOf(dir)[0].notes).toBe("第一行 第二行");
});

test("檔案被別人（AI）改過：拒絕寫入，不蓋掉對方的修改", async () => {
  const { apps, dir } = setup();
  const b = await apps.board();
  writeCsv(dir, readCsv(dir).replace("誠品生活", "誠品書店"));
  await expect(apps.update({ index: 0, job_id: "261008-01", version: b.version, changes: { status: "oa" } })).rejects.toThrow("剛剛被改過");
  expect(readCsv(dir)).toContain("誠品書店");
  expect(rowsOf(dir)[0].status).toBe("applied");
  const b2 = await apps.board();
  await expect(apps.update({ index: 0, job_id: "261002-01", version: b2.version, changes: { status: "oa" } })).rejects.toThrow("找不到");
  await expect(apps.update({ index: 99, version: b2.version, changes: { status: "oa" } })).rejects.toThrow("找不到");
});

test("刪除：一般的列可以刪；有投遞快照的不能刪", async () => {
  const { apps, dir } = setup();
  let b = await apps.board();
  await expect(apps.remove({ index: 2, job_id: "261005-01", version: b.version })).rejects.toThrow("不能刪");
  expect(rowsOf(dir).length).toBe(4);
  b = await apps.remove({ index: 3, job_id: "261002-01", version: b.version });
  expect(rowsOf(dir).map((r) => r.job_id)).toEqual(["261008-01", "261008-02", "261005-01"]);
  expect(b.rows.length).toBe(3);
});

test("不認得的欄位和欄位順序都保留；BOM、CRLF 保留；缺 link 欄時有網址才加在最後", async () => {
  const { apps, dir } = setup();
  writeCsv(dir, "﻿company,job_id,我的欄位,role,status,last_update\r\nA公司,a-1,自己的筆記,助理,todo,2026-10-01\r\n");
  let b = await apps.board();
  b = await apps.update({ index: 0, job_id: "a-1", version: b.version, changes: { notes: "n", status: "applied" } });
  let text = readCsv(dir);
  expect(text.startsWith("﻿company,job_id,我的欄位,role,status,last_update,applied_date,notes\r\n")).toBe(true);
  expect(text).toContain("A公司,a-1,自己的筆記,助理,applied,2026-10-09,2026-10-09,n\r\n");
  b = await apps.add({ company: "B公司", role: "專員", version: b.version });
  expect(readCsv(dir).split("\r\n")[0]).toBe("﻿company,job_id,我的欄位,role,status,last_update,applied_date,notes");
  await apps.add({ company: "C公司", role: "專員", link: "https://c.example/job", version: b.version });
  text = readCsv(dir);
  expect(text.split("\r\n")[0].endsWith(",link")).toBe(true);
  expect(text).toContain("https://c.example/job");
});

test("沒有進度表檔案時，新增會用範本的標題列建立", async () => {
  const { apps, dir } = setup();
  unlinkSync(csvPath(dir));
  const b = await apps.board();
  expect(b.rows).toEqual([]);
  await apps.add({ company: "A", role: "B", version: b.version });
  expect(readCsv(dir).split("\n")[0]).toBe(KIT_HEADER.join(","));
});

test("同時送兩個修改：依序處理，第二個因為版本過期被擋，不會互相蓋掉", async () => {
  const { apps, dir } = setup();
  const v = (await apps.board()).version;
  const r = await Promise.allSettled([
    apps.update({ index: 0, job_id: "261008-01", version: v, changes: { notes: "一" } }),
    apps.update({ index: 1, job_id: "261008-02", version: v, changes: { notes: "二" } }),
  ]);
  expect(r.map((x) => x.status)).toEqual(["fulfilled", "rejected"]);
  expect(rowsOf(dir)[0].notes).toBe("一");
});
