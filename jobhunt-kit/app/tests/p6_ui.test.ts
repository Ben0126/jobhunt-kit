// P6 (UI side): with `language: en` in jobhunt.yaml every word the local page, the board and the server say is plain English,
// the print page uses the folder's paper, and a Taiwan folder gets exactly what it got before.
// The new text tables are imported inside the tests (dynamic import) so this file also loads on the old code and fails per test there.
import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Applications, KIT_HEADER } from "../src/applications.ts";
import { Folder } from "../src/folder.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const APP = join(import.meta.dir, "..");
const SCAFFOLD_US = join(APP, "..", "jobhunt", "scaffold", "workspace-us");
const TODAY = "2026-10-09";
// Chinese / Japanese / Korean letters and the full-width punctuation block (U+30FB "・" and "，" are in it).
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
const TECH = ["yaml", "csv", "json", "target", "slug", "token", "api", "job_id"];

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

const ui = (f: string) => readFileSync(join(APP, "ui", f), "utf-8");
const src = (f: string) => readFileSync(join(APP, "src", f), "utf-8");

function csvLine(cells: Record<string, string>): string {
  return KIT_HEADER.map((k) => {
    const v = cells[k] ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

/** A copy of the US kit folder with a tracker that triggers every kind of reminder, and a resume file. */
function usFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), "jobhunt-p6-"));
  dirs.push(dir);
  cpSync(SCAFFOLD_US, dir, { recursive: true });
  const rows = [
    { job_id: "past-deadline", company: "Northfield State", role: "HR Assistant", status: "todo", next_action_date: "2026-10-01", last_update: "2026-09-30" },
    { job_id: "today-deadline", company: "Lakeside Clinic", role: "Front Desk", status: "todo", next_action_date: TODAY, last_update: "2026-10-08" },
    { job_id: "ghost-one", company: "Birchwood Bank", role: "Teller", status: "applied", applied_date: "2026-08-20", last_update: "2026-08-20" },
    { job_id: "ask-one", company: "Oak Retail", role: "Sales Associate", status: "applied", applied_date: "2026-09-27", last_update: "2026-09-27" },
    { job_id: "interview-one", company: "Pine Logistics", role: "Operations Assistant", status: "interview", next_action_date: "2026-10-05", last_update: "2026-10-01" },
    { job_id: "snap-1", company: "Cedar Foods", role: "Admin Assistant", status: "applied", applied_date: "2026-10-08", last_update: "2026-10-08" },
    { job_id: "resume-a", company: "Maple Books", role: "Library Aide", status: "todo", last_update: "2026-10-08" },
    { job_id: "dup-1", company: "Elm Co", role: "Clerk", status: "todo", last_update: "2026-10-08" },
    { job_id: "dup-1", company: "Elm Co", role: "Clerk II", status: "todo", last_update: "2026-10-08" },
  ];
  writeFileSync(join(dir, "data", "applications.csv"), [KIT_HEADER.join(","), ...rows.map(csvLine)].join("\n") + "\n");
  mkdirSync(join(dir, "submitted"), { recursive: true });
  writeFileSync(join(dir, "submitted", "snap-1.json"), "{}");
  mkdirSync(join(dir, "resumes"), { recursive: true });
  const page = "<!doctype html><html><head><title>x</title></head><body><main id=\"page\"><p>Hello</p></main></body></html>";
  for (const id of ["resume-a", "dup-1", "no-row"]) writeFileSync(join(dir, "resumes", `${id}.html`), page);
  writeFileSync(join(dir, "resume.yaml"), "basics:\n  name: Ana Rivera\n");
  mkdirSync(join(dir, "targets"), { recursive: true });
  writeFileSync(join(dir, "targets", "resume-a.yaml"), "id: resume-a\ncompany: Maple Books\n");
  return dir;
}

function serve(dir: string): Running {
  const folder = new Folder(dir);
  const s = startServer({ folder, apps: new Applications(folder, () => TODAY) });
  stops.push(s.stop);
  return s;
}

const call = (s: Running, path: string, init: RequestInit = {}, token = s.token) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, {
    ...init,
    headers: { "x-jobhunt-token": token, "content-type": "application/json", ...(init.headers || {}) },
  });
const post = (s: Running, path: string, body: unknown) => call(s, path, { method: "POST", body: JSON.stringify(body) });

/** Everything a response says, as one string (JSON keys excluded would hide nothing: values are what the user sees). */
async function said(r: Response): Promise<string> {
  return await r.text();
}

/** The language switch says "中文" on the English page on purpose: it is the one way to get the Chinese page (owner,
 * 2026-10-13: the page starts in English and can be switched to Chinese). Nothing else on the English page may be Chinese. */
const withoutLangSwitch = (html: string) => html.replace(/<button[^>]*id="lang-switch"[^>]*>[^<]*<\/button>/, "");

function noCjk(label: string, text: string) {
  text = withoutLangSwitch(text);
  const m = CJK.exec(text);
  expect(m ? `${label}: found "${text.slice(Math.max(0, m.index - 20), m.index + 20)}"` : "").toBe("");
}

// -------------------------------------------------------------- the page the server sends

test("美國資料夾（language: en）：首頁是英文頁，連到英文樣式檔", async () => {
  const s = serve(usFolder());
  for (const path of ["/", "/index.html"]) {
    const html = await (await fetch(`http://127.0.0.1:${s.port}${path}`)).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Job Search Helper");
    noCjk(path, html);
  }
  const css = await fetch(`http://127.0.0.1:${s.port}/style-en.css`);
  expect(css.status).toBe(200);
  expect(await css.text()).toContain(".problems q::before");
});

test("台灣資料夾：首頁和原來的 index.html 一個字不差", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const s = serve(dir);
  const html = await (await fetch(`http://127.0.0.1:${s.port}/`)).text();
  expect(html).toBe(ui("index.html"));
  expect(html).toContain('lang="zh-Hant-TW"');
});

test("/api/info 告訴畫面這個資料夾是哪個市場、用哪張紙", async () => {
  const us = serve(usFolder());
  expect(await (await call(us, "/api/info")).json()).toMatchObject({ market: "us", language: "en", paper: "letter" });
  const dir = copyFixture();
  dirs.push(dir);
  const tw = serve(dir);
  expect(await (await call(tw, "/api/info")).json()).toMatchObject({ market: "tw", language: "zh-TW", paper: "a4" });
});

// -------------------------------------------------------------- board, reminders, errors

test("美國看板：狀態名稱、四種提醒全是英文，而且和說明檔的名稱一致", async () => {
  const s = serve(usFolder());
  const text = await said(await call(s, "/api/applications"));
  noCjk("/api/applications", text);
  const b = JSON.parse(text);
  expect(b.statuses.map((x: any) => x.label)).toEqual(["To apply", "Applied", "Online assessment", "Interviewing", "Offer", "Rejected", "No response", "Withdrawn"]);
  expect(b.statuses.map((x: any) => x.code)).toEqual(["todo", "applied", "oa", "interview", "offer", "rejected", "ghosted", "withdrawn"]);
  const byKind = (k: string) => b.followUps.filter((f: any) => f.kind === k).map((f: any) => f.message);
  expect(byKind("deadline")).toEqual([
    'The deadline (Oct 1) has passed. If you applied, change it to "Applied". If you will not apply, change it to "Withdrawn".',
    "Today (Oct 9) is the deadline. If you want to apply, apply today.",
  ]);
  expect(byKind("ghost")[0]).toContain('change it to "No response"');
  expect(byKind("applied")[0]).toContain("No news for 12 days");
  expect(byKind("interview")[0]).toContain("The interview date (Oct 5) has passed");
});

test("台灣看板：狀態名稱和提醒和原來一字不差", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const s = serve(dir);
  const b: any = await (await call(s, "/api/applications")).json();
  expect(b.statuses.map((x: any) => x.label)).toEqual(["待投遞", "已投遞", "筆試測驗", "面試中", "錄取", "未錄取", "無回應", "放棄"]);
  const { STATUSES } = await import("../src/applications.ts");
  expect(b.statuses).toEqual(STATUSES);
});

test("美國：每一種會顯示給使用者的錯誤訊息都是英文", async () => {
  const s = serve(usFolder());
  const ver = async () => ((await (await call(s, "/api/applications")).json()) as any).version as string;
  const out: string[] = [];
  const hit = async (r: Response, status: number) => {
    expect(r.status).toBe(status);
    const t = await said(r);
    out.push(t);
    noCjk(`${r.url} ${status}`, t);
    return JSON.parse(t);
  };
  await hit(await post(s, "/api/applications/add", { company: "", role: "x", version: await ver() }), 400);
  await hit(await post(s, "/api/applications/add", { company: "x", role: "", version: await ver() }), 400);
  await hit(await post(s, "/api/applications/add", { company: "x", role: "y", link: "ftp://x", version: await ver() }), 400);
  await hit(await post(s, "/api/applications/add", { company: "Maple Books", role: "Library Aide", version: await ver() }), 400);
  const stale = "0000000000000000";
  const gone = await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: stale, changes: { notes: "x" } }), 409);
  expect(gone.error).toContain("The tracker was just changed");
  await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: await ver(), changes: { company_x: "x" } }), 400);
  await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: await ver(), changes: { company: "" } }), 400);
  await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: await ver(), changes: { role: "" } }), 400);
  await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: await ver(), changes: { status: "nope" } }), 400);
  await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: await ver(), changes: { applied_date: "2026-13-40" } }), 400);
  await hit(await post(s, "/api/applications/update", { index: 0, job_id: "past-deadline", version: await ver(), changes: { link: "nope" } }), 400);
  await hit(await post(s, "/api/applications/update", { index: 99, job_id: "x", version: await ver(), changes: {} }), 409);
  await hit(await post(s, "/api/applications/delete", { index: 5, job_id: "snap-1", version: await ver() }), 403);
  // saving a copy of a sent resume
  await hit(await post(s, "/api/archive/preview", { id: "../x" }), 404);
  await hit(await post(s, "/api/archive/preview", { id: "missing" }), 404);
  await hit(await post(s, "/api/archive/preview", { id: "no-row" }), 404);
  await hit(await post(s, "/api/archive/preview", { id: "dup-1" }), 409);
  const pv = await hit(await post(s, "/api/archive/preview", { id: "resume-a" }), 200);
  await hit(await post(s, "/api/archive", { id: "resume-a", to: "submitted/1999-01-01_resume-a.html", version: pv.version }), 409);
  await hit(await post(s, "/api/archive", { id: "resume-a", to: pv.to, version: stale }), 409);
  const ok = await hit(await post(s, "/api/archive", { id: "resume-a", to: pv.to, version: pv.version }), 200);
  noCjk("archive board", JSON.stringify(ok.board));
  const again = await hit(await post(s, "/api/archive/preview", { id: "resume-a" }), 200);
  expect(again.already).toContain("submitted/");
  await hit(await post(s, "/api/archive", { id: "resume-a", to: again.to, version: again.version }), 409);
  // a bad request, an unknown route, and a stale tab
  await hit(await call(s, "/api/nothing"), 404);
  await hit(await call(s, "/api/applications/add", { method: "POST", body: "{bad", headers: {} }), 400);
  await hit(await call(s, "/api/applications/add", { method: "POST", body: "x", headers: { "content-type": "text/plain" } }), 415);
  await hit(await call(s, "/api/applications", {}, "wrong"), 401);
  expect(out.join("\n")).toContain("close this tab");
});

test("美國：/view 的錯誤頁是英文（lang=en），也不吐中文", async () => {
  const s = serve(usFolder());
  const base = `http://127.0.0.1:${s.port}`;
  const noCookie = await fetch(`${base}/view/resume-a`);
  expect(noCookie.status).toBe(401);
  const page = await noCookie.text();
  expect(page).toContain('<html lang="en">');
  noCjk("401 page", page);
  const info = await call(s, "/api/info");
  const cookie = (info.headers.get("set-cookie") || "").split(";")[0];
  const get = (p: string, h: Record<string, string> = {}) => fetch(`${base}${p}`, { headers: { cookie, ...h } });
  const forbidden = await get("/view/resume-a", { "sec-fetch-site": "cross-site" });
  expect(forbidden.status).toBe(403);
  noCjk("403 page", await forbidden.text());
  const bad = await get("/view/.hidden");
  expect(bad.status).toBe(404);
  noCjk("404 page", await bad.text());
  const missing = await get("/view/nothing-here");
  expect(missing.status).toBe(404);
  noCjk("404 file page", await missing.text());
});

test("美國：列印頁是 Letter（有 @page letter），PDF 檔名是 Name_Resume_Company；A4 的資料夾什麼都不多加", async () => {
  const s = serve(usFolder());
  const info = await call(s, "/api/info");
  const cookie = (info.headers.get("set-cookie") || "").split(";")[0];
  const html = await (await fetch(`http://127.0.0.1:${s.port}/view/resume-a?print=1`, { headers: { cookie } })).text();
  expect(html).toContain("@page{size:letter}");
  expect(html).toContain("<title>Ana Rivera_Resume_Maple Books</title>");
  expect(html).toContain("window.print()");
  noCjk("print page", html.replace(/<title>[\s\S]*?<\/title>/, ""));

  const dir = copyFixture();
  dirs.push(dir);
  const tw = serve(dir);
  const cookie2 = ((await call(tw, "/api/info")).headers.get("set-cookie") || "").split(";")[0];
  const html2 = await (await fetch(`http://127.0.0.1:${tw.port}/view/261008-01`, { headers: { cookie: cookie2 } })).text();
  expect(html2).not.toContain("@page{size:letter}");
  // exactly what the page added before: the one <style> line, nothing after it
  expect(html2).toContain("<style>#photo-slot{display:none !important}.print-tip{display:none !important}</style></body>");
  expect(html2).toMatch(/<title>[^<]*_履歷_[^<]*<\/title>/);
});

test("language: en 搭配 paper: a4（台灣市場、英文介面）：頁面是英文，列印頁不加 letter", async () => {
  const dir = usFolder();
  writeFileSync(join(dir, "jobhunt.yaml"), "language: en\nmarket: tw\npaper: a4\n");
  const s = serve(dir);
  expect(await (await call(s, "/api/info")).json()).toMatchObject({ market: "tw", language: "en", paper: "a4" });
  const cookie = ((await call(s, "/api/info")).headers.get("set-cookie") || "").split(";")[0];
  const html = await (await fetch(`http://127.0.0.1:${s.port}/view/resume-a`, { headers: { cookie } })).text();
  expect(html).not.toContain("@page{size:letter}");
});

// -------------------------------------------------------------- text tables

type Table = Record<string, unknown>;
// Sample arguments by how many a table function takes (text in a form every function can print).
const SAMPLES: Record<number, unknown[]> = {
  0: [],
  1: ["2026-10-09 14:03"],
  2: ["2026-10-09", "X"],
  3: ["X", "Y", "Z"],
  4: [2026, 10, 15, true],
};

/** Call a table entry with sample arguments until it returns text (functions in the tables take 0 to 4 arguments). */
function render(v: unknown, args?: unknown[]): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap((x) => render(x));
  if (typeof v === "function") {
    const n = (v as Function).length;
    const mine = args ?? SAMPLES[n] ?? new Array(n).fill("X");
    return render((v as Function)(...mine));
  }
  if (v && typeof v === "object") return Object.values(v).flatMap((x) => render(x));
  return [];
}

function sameShape(zh: Table, en: Table, where: string) {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  for (const k of Object.keys(zh)) {
    expect(`${where}.${k}:${typeof en[k]}`).toBe(`${where}.${k}:${typeof zh[k]}`);
    if (typeof zh[k] === "function") expect(`${where}.${k}:${(en[k] as Function).length}`).toBe(`${where}.${k}:${(zh[k] as Function).length}`);
  }
}

test("文字表：applications 和 server 的中英文表有同樣的項目、同樣的參數個數；英文表沒有中文、沒有空字串", async () => {
  const apps = await import("../src/applications.text.ts");
  const srv = await import("../src/server.text.ts");
  for (const [name, t] of [["apps", apps.APPS_TEXT], ["server", srv.SERVER_TEXT]] as const) {
    sameShape(t["zh-TW"] as Table, t.en as Table, name);
    for (const [k, v] of Object.entries(t.en as Table)) {
      for (const s of render(v)) {
        expect(`${name}.${k}: ${s.trim() ? "text" : "EMPTY"}`).toBe(`${name}.${k}: text`);
        noCjk(`${name}.${k}`, s);
      }
    }
  }
  // the old public names still hold the Taiwan words
  const { STATUSES } = await import("../src/applications.ts");
  expect(STATUSES).toBe(apps.STATUSES_ZH);
  expect(apps.appsText("en")).toBe(apps.APPS_TEXT.en);
  expect(apps.appsText(undefined)).toBe(apps.APPS_TEXT["zh-TW"]);
});

test("followUps() 不給語言時還是中文（舊的呼叫方式不變）", async () => {
  const { followUps } = await import("../src/applications.ts");
  const rows = [{ status: "applied", company: "A", role: "B", last_update: "2026-09-01", applied_date: "2026-09-01" }];
  expect(followUps(rows, TODAY)[0].message).toBe("已經 38 天沒有消息，可能石沉大海。可以改成「無回應」，把力氣放在別的職缺。");
  expect(followUps(rows, TODAY, "en")[0].message).toContain("No news for 38 days");
});

test("英文狀態名稱和說明檔 playbooks/log-application.md 那張表逐字相同", async () => {
  const { STATUSES_EN } = await import("../src/applications.text.ts");
  const md = readFileSync(join(SCAFFOLD_US, "playbooks", "log-application.md"), "utf-8");
  const table = [...md.matchAll(/^\| ([^|]+?) \| (\w+) \|$/gm)].filter((m) => m[1] !== "Plain name (say this)");
  expect(table.length).toBe(8);
  expect(STATUSES_EN).toEqual(table.map((m) => ({ code: m[2], label: m[1] })));
});

// -------------------------------------------------------------- ui/app.js

function uiText() {
  const js = ui("app.js");
  const a = js.indexOf("// <ui-text>");
  const b = js.indexOf("// </ui-text>");
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  const block = js.slice(a, b);
  return new Function(`${block}\nreturn { TEXT, pagesFor, paperName };`)() as {
    TEXT: Record<"zh-TW" | "en", Table>;
    pagesFor: (px: number, paper: string) => number;
    paperName: (paper: string) => string;
  };
}

test("app.js 的 TEXT：中英文項目和參數個數相同；英文沒有中文、沒有空字串、沒有技術用語", () => {
  const { TEXT } = uiText();
  sameShape(TEXT["zh-TW"], TEXT.en, "TEXT");
  for (const [k, v] of Object.entries(TEXT.en)) {
    for (const s of render(v)) {
      expect(`TEXT.en.${k}: ${s.trim() ? "text" : "EMPTY"}`).toBe(`TEXT.en.${k}: text`);
      noCjk(`TEXT.en.${k}`, s);
      // whereXxx are the checker's own words, only matched against (the page shows the plain words next to them)
      if (!k.startsWith("where")) for (const w of TECH) expect(`${k}:${s.toLowerCase().includes(w)}`).toBe(`${k}:false`);
    }
  }
  // the Chinese side has to stay Chinese where it was
  expect(TEXT["zh-TW"].savePdf).toBe("存成 PDF");
  expect(TEXT["zh-TW"].added("A", "B", "待投遞")).toBe("已新增：A B（放在「待投遞」）");
});

test("英文畫面用的字和英文狀態名稱、按鈕名稱對得上", async () => {
  const { TEXT } = uiText();
  const { STATUSES_EN, STATUSES_ZH } = await import("../src/applications.text.ts");
  expect(TEXT.en.todoName).toBe(STATUSES_EN[0].label);
  expect(TEXT["zh-TW"].todoName).toBe(STATUSES_ZH[0].label);
  // START-HERE.md: the "Save as PDF" button on the resume page
  const start = readFileSync(join(SCAFFOLD_US, "START-HERE.md"), "utf-8");
  expect(start).toContain(`"${TEXT.en.savePdf}" button`);
  // the words the checker puts at the start of a "where" (and the page swaps for plain ones)
  expect([TEXT.en.whereResume, TEXT.en.whereTargets, TEXT.en.whereData]).toEqual(["Resume file", "Targets file", "Resume data"]);
});

test("美國版的列印步驟只出現 Letter，不出現 A4、台灣、照片", () => {
  const { TEXT, paperName } = uiText();
  const steps = [...render(TEXT.en.pdfChrome, [paperName("letter")]), ...render(TEXT.en.pdfSafari, [paperName("letter")]), ...render(TEXT.en.pageNote, [2, "us"])].join("\n");
  expect(steps).toContain('Paper size "Letter"');
  expect(steps).toContain('"US Letter"');
  expect(steps).toContain('"Save as PDF"');
  expect(steps).toContain('"Headers and footers"');
  for (const w of ["A4", "Taiwan", "photo"]) expect(steps).not.toContain(w);
  // Taiwan folder with English words: it still gets its own one-page tip, and A4
  expect(render(TEXT.en.pageNote, [2, "tw"]).join()).toContain("Taiwan");
  expect(render(TEXT.en.pdfChrome, [paperName("a4")]).join()).toContain('"A4"');
  // Chinese words, A4: exactly the steps the page showed before
  expect(render(TEXT["zh-TW"].pdfChrome, [paperName("a4")])).toEqual([
    "Chrome、Edge：目的地選「另存為 PDF」→ 紙張選「A4」→ 按「更多設定」，",
    "取消勾選「頁首和頁尾」",
    "→ 儲存。",
  ]);
  expect(TEXT["zh-TW"].pageNote(2, "tw")).toBe("估計會印成 2 頁。台灣的履歷最好 1 頁：可以跟 AI 說「幫我把履歷縮成一頁」。（還是可以照樣存成 PDF）");
  expect(TEXT["zh-TW"].pageNote(1, "tw")).toBe("估計會印成 1 頁。");
});

test("頁數估計：A4 和原來的算法一樣；Letter 用 0.6 吋邊界，多 1 像素以上就算第 2 頁", () => {
  const { pagesFor } = uiText();
  const a4 = ((297 - 15 * 2) * 96) / 25.4;
  const old = (c: number) => Math.max(1, Math.ceil(c / a4 - 0.02));
  for (const c of [0, 100, a4 - 5, a4, a4 + 1, a4 * 1.5, a4 * 2.01, a4 * 3])
    expect(pagesFor(c, "a4")).toBe(old(c));
  const usable = (11 - 1.2) * 96; // 940.8
  expect(pagesFor(usable, "letter")).toBe(1);
  expect(pagesFor(usable + 1, "letter")).toBe(1);
  expect(pagesFor(usable + 1.5, "letter")).toBe(2);
  expect(pagesFor(usable * 2 + 5, "letter")).toBe(3);
  // 960 px fits A4 (15 mm margins, 1009 px) but not Letter (0.6 in margins, 941 px): the two papers are not interchangeable
  expect(pagesFor(960, "a4")).toBe(1);
  expect(pagesFor(960, "letter")).toBe(2);
});

test("英文頁的靜態檢查：結構和中文頁完全一樣、沒有中文、符合內容安全規則", () => {
  const zh = ui("index.html");
  const en = ui("index-en.html");
  const shape = (html: string) =>
    [...html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)].map((m) => {
      const keep = ["id", "class", "name", "type", "data-tab", "for", "href", "src", "hidden", "required", "autocomplete", "inputmode", "role", "aria-live"];
      const attrs = [...m[2].matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)]
        .filter((a) => keep.includes(a[1]))
        .map((a) => `${a[1]}=${a[2] ?? ""}`);
      return `${m[1]} ${attrs.join(" ")}`;
    });
  // the English page starts with the 104 tab hidden (a US folder has no 104 page); everything else is the same
  expect(shape(en).filter((x) => x !== "link href=/style-en.css").map((x) => (x.startsWith("a href=#104") ? x.replace(" hidden=", "") : x))).toEqual(shape(zh));
  expect(shape(en)).toContain("link href=/style-en.css");
  noCjk("index-en.html", en);
  expect(en).toContain('<html lang="en">');
  expect(en).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(en).not.toMatch(/\sstyle=/i);
  expect(en).not.toMatch(/\son[a-z]+=/i);
  expect(en).not.toMatch(/<style/i);
  const visible = (en.match(/>([^<]+)</g) ?? []).join(" ").toLowerCase();
  for (const w of TECH) expect(`${w}:${visible.includes(w)}`).toBe(`${w}:false`);
  const css = ui("style-en.css");
  noCjk("style-en.css", css);
  expect(css).toContain('content: "Quote: \\201C"');
});

test("英文頁上的按鈕和提示，和英文程式文字裡提到的名稱一致（「Check again」「+ Add a job」「Withdrawn」…）", () => {
  const en = ui("index-en.html");
  const { TEXT } = uiText();
  expect(en).toContain(`>${TEXT.en.recheck}<`);
  expect(en).toContain(">+ Add a job<");
  expect(en).toContain('"Applied"');
  expect(en).toContain('"Withdrawn"');
  expect(TEXT.en.checking).toBe("Checking…");
});

test("程式碼裡沒有漏網的寫死中文：server.ts、applications.ts 沒有，app.js 只在 <ui-text> 區塊裡", () => {
  // Lines that are only comments, or code followed by a comment that holds the Chinese, are fine.
  const strays = (text: string) =>
    text.split("\n").flatMap((line, i) => {
      const m = CJK.exec(line);
      if (!m) return [];
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return [];
      const c = line.indexOf(" // ");
      if (c >= 0 && c < m.index) return [];
      return [`${i + 1}: ${t}`];
    });
  expect(strays(src("applications.ts"))).toEqual([]);
  expect(strays(src("server.ts"))).toEqual([]);
  const js = ui("app.js");
  const outside = js.slice(0, js.indexOf("// <ui-text>")) + js.slice(js.indexOf("// </ui-text>"));
  expect(strays(outside)).toEqual([]);
});

// ---- P6 fix round

test("wordDiff compares whole words; charDiff (Chinese) is unchanged", async () => {
  const { wordDiff, charDiff } = await import("../src/server.ts");
  const a = "Worked the register on weekends.", b = "Ran the register for 300 customers a day.";
  expect(wordDiff(a, b)).toEqual([
    { t: "del", s: "Worked " }, { t: "add", s: "Ran " }, { t: "same", s: "the register " },
    { t: "del", s: "on weekends." }, { t: "add", s: "for 300 customers a day." },
  ]);
  expect(wordDiff("same words", "same words")).toEqual([{ t: "same", s: "same words" }]);
  expect(charDiff("收銀。", "負責收銀與結帳。").length).toBe(4);
});

test("resumeInfo: an English folder gets word-level rewrites, a Taiwan folder keeps character-level ones", async () => {
  const { resumeInfo } = await import("../src/server.ts");
  const mk = (yaml: string) => {
    const dir = mkdtempSync(join(tmpdir(), "jobhunt-p6w-"));
    dirs.push(dir);
    if (yaml) writeFileSync(join(dir, "jobhunt.yaml"), yaml);
    writeFileSync(join(dir, "resume.yaml"), ["experience:", "  - id: e", "    bullets:", "      - {id: b1, text: Worked the register on weekends., source: S-001}", ""].join("\n"));
    mkdirSync(join(dir, "targets"));
    writeFileSync(join(dir, "targets", "j-1.yaml"), ["id: j-1", "bullet_overrides:", "  b1: Ran the register for 300 customers a day.", ""].join("\n"));
    return dir;
  };
  const en = await resumeInfo(new Folder(mk(["market: us", "language: en", "paper: letter", ""].join("\n"))));
  const tw = await resumeInfo(new Folder(mk("")));
  expect(en.items["j-1"].rewrites[0].parts[0]).toEqual({ t: "del", s: "Worked " });
  expect(tw.items["j-1"].rewrites[0].parts.length).toBeGreaterThan(en.items["j-1"].rewrites[0].parts.length);
});

test("English page: the 104 tab starts hidden, the Taiwan page keeps it visible; no 'Shrink', no singular-plural clash, no 'black window'", () => {
  expect(ui("index-en.html")).toMatch(/<a href="#104" data-tab="104" hidden>/);
  expect(ui("index.html")).not.toMatch(/data-tab="104"[^>]*hidden/);
  const { TEXT } = uiText();
  expect(TEXT.en.unconfirmedTail).not.toContain("them");
  expect(TEXT.en.pageNote(2, "us")).toContain("Cut my resume to one page");
  expect(TEXT.en.pageNote(2, "tw")).toContain("Cut my resume to one page");
  expect(TEXT.en.pageNote(2, "tw")).not.toContain("Shrink");
  expect(src("server.text.ts")).not.toContain("black window");
});
