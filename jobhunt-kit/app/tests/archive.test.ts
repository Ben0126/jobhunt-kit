// 「我投了這份，存一份」：resumes/<id>.html 複製成 submitted/<日期>_<id>.html（只複製、已存在就拒絕、絕不覆蓋），
// 並在進度表那一列記 resume_file。
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Applications } from "../src/applications.ts";
import { parseCsv, rowToObject } from "../src/csv.ts";
import { Folder } from "../src/folder.ts";
import { cleanup, copyFixture, emptyTemp, readCsv, writeCsv } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));
const fx = () => {
  const d = copyFixture();
  dirs.push(d);
  return d;
};
const rowsOf = (dir: string) => {
  const d = parseCsv(readCsv(dir));
  return d.rows.map((r) => rowToObject(d.header, r));
};

test("存檔白名單：只有 resumes/*.html → submitted/<日期>_*.html", () => {
  expect(Folder.allowed("submitted/2026-10-09_261008-01.html", "archive")).toBe(true);
  for (const p of [
    "submitted/261008-01.html", "submitted/2026-10-09_a.json", "submitted/2026-10-09_a.htm", "submitted/x/2026-10-09_a.html",
    "submitted/../AGENTS.md", "submitted/2026-10-09_..\\a.html", "submitted\\2026-10-09_a\\..\\..\\AGENTS.md", "resumes/2026-10-09_a.html", "data/applications.csv", "submitted",
  ])
    expect(Folder.allowed(p, "archive")).toBe(false);
  // 一般的寫入（會覆蓋）不能寫到 submitted/
  expect(Folder.allowed("submitted/2026-10-09_261008-01.html", "write")).toBe(false);
});

test("archiveCopy：只能從 resumes/*.html 複製；路徑把戲一律擋，不會多出檔案", async () => {
  const d = fx();
  const f = new Folder(d);
  writeFileSync(join(d, "resumes", "note.txt"), "x");
  const bad: [string, string][] = [
    ["targets/261008-01.yaml", "submitted/2026-10-09_a.html"],
    ["resumes/note.txt", "submitted/2026-10-09_note.html"],
    ["resumes/../AGENTS.md", "submitted/2026-10-09_a.html"],
    ["resumes/261008-01.html", "submitted/../resume.yaml"],
    ["resumes/261008-01.html", "submitted/2026-10-09_a.json"],
    ["resumes/261008-01.html", "../outside.html"],
    ["resumes/261008-01.html", "data/applications.csv"],
  ];
  for (const [src, dest] of bad) expect(() => f.archiveCopy(src, dest)).toThrow();
  expect(readdirSync(join(d, "submitted"))).toEqual(["261005-01_1.json"]);
  expect(existsSync(join(d, "..", "outside.html"))).toBe(false);
  // 對照：正確的路徑可以存（上面擋下來不是因為什麼都擋）
  f.archiveCopy("resumes/261008-01.html", "submitted/2026-10-09_261008-01.html");
  expect(readdirSync(join(d, "submitted"))).toEqual(["2026-10-09_261008-01.html", "261005-01_1.json"]);
});

test("archiveCopy：已經有同名檔就拒絕，原本的內容一個字都不動", async () => {
  const d = fx();
  const f = new Folder(d);
  const dest = join(d, "submitted", "2026-10-09_261008-01.html");
  writeFileSync(dest, "先存的那一份");
  expect(() => f.archiveCopy("resumes/261008-01.html", "submitted/2026-10-09_261008-01.html")).toThrow();
  expect(readFileSync(dest, "utf-8")).toBe("先存的那一份");
});

test("archiveCopy：捷徑（symlink）指到資料夾外面就擋", async () => {
  const d = fx();
  const outside = emptyTemp();
  dirs.push(outside);
  try {
    // submitted 換成指到外面的捷徑
    const { rmSync } = await import("node:fs");
    rmSync(join(d, "submitted"), { recursive: true, force: true });
    symlinkSync(outside, join(d, "submitted"), "junction");
  } catch {
    return; // 這台機器不能建捷徑就略過前提
  }
  expect(() => new Folder(d).archiveCopy("resumes/261008-01.html", "submitted/2026-10-09_261008-01.html")).toThrow();
  expect(readdirSync(outside)).toEqual([]);
});

test("預覽：說明會存成哪個檔、記在哪一列；不寫任何東西", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  const csvBefore = readCsv(d);
  const p = await apps.archivePreview({ id: "261008-01" });
  expect(p).toMatchObject({
    id: "261008-01", from: "resumes/261008-01.html", to: "submitted/2026-10-09_261008-01.html",
    company: "宏遠精密股份有限公司", role: "人資行政助理", index: 0, exists: false,
  });
  expect(readCsv(d)).toBe(csvBefore);
  expect(readdirSync(join(d, "submitted"))).toEqual(["261005-01_1.json"]);
});

test("存一份：複製檔案（內容完全相同），進度表那一列記 resume_file；其他列不動；之後這一列不能刪", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  const before = readCsv(d).split("\n");
  const b = await apps.board();
  const res = await apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: b.version });
  expect(res.saved).toBe("submitted/2026-10-09_261008-01.html");
  expect(readFileSync(join(d, "submitted", "2026-10-09_261008-01.html"))).toEqual(readFileSync(join(d, "resumes", "261008-01.html")));
  expect(rowsOf(d)[0]).toMatchObject({ job_id: "261008-01", resume_file: "submitted/2026-10-09_261008-01.html", last_update: "2026-10-01" });
  const after = readCsv(d).split("\n");
  after.forEach((line, i) => {
    if (i !== 1) expect(line).toBe(before[i]);
  });
  expect(res.board.rows[0]._deletable).toBe(false);
});

test("存一份：同一天再按一次 → 拒絕，不覆蓋；那一列已經記過 resume_file → 拒絕", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  let b = await apps.board();
  b = (await apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: b.version })).board;
  const saved = readFileSync(join(d, "submitted", "2026-10-09_261008-01.html"));
  writeFileSync(join(d, "resumes", "261008-01.html"), "<html>改過的版本</html>");
  await expect(apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: b.version })).rejects.toThrow("已經存過");
  expect(readFileSync(join(d, "submitted", "2026-10-09_261008-01.html"))).toEqual(saved);
  // 隔天也一樣：那一列已經有 resume_file
  const tomorrow = new Applications(new Folder(d), () => "2026-10-10");
  await expect(tomorrow.archive({ id: "261008-01", to: "submitted/2026-10-10_261008-01.html", version: b.version })).rejects.toThrow("已經存過");
  expect(existsSync(join(d, "submitted", "2026-10-10_261008-01.html"))).toBe(false);
});

test("存一份：檔案已經在（例如另一個視窗剛存的）→ 拒絕，進度表不動", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  writeFileSync(join(d, "submitted", "2026-10-09_261008-01.html"), "別人先存的");
  const before = readCsv(d);
  const b = await apps.board();
  await expect(apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: b.version })).rejects.toThrow("已經存過");
  expect(readFileSync(join(d, "submitted", "2026-10-09_261008-01.html"), "utf-8")).toBe("別人先存的");
  expect(readCsv(d)).toBe(before);
});

test("存一份：代號有路徑把戲、沒有履歷檔、進度表沒有這一筆、預覽過期、進度表被改過 → 拒絕，不寫任何東西", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  const before = readCsv(d);
  const v = (await apps.board()).version;
  for (const id of ["../AGENTS", "..\\AGENTS", "a\\..\\..\\x", "a/b", "a\u0000b", ".hidden", "", "x:y"])
    await expect(apps.archive({ id, to: `submitted/2026-10-09_${id}.html`, version: v })).rejects.toThrow();
  await expect(apps.archive({ id: "no-such", to: "submitted/2026-10-09_no-such.html", version: v })).rejects.toThrow("找不到這份履歷檔");
  // 有履歷檔但進度表沒有這一筆
  writeFileSync(join(d, "resumes", "lonely.html"), "<html></html>");
  await expect(apps.archive({ id: "lonely", to: "submitted/2026-10-09_lonely.html", version: v })).rejects.toThrow("進度表裡找不到");
  // 預覽是昨天看的（檔名對不上今天）
  await expect(apps.archive({ id: "261008-01", to: "submitted/2026-10-08_261008-01.html", version: v })).rejects.toThrow("再按一次");
  // 進度表被 AI 改過
  writeCsv(d, before.replace("誠品生活", "誠品書店"));
  await expect(apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: v })).rejects.toThrow("剛剛被改過");
  expect(readdirSync(join(d, "submitted"))).toEqual(["261005-01_1.json"]);
});

test("進度表的 resume_version 指到這份客製履歷也算同一筆", async () => {
  const d = fx();
  writeCsv(d, readCsv(d).replace("261008-01,宏遠", "abc,宏遠"));
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  const p = await apps.archivePreview({ id: "261008-01" });
  expect(p.index).toBe(0);
});

test("上次檔案存好了但進度表沒記上（例如 Excel 開著）：再按一次只補記，不重複存、不改檔案", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  writeFileSync(join(d, "submitted", "2026-10-09_261008-01.html"), readFileSync(join(d, "resumes", "261008-01.html")));
  const b = await apps.board();
  const res = await apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: b.version });
  expect(res.saved).toBe("submitted/2026-10-09_261008-01.html");
  expect(rowsOf(d)[0].resume_file).toBe("submitted/2026-10-09_261008-01.html");
  expect(readdirSync(join(d, "submitted"))).toEqual(["2026-10-09_261008-01.html", "261005-01_1.json"]);
});

test("存一份：那一列還是「待投遞」→ 順便改成「已投遞」，補上投遞日，重新計時；已經在後面階段的不動", async () => {
  const d = fx();
  writeFileSync(join(d, "resumes", "261008-02.html"), readFileSync(join(d, "resumes", "261008-01.html")));
  writeFileSync(join(d, "resumes", "261005-01.html"), readFileSync(join(d, "resumes", "261008-01.html")));
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  let b = await apps.board();
  b = (await apps.archive({ id: "261008-02", to: "submitted/2026-10-09_261008-02.html", version: b.version })).board;
  expect(rowsOf(d)[1]).toMatchObject({ job_id: "261008-02", status: "applied", applied_date: "2026-10-09", last_update: "2026-10-09", resume_file: "submitted/2026-10-09_261008-02.html" });
  // 面試中的那一筆存一份，狀態、日期都不動（不能往回改）
  await apps.archive({ id: "261005-01", to: "submitted/2026-10-09_261005-01.html", version: b.version });
  expect(rowsOf(d)[2]).toMatchObject({ job_id: "261005-01", status: "interview", applied_date: "2026-09-20", last_update: "2026-10-03" });
});
