// 履歷頁的補充資料：未確認的經歷、待回答的題目、改寫和原句一個字一個字比，以及「存一份」的網址。
import { afterEach, expect, test } from "bun:test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Applications } from "../src/applications.ts";
import { Folder } from "../src/folder.ts";
import { charDiff, resumeInfo, startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture, readCsv } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});
const fx = () => {
  const d = copyFixture();
  dirs.push(d);
  return d;
};

const join2 = (parts: { t: string; s: string }[], keep: string[]) => parts.filter((p) => keep.includes(p.t)).map((p) => p.s).join("");

test("一個字一個字比：拿掉 del 就是原句、拿掉 add 就是改寫；連續同類合併", () => {
  const cases: [string, string][] = [
    ["顧客的小問題先處理，大的叫主管。", "顧客的小問題自己先處理，大問題請主管處理。"],
    ["收銀。", "負責收銀與結帳。"],
    ["一樣", "一樣"],
    ["", "全部是新的"],
    ["全部拿掉", ""],
    ["表情😀符號", "表情😃符號"], // 一個表情符號是一個字，不會切壞
  ];
  for (const [a, b] of cases) {
    const d = charDiff(a, b);
    expect(join2(d, ["same", "del"])).toBe(a);
    expect(join2(d, ["same", "add"])).toBe(b);
    for (let i = 1; i < d.length; i++) expect(d[i].t).not.toBe(d[i - 1].t);
  }
  expect(charDiff("收銀。", "負責收銀與結帳。")).toEqual([
    { t: "add", s: "負責" }, { t: "same", s: "收銀" }, { t: "add", s: "與結帳" }, { t: "same", s: "。" },
  ]);
  expect(charDiff("表情😀符號", "表情😃符號")).toEqual([
    { t: "same", s: "表情" }, { t: "del", s: "😀" }, { t: "add", s: "😃" }, { t: "same", s: "符號" },
  ]);
  // 太長的不逐字比（避免卡住），整句當成換掉
  expect(charDiff("甲".repeat(2000), "乙")).toEqual([{ t: "del", s: "甲".repeat(2000) }, { t: "add", s: "乙" }]);
});

test("未確認的經歷：只算 status: draft（已確認、刪掉的不算），附上名稱", async () => {
  const d = fx();
  writeFileSync(join(d, "me", "stories", "S-005.md"), "---\nid: S-005\ntitle: 舊的\nstatus: deleted\n---\n");
  writeFileSync(join(d, "me", "stories", "S-006.md"), "---\nid: S-006\ntitle: \"壞掉的: [標題\nstatus: draft\n---\n"); // YAML 寫壞了也認得
  const info = await resumeInfo(new Folder(d));
  expect(info.drafts.map((x) => x.id)).toEqual(["S-002", "S-003", "S-004", "S-006"]);
  expect(info.drafts[0].title).toBe("系學會總務");
});

test("待回答的題目和改寫的句子：改寫對照 resume.yaml 已確認的原句；找不到原句就整句當新加的", async () => {
  const d = fx();
  const p = join(d, "targets", "261008-01.yaml");
  writeFileSync(
    p,
    readFileSync(p, "utf-8")
      .replace("bullet_overrides: {}", "bullet_overrides:\n  s001_b: 負責收銀與結帳。\n  nope: 不存在的句子")
      .replace("confirm: []", 'confirm:\n  - "第一題？"\n  - "第二題？"'),
  );
  const info = await resumeInfo(new Folder(d));
  const it = info.items["261008-01"];
  expect(it.confirm).toBe(2);
  expect(it.rewrites).toEqual([
    {
      bullet: "s001_b", before: "收銀。", after: "負責收銀與結帳。",
      parts: [{ t: "add", s: "負責" }, { t: "same", s: "收銀" }, { t: "add", s: "與結帳" }, { t: "same", s: "。" }],
    },
    { bullet: "nope", before: null, after: "不存在的句子", parts: [{ t: "add", s: "不存在的句子" }] },
  ]);
  expect(it.saved).toEqual([]);
});

function serve(dir: string, today = "2026-10-09"): Running {
  const folder = new Folder(dir);
  const s = startServer({ folder, apps: new Applications(folder, () => today) });
  stops.push(s.stop);
  return s;
}
const call = (s: Running, path: string, body?: unknown, token = s.token) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-jobhunt-token": token, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

test("介面：預覽不寫檔；確定才存；再按一次被擋；沒有通行碼一律 401", async () => {
  const d = fx();
  const s = serve(d);
  const csv0 = readCsv(d);
  expect((await call(s, "/api/archive/preview", { id: "261008-01" }, "wrong")).status).toBe(401);
  expect((await call(s, "/api/archive", { id: "261008-01" }, "wrong")).status).toBe(401);
  const pv = await call(s, "/api/archive/preview", { id: "261008-01" });
  expect(pv.status).toBe(200);
  const p: any = await pv.json();
  expect(p).toMatchObject({ to: "submitted/2026-10-09_261008-01.html", company: "宏遠精密股份有限公司", exists: false, already: "" });
  expect(readCsv(d)).toBe(csv0);
  expect(readdirSync(join(d, "submitted"))).toEqual(["261005-01_1.json"]);

  const r = await call(s, "/api/archive", { id: "261008-01", to: p.to, version: p.version });
  expect(r.status).toBe(200);
  const j: any = await r.json();
  expect(j.saved).toBe(p.to);
  expect(j.board.rows[0].resume_file).toBe(p.to);
  const again = await call(s, "/api/archive", { id: "261008-01", to: p.to, version: j.board.version });
  expect(again.status).toBe(409);
  expect(((await again.json()) as any).error).toContain("已經存過");
  const info: any = await (await call(s, "/api/resume-info")).json();
  expect(info.items["261008-01"].saved).toEqual(["2026-10-09_261008-01.html"]);
  // 路徑把戲
  const bad = await call(s, "/api/archive/preview", { id: "../AGENTS" });
  expect(bad.status).toBe(404);
});
