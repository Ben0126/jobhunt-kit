// 履歷版本號 V<大>.<中>.<小>：規則和 D:\job-hunt／jobhunt/resume/versioning.py 一樣；投出去（存一份）才登記。
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Applications } from "../src/applications.ts";
import { docxText } from "../src/docx.ts";
import { Folder } from "../src/folder.ts";
import { fingerprint, majorOf, pickVersion, readRegistry, type RegRow, versionFor } from "../src/resumever.ts";
import { startServer } from "../src/server.ts";
import { cleanup, copyFixture, readCsv } from "./helpers.ts";
import { parseCsv, rowToObject } from "../src/csv.ts";

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
const row = (version: string, text: string, layout: string): RegRow => ({ resume: "targets/x", version, text_sha: text, layout_sha: layout, registered: "2026-10-09", commit: "" });

test("pickVersion：第一次 V1.1.0；一模一樣沿用；字變 → 中號 +1；只有排版變 → 小號 +1；每個大號各自算", () => {
  expect(pickVersion([], 1, "t1", "l1")).toEqual({ version: "V1.1.0", isNew: true });
  const h = [row("V1.1.0", "t1", "l1")];
  expect(pickVersion(h, 1, "t1", "l1")).toEqual({ version: "V1.1.0", isNew: false });
  expect(pickVersion(h, 1, "t2", "l2")).toEqual({ version: "V1.2.0", isNew: true });
  expect(pickVersion(h, 1, "t1", "l2")).toEqual({ version: "V1.1.1", isNew: true }); // same words, new layout
  const h2 = [...h, row("V1.1.1", "t1", "l2"), row("V1.2.0", "t2", "l2")];
  expect(pickVersion(h2, 1, "t1", "l1")).toEqual({ version: "V1.1.0", isNew: false }); // back to an old content: its old number
  expect(pickVersion(h2, 1, "t2", "l3")).toEqual({ version: "V1.2.1", isNew: true });
  expect(pickVersion(h2, 1, "t3", "l3")).toEqual({ version: "V1.3.0", isNew: true });
  // another line (major 2) of the same resume key starts at V2.1.0 and doesn't touch V1
  expect(pickVersion(h2, 2, "t1", "l1")).toEqual({ version: "V2.1.0", isNew: true });
  // a draft or a damaged row in the file is ignored, never crashes
  expect(pickVersion([row("V1.1.0-draft", "t1", "l1"), row("oops", "t1", "l1")], 1, "t1", "l1")).toEqual({ version: "V1.1.0", isNew: true });
});

test("majorOf：用 resume.yaml 裡那個版本的 major；沒寫就是它排第幾個；沒有這個版本就是 null", () => {
  const r = { variants: { tw: { major: 1 }, "tw-sales": { major: 3 }, en: {}, "en-ops": { title: "x" } } };
  expect(majorOf(r, "tw")).toBe(1);
  expect(majorOf(r, "tw-sales")).toBe(3);
  expect(majorOf(r, "en")).toBe(3); // no major: third in the list
  expect(majorOf(r, "en-ops")).toBe(4);
  expect(majorOf(r, "nope")).toBeNull();
  expect(majorOf(null, "tw")).toBeNull();
});

test("fingerprint：註解、程式、黃色提醒不算；字變了 text 變；只換範本 layout 變、text 不變", () => {
  const page = (body: string, style = "body{color:#000}", extra = "") =>
    `<!DOCTYPE html><html><head><title>t</title><style>${style}</style></head><body><!-- note -->${extra}<main class="page"><h1 class="name">李欣怡</h1><ul><li>${body}</li></ul></main><script>var a=1</script></body></html>`;
  const a = fingerprint(page("收銀"));
  expect(fingerprint(page("收銀", "body{color:#000}", '<div class="print-tip">按 Ctrl+P</div>'))).toEqual(a);
  expect(fingerprint(page("收銀").replace("var a=1", "var a=2")).text).toBe(a.text);
  expect(fingerprint(page("結帳")).text).not.toBe(a.text);
  const other = fingerprint(page("收銀", "body{color:#111}"));
  expect(other.text).toBe(a.text);
  expect(other.layout).not.toBe(a.layout);
  // a link is part of the words
  expect(fingerprint(page('<a href="https://a.example">作品</a>')).text).not.toBe(fingerprint(page('<a href="https://b.example">作品</a>')).text);
});

test("versionFor：沒登記過是草稿（isNew）；登記過、內容一樣就是那個號碼；沒有版本或沒有客製檔 → null", async () => {
  const d = fx();
  const f = new Folder(d);
  const html = readFileSync(join(d, "resumes", "261008-01.html"), "utf-8");
  const v = await versionFor(f, "261008-01", html);
  expect(v).toMatchObject({ version: "V1.1.0", isNew: true, major: 1 }); // the fixture's tw variant has major 1
  expect(await versionFor(f, "no-such-target", html)).toBeNull();
});

test("存一份：新版本號登記到 data/resume_versions.csv，也記在進度表的 resume_rev；內容沒變再投別家沿用同一個號", async () => {
  const d = fx();
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  let b = await apps.board();
  const p = await apps.archivePreview({ id: "261008-01" });
  expect(p.rev).toEqual({ version: "V1.1.0", isNew: true });
  expect(existsSync(join(d, "data", "resume_versions.csv"))).toBe(false); // looking registers nothing
  b = (await apps.archive({ id: "261008-01", to: "submitted/2026-10-09_261008-01.html", version: b.version })).board;
  const reg = await readRegistry(new Folder(d));
  expect(reg).toHaveLength(1);
  expect(reg[0]).toMatchObject({ resume: "targets/261008-01", version: "V1.1.0", registered: "2026-10-09", commit: "submitted/2026-10-09_261008-01.html" });
  const doc = parseCsv(readCsv(d));
  expect(rowToObject(doc.header, doc.rows[0]).resume_rev).toBe("V1.1.0");
  // after sending, the resume page shows V1.1.0 as registered (not a draft)
  expect(await versionFor(new Folder(d), "261008-01", readFileSync(join(d, "resumes", "261008-01.html"), "utf-8"))).toMatchObject({ version: "V1.1.0", isNew: false });
  // edit a word: the next number would be V1.2.0, still not registered
  const h = join(d, "resumes", "261008-01.html");
  writeFileSync(h, readFileSync(h, "utf-8").replace("收銀", "結帳"));
  expect(await versionFor(new Folder(d), "261008-01", readFileSync(h, "utf-8"))).toMatchObject({ version: "V1.2.0", isNew: true });
  expect(await readRegistry(new Folder(d))).toHaveLength(1);
});

test("/api/resume-info 帶每份履歷的版本號；Word 檔的屬性（Subject）記著版本號", async () => {
  const d = fx();
  const s = startServer({ folder: new Folder(d) });
  stops.push(s.stop);
  const base = `http://127.0.0.1:${s.port}`;
  const H = { "x-jobhunt-token": s.token };
  const info: any = await (await fetch(`${base}/api/resume-info`, { headers: H })).json();
  expect(info.items["261008-01"].rev).toEqual({ version: "V1.1.0", isNew: true });
  const cookie = ((await fetch(`${base}/api/check`, { headers: H })).headers.get("set-cookie") || "").split(";")[0];
  const r = await fetch(`${base}/view/261008-01?format=docx`, { headers: { cookie } });
  const bytes = new Uint8Array(await r.arrayBuffer());
  expect(docxText(bytes)).toContain("李欣怡");
  const { unzipEntry, zipEntries, LIMITS } = await import("../src/docx.ts");
  const core = zipEntries(bytes).find((e) => e.name === "docProps/core.xml")!;
  expect(new TextDecoder().decode(unzipEntry(bytes, core, { left: LIMITS.total }))).toContain("<dc:subject>V1.1.0-draft</dc:subject>");
});
