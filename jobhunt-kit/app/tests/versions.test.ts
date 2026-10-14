// 履歷的各種版本預覽：通用版（還沒針對職缺）、同一份內容換範本、已投出的存檔。
import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as R from "../../web/js/core/rules.js";
import { docxText } from "../src/docx.ts";
import { runChecks } from "../src/check.ts";
import { Folder } from "../src/folder.ts";
import { renderResume } from "../src/render.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

function serve(dir = copyFixture()) {
  dirs.push(dir);
  const s: Running = startServer({ folder: new Folder(dir), dataDir: mkdtempSync(join(tmpdir(), "jobhunt-data-")) });
  stops.push(s.stop);
  const base = `http://127.0.0.1:${s.port}`;
  const H = { "x-jobhunt-token": s.token };
  const cookie = async () => ((await fetch(`${base}/api/check`, { headers: H })).headers.get("set-cookie") || "").split(";")[0];
  const view = async (path: string) => fetch(`${base}/view/${path}`, { headers: { cookie: await cookie() } });
  return { dir, s, base, H, view };
}

test("/api/versions：履歷資料的版本、這個市場能用的範本、已投出的存檔（新的在前）", async () => {
  const { dir, base, H } = serve();
  mkdirSync(join(dir, "submitted"), { recursive: true });
  writeFileSync(join(dir, "submitted", "2026-10-08_261008-01.html"), "<p>old</p>");
  writeFileSync(join(dir, "submitted", "2026-10-09_261008-01.html"), "<p>new</p>");
  writeFileSync(join(dir, "submitted", "2026-10-09_261008-01.json"), "{}");
  const r: any = await (await fetch(`${base}/api/versions`, { headers: H })).json();
  expect(r.variants.map((v: any) => v.name)).toEqual(["tw", "en"]);
  expect(r.templates.map((t: any) => t.kind)).toEqual(["tw", "tw-classic", "en"]); // no `us` in a Taiwan folder
  expect(r.templates[0].name).toBe("深色抬頭");
  expect(r.submitted.map((s: any) => s.file)).toEqual(["2026-10-09_261008-01.html", "2026-10-08_261008-01.html"]);
  expect(r.submitted[0]).toEqual({ file: "2026-10-09_261008-01.html", id: "261008-01", date: "2026-10-09" });
  expect((await fetch(`${base}/api/versions`)).status).toBe(401);
});

test("/view/_general：用 resume.yaml 排出通用版；沒有履歷檔也看得到；不帶 cookie 不給看", async () => {
  const { base, view } = serve();
  expect((await fetch(`${base}/view/_general`)).status).toBe(401);
  const r = await view("_general");
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html).toContain("李欣怡");
  expect(html).toContain("學歷");
  expect(html).toContain("OO大學");
  expect(html).toContain("<title>李欣怡_履歷</title>");
  expect(html).not.toContain("<script>alert");
  // another variant that has nothing in it is still a page (just the header)
  expect((await view("_general?variant=en")).status).toBe(200);
});

test("同一份客製內容換範本：字一樣、樣式是那個範本的；不能用這個市場沒有的範本", async () => {
  const { view } = serve();
  const classic = await (await view("261008-01?template=tw-classic")).text();
  expect(classic).toContain("中國文學系 2025-06 畢業");
  expect(classic).toContain("border: 1.1mm solid var(--accent)"); // tw-classic's own <style>
  const dark = await (await view("261008-01?template=tw")).text();
  expect(dark).toContain("中國文學系 2025-06 畢業");
  expect(dark).not.toContain("border: 1.1mm solid var(--accent)");
  expect((await view("261008-01?template=us")).status).toBe(404);
  expect((await view("261008-01?template=nope")).status).toBe(404);
  expect((await view("nope?template=tw")).status).toBe(422); // no targets file: can't be drawn
});

test("已投出的存檔：照存下來的樣子顯示；路徑把戲不行；程式還是被拿掉", async () => {
  const { dir, view } = serve();
  mkdirSync(join(dir, "submitted"), { recursive: true });
  writeFileSync(join(dir, "submitted", "2026-10-08_261008-01.html"), "<html><body><p>投出去的那份</p><script>alert(1)</script></body></html>");
  const r = await view("261008-01?submitted=2026-10-08_261008-01.html");
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html).toContain("投出去的那份");
  expect(html).not.toContain("alert(1)");
  for (const bad of ["..%2Fresume.yaml", "..%5Cresume.yaml", ".hidden.html", "x.json", "no-such.html"])
    expect([404]).toContain((await view(`261008-01?submitted=${bad}`)).status);
});

test("通用版和換範本的版本也能下載 Word", async () => {
  const { view } = serve();
  for (const q of ["_general?format=docx", "261008-01?template=tw-classic&format=docx"]) {
    const r = await view(q);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("wordprocessingml");
    expect(docxText(new Uint8Array(await r.arrayBuffer()))).toContain("李欣怡");
  }
});

test("履歷資料壞掉：說白話原因（422），不是空白頁也不是 500", async () => {
  const { dir, view } = serve();
  writeFileSync(join(dir, "resume.yaml"), "basics: [broken\n");
  const r = await view("_general");
  expect(r.status).toBe(422);
  expect(await r.text()).toContain("排不出來");
});

test("程式排出來的頁面能通過程式檢查：三個台灣範本都只印範本自己的字（除了假資料裡的 OO）", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const f = new Folder(dir);
  const resume: any = await f.readYaml("resume.yaml");
  const target: any = await f.readYaml("targets/261008-01.yaml");
  const doc = R.resolve(R.tailor(resume, target), target.base_variant);
  for (const kind of ["tw", "tw-classic", "en"] as const) {
    writeFileSync(join(dir, "resumes", "261008-01.html"), renderResume(kind, doc, { photo: false }));
    const r: any = await runChecks(f, ["261008-01"]);
    const messages: string[] = r.items[0].resumeProblems.map((p: any) => p.message);
    expect(messages, kind).toEqual(["還有佔位字「OO」，要換成真的內容"]); // the fixture's own placeholder, nothing about the layout or words
  }
});

test("美國版：通用版用 us 範本；不提供台灣的 A4 範本", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jobhunt-us-"));
  cpSync(join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us"), dir, { recursive: true });
  writeFileSync(
    join(dir, "resume.yaml"),
    [
      "basics: {name: Ana Rivera, email: ana@example.com, phone: '(555) 555-0100', location: Northfield, MN, links: [{label: LinkedIn, url: 'https://www.linkedin.com/in/ana'}]}",
      "variants: {en: {title: English}}",
      "sections: [education, skills]",
      "education: [{school: Northfield State University, degree: B.A. Business, dates: 'Sep 2023 – May 2027', variants: [en]}]",
      "skills: [{label: Software, items: [Excel, Word]}]",
    ].join("\n"),
  );
  const { base, H, view } = serve(dir);
  const v: any = await (await fetch(`${base}/api/versions`, { headers: H })).json();
  expect(v.templates.map((t: any) => t.kind)).toEqual(["en", "us"]); // the Taiwan A4 templates are not offered here
  const html = await (await view("_general")).text();
  expect(html).toContain("Ana Rivera");
  expect(html).toContain("<h2>Education</h2>");
  expect(html).toContain("linkedin.com/in/ana");
  expect(html).toContain('<span class="label">Software:</span> Excel, Word');
  expect(readFileSync(join(dir, "jobhunt.yaml"), "utf-8")).toContain("market: us");
});
