// 看板提醒規則（業主 2026-10-09 決定，和業主自己的系統一致）：
//   已投遞 10 天沒更新 → 提醒；28 天 → 「可能石沉大海」；只有狀態改變才重設 last_update；
//   「待投遞」的截止日（next_action_date）今天到或已過 → 也提醒；不需要聯絡人。
import { afterEach, expect, test } from "bun:test";
import { Applications, followUps } from "../src/applications.ts";
import { parseCsv, rowToObject } from "../src/csv.ts";
import { Folder } from "../src/folder.ts";
import { cleanup, copyFixture, readCsv } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const applied = (days: string, extra: Record<string, string> = {}) => ({ status: "applied", applied_date: days, last_update: days, ...extra });

test("已投遞：9 天不提醒、10 天提醒寄信問進度（不需要聯絡人）", () => {
  const today = "2026-10-20";
  expect(followUps([applied("2026-10-11")] as any, today)).toEqual([]); // 9 天
  const f = followUps([applied("2026-10-10")] as any, today); // 10 天，沒有 contact
  expect(f.map((x) => x.kind)).toEqual(["applied"]);
  expect(f[0].message).toContain("10 天");
});

test("已投遞：27 天還是一般提醒，28 天起改成「可能石沉大海」", () => {
  const today = "2026-10-29";
  const f27 = followUps([applied("2026-10-02")] as any, today);
  expect(f27.map((x) => x.kind)).toEqual(["applied"]);
  expect(f27[0].message).not.toContain("石沉大海");
  const f28 = followUps([applied("2026-10-01")] as any, today);
  expect(f28.map((x) => x.kind)).toEqual(["ghost"]);
  expect(f28[0].message).toContain("28 天");
  expect(f28[0].message).toContain("可能石沉大海");
});

test("待投遞：截止日是今天或已經過了要提醒；明天、沒填、壞日期不提醒", () => {
  const today = "2026-10-09";
  const rows = [
    { status: "todo", company: "A", next_action_date: "2026-10-09" },
    { status: "todo", company: "B", next_action_date: "2026-10-05" },
    { status: "todo", company: "C", next_action_date: "2026-10-10" },
    { status: "todo", company: "D", next_action_date: "" },
    { status: "todo", company: "E", next_action_date: "2026-02-30" },
  ];
  const f = followUps(rows as any, today);
  expect(f.map((x) => [x.company, x.kind])).toEqual([["A", "deadline"], ["B", "deadline"]]);
  expect(f[0].message).toContain("今天");
  expect(f[1].message).toContain("10/5");
});

test("last_update 只有狀態改變才重設：只改日期（下一步日期、投遞日期）不重設", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const apps = new Applications(new Folder(dir), () => "2026-10-20");
  const rows = () => {
    const d = parseCsv(readCsv(dir));
    return d.rows.map((r) => rowToObject(d.header, r));
  };
  // 第 0 列：已投遞，applied_date = last_update = 2026-10-01
  let b = await apps.board();
  b = await apps.update({ index: 0, job_id: "261008-01", version: b.version, changes: { next_action_date: "2026-10-25" } });
  expect(rows()[0]).toMatchObject({ next_action_date: "2026-10-25", last_update: "2026-10-01" });
  b = await apps.update({ index: 0, job_id: "261008-01", version: b.version, changes: { applied_date: "2026-09-30" } });
  expect(rows()[0]).toMatchObject({ applied_date: "2026-09-30", last_update: "2026-10-01" });
  // 19 天沒消息的提醒還在（補日期沒有讓計時從頭算）
  expect(b.followUps.find((f) => f.index === 0)?.kind).toBe("applied");
  b = await apps.update({ index: 0, job_id: "261008-01", version: b.version, changes: { status: "interview" } });
  expect(rows()[0]).toMatchObject({ status: "interview", last_update: "2026-10-20" });
});
