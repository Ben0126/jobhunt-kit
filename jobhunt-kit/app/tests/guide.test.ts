// 「開始用」導覽頁的資料：經歷講了幾段、確認幾段、履歷有幾條、客製履歷幾份。只給數字，哪一步是「現在」由畫面決定。
import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Applications } from "../src/applications.ts";
import { Folder } from "../src/folder.ts";
import { guideInfo, startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture, emptyTemp } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

test("全新的空資料夾：全部是 0（導覽停在第 1 步）", async () => {
  const d = emptyTemp();
  dirs.push(d);
  expect(await guideInfo(new Folder(d))).toEqual({ stories: 0, confirmed: 0, drafts: 0, bullets: 0, tailored: 0 });
});

test("範例資料夾：4 段經歷（1 確認、3 草稿）、1 份客製履歷；刪掉的經歷不算", async () => {
  const d = copyFixture();
  dirs.push(d);
  const info = await guideInfo(new Folder(d));
  expect(info).toMatchObject({ stories: 4, confirmed: 1, drafts: 3, tailored: 1 });
  expect(info.bullets).toBeGreaterThan(0);
  writeFileSync(join(d, "me", "stories", "S-099.md"), "---\nid: S-099\ntitle: x\nstatus: deleted\n---\n", "utf-8");
  expect((await guideInfo(new Folder(d))).stories).toBe(4);
});

test("GET /api/guide 帶上投遞筆數", async () => {
  const d = copyFixture();
  dirs.push(d);
  const folder = new Folder(d);
  const s: Running = startServer({ folder, apps: new Applications(folder, () => "2026-10-09") });
  stops.push(s.stop);
  const r = await fetch(`http://127.0.0.1:${s.port}/api/guide`, { headers: { "x-jobhunt-token": s.token } });
  expect(r.status).toBe(200);
  const j: any = await r.json();
  expect(j).toMatchObject({ stories: 4, confirmed: 1, drafts: 3, tailored: 1 });
  expect(j.applications).toBeGreaterThan(0);
});
