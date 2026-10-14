// 履歷檔 → 可編輯的 Word（.docx）：/view/<代號>?format=docx 和 src/wordfile.ts。
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { docxText, unzipEntry, zipEntries, LIMITS } from "../src/docx.ts";
import { Folder } from "../src/folder.ts";
import { cleanResume, startServer, type Running } from "../src/server.ts";
import { resumeToDocx } from "../src/wordfile.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

function serve(): { dir: string; s: Running; base: string } {
  const dir = copyFixture();
  dirs.push(dir);
  const s = startServer({ folder: new Folder(dir) });
  stops.push(s.stop);
  return { dir, s, base: `http://127.0.0.1:${s.port}` };
}

function part(bytes: Uint8Array, name: string): string {
  const e = zipEntries(bytes).find((x) => x.name === name)!;
  return new TextDecoder().decode(unzipEntry(bytes, e, { left: LIMITS.total }));
}

test("/view?format=docx：要 cookie；給 .docx，內容是履歷上看得到的字，沒有列印提醒、程式、照片", async () => {
  const { s, base } = serve();
  expect((await fetch(`${base}/view/261008-01?format=docx`)).status).toBe(401);
  const api = await fetch(`${base}/api/check`, { headers: { "x-jobhunt-token": s.token } });
  const cookie = (api.headers.get("set-cookie") || "").split(";")[0];
  const r = await fetch(`${base}/view/261008-01?format=docx`, { headers: { cookie } });
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("wordprocessingml.document");
  const disp = r.headers.get("content-disposition") || "";
  expect(disp).toMatch(/^attachment; filename="resume\.docx"; filename\*=UTF-8''.+\.docx$/);
  expect(decodeURIComponent(disp.split("UTF-8''")[1])).toContain("李欣怡");
  const bytes = new Uint8Array(await r.arrayBuffer());
  const text = docxText(bytes); // also checks every part's size and CRC
  expect(text).toContain("李欣怡");
  expect(text).not.toMatch(/Ctrl\+P|另存為 PDF|window\.print|photo/);
  expect((await fetch(`${base}/view/nope?format=docx`, { headers: { cookie } })).status).toBe(404);
});

test("四個範本都轉得出來：抬頭、段落標題、日期靠右、條列、專長一行一類", () => {
  const root = join(import.meta.dir, "..", "..", "jobhunt", "scaffold");
  const files: [string, "zh-TW" | "en", "a4" | "letter"][] = [
    ["workspace-general/templates/resume-tw.html", "zh-TW", "a4"],
    ["workspace-general/templates/resume-tw-classic.html", "zh-TW", "a4"],
    ["workspace-general/templates/resume-en.html", "en", "a4"],
    ["workspace-us/templates/resume-us.html", "en", "letter"],
  ];
  for (const [f, lang, paper] of files) {
    const html = cleanResume(readFileSync(join(root, f), "utf-8"));
    const bytes = resumeToDocx(html, { paper, title: "t", lang });
    const doc = part(bytes, "word/document.xml");
    expect(doc, f).toContain('w:pStyle w:val="Name"');
    expect(doc, f).toContain('w:pStyle w:val="Heading1"');
    expect(doc, f).toContain('w:pStyle w:val="EntryHead"');
    expect(doc, f).toContain("<w:tab/>"); // date pushed to the right edge
    expect(doc, f).toContain('w:pStyle w:val="Bullet"');
    expect(doc, f).toContain('w:pStyle w:val="Skill"');
    expect(doc, f).toContain(paper === "letter" ? 'w:w="12240"' : 'w:w="11906"');
    // nothing from the screen-only parts or the page script
    expect(doc, f).not.toMatch(/Ctrl\+P|Cmd\+P|function check|getElementById|DOCTYPE/i);
    // every part is well formed enough to read back
    expect(docxText(bytes).length, f).toBeGreaterThan(50);
  }
});

test("特殊字元、控制字元、<br>：XML 不會壞，空白整理乾淨", () => {
  const html =
    `<html><body><main><h1 class="name">A &amp; B &lt;C&gt;</h1><section class="block"><h2>Skills</h2>` +
    `<ul class="skills"><li><span class="label">Tools:</span>  Excel \u0001 &lt;3<br>second   line </li></ul></section></main></body></html>`;
  const bytes = resumeToDocx(html, { paper: "a4", title: 'T"&', lang: "en" });
  const doc = part(bytes, "word/document.xml");
  expect(doc).toContain("A &amp; B &lt;C&gt;");
  expect(doc).toContain("Excel &lt;3"); // control char dropped, no double space kept as text
  expect(doc).toContain("<w:br/>");
  expect(doc).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  expect(part(bytes, "docProps/core.xml")).toContain("T&quot;&amp;");
});
