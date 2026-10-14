// P6 (command line side): in a US folder (jobhunt.yaml language: en) every sentence the checker, the Word reader and the
// command line print is English. The folders here hold only English data, so any Chinese character in an output is a
// sentence of the program that was not translated. A Taiwan folder (and a folder the program does not recognise) keeps
// the Chinese wording.
import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck, runChecks, sectionText, summaryText } from "../src/check.ts";
import { runRead } from "../src/docx.ts";
import { Folder } from "../src/folder.ts";
import { launch } from "../src/launch.ts";
import { readMarketSync, TW_DEFAULTS } from "../src/market.ts";
import { cleanup, copyFixture, emptyTemp } from "./helpers.ts";
import { makeDocx, para } from "./ziptools.ts";

const US_KIT = join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us");
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const write = (dir: string, rel: string, text: string | Uint8Array) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
/** Every Chinese character in `text` with the text around it, so a failure says which sentence was not translated. */
const chinese = (text: string) => [...text.matchAll(/[^\n]{0,30}[⺀-鿿豈-﫿︰-﹏＀-￯]+[^\n]{0,30}/g)].map((m) => m[0]);

const RESUME = `basics:
  name: Jane Doe
  email: jane@example.com
  phone: "(555) 555-0100"
  location: "Columbus, OH"
  links: []
variants:
  en: {title: English, major: 1}
sections: [summary, education, experience, projects, skills]
section_titles: {summary: Summary, education: Education, experience: Experience, projects: Projects & Activities, skills: Skills & Certifications}
summary: {en: ""}
education:
  - school: Northfield State University
    degree: B.A. in Business Administration
    dates: "Aug 2023 – Expected May 2027"
    details: []
    source: Education
    variants: [en]
experience:
  - id: bookstore
    org: Northfield State University Bookstore
    role: Sales Associate
    dates: "Sep 2024 – May 2025"
    variants: [en]
    bullets:
      - id: bookstore_a
        text: Worked the register on weekends.
        source: S-001
      - id: bookstore_b
        text: Helped students find textbooks.
        source: S-001
projects: []
skills:
  - {label: Software, items: [Microsoft Word, "Excel (pivot tables)"], sources: [S-006], variants: [en]}
`;

const story = (id: string, title: string, org: string, status: string) => `---\nid: ${id}\ntitle: ${title}\ntype: job\norg: ${org}\nstatus: ${status}\n---\n\n## Your words\n> text\n`;

/** target files that break different rules; each is a separate job so every kind of message shows up. */
const TARGETS: Record<string, string> = {
  "260901-01": `id: wrong-id
job_id: 260901-01
base_variant: en
lang: en
template: bogus
photo: false
summary: >-
  Passionate cashier (campus) (retail) who raised 99 donations; also Draft Tutoring Center and [Company Name] and F-1 OPT.
bullet_order:
  bookstore: [bookstore_a, nope_x, bookstore_a]
bullet_overrides: {}
skills_order: ["Software: Microsoft Word, Fortran", "no colon here"]
company: Acme
role: Office Assistant
confirm: [one, two]
application_answers: {why: "Worked 12 hours at the Draft Tutoring Center."}
`,
  "260901-02": `id: 260901-02\nbase_variant: xx\ncompany: Beta\nrole: Clerk\nbullet_order: {}\nsummary: ok\nnotes: not a list\n`,
  "260901-03": `id: [unclosed\n`,
  "260901-04": `id: 260901-04\nbullet_order: {}\ncompany: Gamma\nrole: Aide\n`,
};

const BAD_HTML = `<!doctype html><html lang="en"><head><meta http-equiv="refresh" content="5"><style>p::after{content:"hi"}</style></head><body><!-->
<main><p>Totally invented sentence with 77 customers.</p><p>Source: S-001</p><img src="photo.jpg"><script src="x.js"></script><p>{{Full Name}}</p></main></body></html>`;

const HEAD = (name: string) => `# ${name} profile text (draft)\nUpdated: 2026-10-09\nStories used: S-001\nDraft text for you to paste yourself. Lines starting with "- " and "Source:" are notes; do not paste them.\n\n`;
const LI_BAD =
  "# wrong first line\n\n# Not allowed heading\n\n## Headline\n- Fill: paste\n\n" +
  "Sales roles. ".repeat(20) +
  "\nSource: Job goals\n\n## About\n- Fill: pick\n\n- a dash line\n**bold** https://x.com 😀 call 614-555-0123 or jane@example.com at 12 Main Street, plus F-1 visa\nSource: S-099\n\n" +
  "## Custom URL\n- Fill: guide\n- Suggested: bad url!\n\nSource: S-001\n\n## Skills\n- Fill: paste\n\n• Fortran\nSource: S-001\n\n## Mystery\n- Fill: paste\n\ntext\nSource: S-001\n\n## About\n- Fill: paste\n\nNo source line here and 99 invented numbers.\n";
const HS_BAD = HEAD("Handshake") + "## My Journey\n- Fill: paste\n\nCashier at Northfield State University Bookstore.\nSource: Education, Job goals\n\n## My Journey\n- Fill: paste\n\ntwice\nSource: S-001\n";

function usEnglishFolder(): string {
  const dir = emptyTemp();
  dirs.push(dir);
  cpSync(US_KIT, dir, { recursive: true });
  write(dir, "resume.yaml", RESUME);
  write(dir, "me/stories/S-001.md", story("S-001", "Sales Associate", "Northfield State University Bookstore", "confirmed"));
  write(dir, "me/stories/S-002.md", story("S-002", "Peer tutor", "Draft Tutoring Center", "draft"));
  write(dir, "me/stories/S-003.md", story("S-003", "Old job", "Deleted Diner", "deleted"));
  write(dir, "me/stories/S-006.md", story("S-006", "Software", "", "confirmed"));
  for (const [id, y] of Object.entries(TARGETS)) write(dir, `targets/${id}.yaml`, y);
  write(dir, "resumes/260901-01.html", BAD_HTML);
  write(dir, "resumes/260901-05.html", "<html><body></body></html>"); // a resume file with no targets file and no text
  write(dir, "profiles/linkedin.md", LI_BAD);
  write(dir, "profiles/handshake.md", HS_BAD);
  write(dir, "profiles/notes.md", "Some notes. SSN 123-45-6789.\n");
  write(dir, "104/履歷欄位.md", "## Intro\nI am a student who worked 55 hours.\nSource: S-001\n");
  return dir;
}

async function checkAll(dir: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCheck(["check", ...args], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

test("check in a US English folder: the screen text, the report and the checks files have no Chinese", async () => {
  const dir = usEnglishFolder();
  const folder = new Folder(dir);
  const report = await runChecks(folder, {});
  expect(report.problems).toBeGreaterThan(30); // the bad files really trigger many kinds of messages
  const r = await checkAll(dir, "--all");
  expect(r.code).toBe(1);
  const files = ["checks/260901-01.md", "checks/260901-02.md", "checks/_104.md", "checks/_profiles.md"].map((f) => {
    const t = Bun.file(join(dir, f));
    return t.text();
  });
  const written = (await Promise.all(files)).join("\n=====\n");
  // the 104 file's path is a file name the Taiwan kit fixed, not a sentence
  const everything = [JSON.stringify(report, null, 1), r.out, written].join("\n#####\n").replaceAll("104/履歷欄位.md", "104/FILE");
  expect(chinese(everything)).toEqual([]);
  // what it says, in the glossary's words (AGENTS.md "Program check")
  expect(r.out).toContain("Program check (");
  expect(r.out).toContain("failed, ");
  expect(r.out).toContain("Targets file");
  expect(r.out).toContain("Resume file");
  expect(r.out).toContain("(for the AI: ");
  expect(r.out).toContain('Quote: "');
  expect(r.out).toContain('The result was written to the "Program check" section of ');
  expect(written).toContain("## Program check");
  expect(written).toContain("- Result: failed, ");
  expect(written).toContain("### Problems to fix");
  expect(written).toContain("Job: Acme Office Assistant (id 260901-01)");
  expect(written.startsWith("# AI manual check (not the program check)")).toBe(true);
});

test("check in a US English folder: a clean folder prints All passed. and 'Result: passed'", async () => {
  const dir = emptyTemp();
  dirs.push(dir);
  cpSync(US_KIT, dir, { recursive: true });
  const r = await checkAll(dir);
  expect(r.code).toBe(0);
  expect(r.out).toContain("The folder has no resume or profile text to check yet.");
  expect(r.out).toContain("All passed.");
  expect(chinese(r.out)).toEqual([]);
});

test("check command-line errors in a US English folder are English", async () => {
  const dir = usEnglishFolder();
  const cases: [string[], string][] = [
    [["--bogus"], 'Unknown option "--bogus". Usage: check [job id ...] [--profiles] [--all]'],
    [["nope-id"], "These job ids were not found: nope-id."],
  ];
  for (const [args, expected] of cases) {
    const r = await checkAll(dir, ...args);
    expect({ args, code: r.code, has: r.out.includes(expected), cjk: chinese(r.out) }).toEqual({ args, code: 2, has: true, cjk: [] });
  }
  rmSync(join(dir, "104"), { recursive: true });
  const no104 = await checkAll(dir, "--104");
  expect({ code: no104.code, out: no104.out }).toEqual({ code: 2, out: "That option is only for the Taiwan kit folder, so nothing was checked. Usage: check [job id ...] [--profiles] [--all]" });
  rmSync(join(dir, "profiles"), { recursive: true });
  const noProf = await checkAll(dir, "--profiles");
  expect({ code: noProf.code, out: noProf.out }).toEqual({ code: 2, out: "No profile files were found (there is no .md file in profiles/)." });
  // the checks folder cannot be written: a file stands where the folder should be
  rmSync(join(dir, "checks"), { recursive: true });
  writeFileSync(join(dir, "checks"), "not a folder");
  const busy = await checkAll(dir, "260901-02");
  expect(busy.code).toBe(2);
  expect(busy.out).toContain("The check finished, but the result file could not be written");
  expect(chinese(busy.out)).toEqual([]);
});

test("a Taiwan folder, a US folder set to zh-TW, and a folder the program does not recognise keep the Chinese wording", async () => {
  const tw = copyFixture();
  dirs.push(tw);
  const r = await checkAll(tw, "no-such-id");
  expect(r.out).toContain("找不到這些職缺代號：no-such-id。");
  const us = usEnglishFolder();
  write(us, "jobhunt.yaml", "language: zh-TW\nmarket: us\npaper: letter\n");
  const r2 = await checkAll(us, "nope-id");
  expect(r2.out).toContain("找不到這些職缺代號：nope-id。");
  const nowhere = emptyTemp();
  dirs.push(nowhere);
  const r3 = await checkAll(nowhere);
  expect(r3.code).toBe(2);
  expect(r3.out).toContain("這個資料夾看起來不是求職資料夾，沒有檢查。");
});

test("sectionText and summaryText take the language apart from the market (US market in Chinese is the old wording)", async () => {
  const report = await runChecks(new Folder(usEnglishFolder()), { ids: ["260901-02"], general: false, profiles: false });
  const en = summaryText(report, ["checks/260901-02.md"], true, "en");
  expect(chinese(en)).toEqual([]);
  const zh = summaryText(report, ["checks/260901-02.md"], true);
  expect(zh).toContain("程式檢查（");
  expect(sectionText("2026-10-09 10:00", [], [], [], [], true)).toContain("- 檢查時間：2026-10-09 10:00");
  expect(sectionText("2026-10-09 10:00", [], [], [], [], true, "en")).toContain("- Checked at: 2026-10-09 10:00");
  expect(sectionText("2026-10-09 10:00", [], [], [], [], false, "en").split("\n")[0]).toBe("## Program check");
});

// ---------------------------------------------------------------- jobhunt read

function readIn(dir: string, ...args: string[]) {
  const lines: string[] = [];
  const code = runRead(["read", ...args], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

test("read in a US English folder: every message and the header are English, the ID mask is English", () => {
  const dir = usEnglishFolder();
  const CFB = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(504).fill(0)]);
  write(dir, "inbox/old.docx", makeDocx({ body: para("Jane Doe") + para("ID: A123456789") }));
  write(dir, "inbox/A123456789.pdf", "%PDF-1.7");
  write(dir, "inbox/x.pages", "x");
  write(dir, "inbox/x.txt", "x");
  write(dir, "inbox/old.doc", CFB);
  write(dir, "inbox/locked.docx", CFB);
  write(dir, "inbox/broken.docx", "not a zip");
  write(dir, "inbox/sub/.gitkeep", "");
  const outsideDir = emptyTemp();
  dirs.push(outsideDir);
  write(outsideDir, "o.docx", makeDocx({ body: para("x") }));
  const outputs = [
    readIn(dir),
    readIn(dir, "--bogus", "a.docx"),
    readIn(dir, "inbox/old.docx"),
    readIn(dir, "inbox/A123456789.pdf"),
    readIn(dir, "inbox/x.pages"),
    readIn(dir, "inbox/x.txt"),
    readIn(dir, "inbox/old.doc"),
    readIn(dir, "inbox/locked.docx"),
    readIn(dir, "inbox/broken.docx"),
    readIn(dir, "inbox/sub"),
    readIn(dir, "inbox/A123456789-missing.docx"),
    readIn(dir, join(outsideDir, "o.docx")),
  ];
  expect(outputs.map((o) => o.code)).toEqual([2, 2, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  expect(chinese(outputs.map((o) => o.out).join("\n=====\n"))).toEqual([]);
  expect(outputs[0].out).toBe(
    'Usage: jobhunt read <file>, for example .\\jobhunt.exe read inbox\\old-resume.docx (Mac: ./jobhunt-mac-arm64 read inbox/old-resume.docx). Read one file at a time. Put quotes around a file name that has spaces.',
  );
  expect(outputs[1].out.split("\n")[0]).toBe('Unknown option "--bogus".');
  expect(outputs[2].out).toBe(
    "== Text of old.docx (for the AI to read only, not saved as a file) ==\nJane Doe\nID: [ID number hidden]\n\n(1 ID number was hidden.)",
  );
  expect(outputs[10].out).toContain("[ID number hidden]-missing.docx");
});

test("read: a folder the program does not recognise, and a Taiwan folder, keep the Chinese messages", () => {
  const nowhere = emptyTemp();
  dirs.push(nowhere);
  expect(readIn(nowhere, "a.docx").out).toContain("這個資料夾看起來不是求職資料夾，沒有讀。");
  expect(readIn(nowhere).out).toContain("用法：jobhunt read <檔案>");
});

test("readMarketSync reads language, market and paper; a missing or broken jobhunt.yaml means the Taiwan defaults", () => {
  const dir = emptyTemp();
  dirs.push(dir);
  expect(readMarketSync(dir)).toEqual(TW_DEFAULTS);
  write(dir, "jobhunt.yaml", "language: en\nmarket: us\npaper: letter\n");
  expect(readMarketSync(dir)).toEqual({ market: "us", language: "en", paper: "letter" });
  write(dir, "jobhunt.yaml", "﻿market: us\n");
  expect(readMarketSync(dir)).toEqual({ market: "us", language: "en", paper: "letter" });
  write(dir, "jobhunt.yaml", "language: [unclosed");
  expect(readMarketSync(dir)).toEqual(TW_DEFAULTS);
});

// ---------------------------------------------------------------- main.ts and launch.ts

test("launch in a US English folder: started and already-running messages are English; an unrecognised folder is Chinese", async () => {
  const dir = usEnglishFolder();
  const lines: string[] = [];
  const print = (s: string) => lines.push(s);
  const first = await launch(dir, { open: false, print });
  expect(first.kind).toBe("started");
  const second = await launch(dir, { open: false, print });
  expect(second.kind).toBe("already-running");
  if (first.kind === "started") first.stop();
  expect(lines[0]).toBe("The app is ready. Open the address below in your browser. Close this window when you are done.");
  expect(lines[2]).toBe("The app is already open. Opening it in your browser again.");
  expect(chinese(lines.join("\n"))).toEqual([]);
  const nowhere = emptyTemp();
  dirs.push(nowhere);
  const out: string[] = [];
  await launch(nowhere, { open: false, print: (s) => out.push(s) });
  expect(out[0]).toBe("這個資料夾看起來不是求職資料夾，所以沒有打開介面。");
});

test("main.ts in a US English folder: an unknown command and the usage line are English", async () => {
  const dir = usEnglishFolder();
  const p = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "main.ts"), "--dir", dir, "bogus", "--no-open"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => p.kill(), 8000);
  const code = await p.exited;
  clearTimeout(timer);
  const out = await new Response(p.stdout).text();
  expect(code).toBe(2);
  expect(out).toContain('Unknown command or option "bogus".');
  expect(out).toContain("Usage: double-click to open the app.");
  expect(out).toContain('"jobhunt mode us"');
  expect(CJK.test(out)).toBe(false);
});

// ---- P6 fix round: nothing Taiwan-only (104, "Chinese or English") reaches a US English folder

const US_ONLY_FRESH = () => {
  const dir = emptyTemp();
  dirs.push(dir);
  cpSync(US_KIT, dir, { recursive: true });
  return dir;
};

test("US English folder: usage, unknown option, empty folder and --104 never mention 104", async () => {
  const dir = US_ONLY_FRESH();
  const bogus = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "main.ts"), "--dir", dir, "bogus", "--no-open"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => bogus.kill(), 8000);
  await bogus.exited;
  clearTimeout(timer);
  const usage = await new Response(bogus.stdout).text();
  const unknown = await checkAll(dir, "--bogus");
  const empty = await checkAll(dir, "x");
  const flag104 = await checkAll(dir, "--104");
  const word104 = await checkAll(dir, "_104");
  for (const o of [usage, unknown.out, empty.out, flag104.out, word104.out]) expect(o).not.toContain("104");
  expect(usage).toContain("only profile files: check --profiles");
  expect(empty.out).toContain("The folder has no targets file or resume file yet.");
  expect(flag104.code).toBe(2);
  expect(flag104.out).toBe("That option is only for the Taiwan kit folder, so nothing was checked. Usage: check [job id ...] [--profiles] [--all]");
  expect(word104.code).toBe(2);
});

test("US English folder: a targets file with no base_variant is told to write base_variant: en, not 'Chinese or English'", async () => {
  const dir = usEnglishFolder();
  const r = await checkAll(dir, "260901-04");
  expect(r.out).toContain("It does not say which version to use. Write base_variant: en");
  expect(r.out).not.toContain("Chinese");
  const file = await Bun.file(join(dir, "checks", "260901-04.md")).text();
  expect(file).not.toContain("Chinese");
  const bad = await checkAll(dir, "260901-01");
  expect(bad.out).toContain('The resume style is not valid. Use "us"');
  expect(bad.out).not.toContain('Use "us" or "en"');
});

test("check text tables: the US wording drops 104 and Chinese; the Chinese table and the Taiwan English wording keep what they had", async () => {
  const { textFor } = await import("../src/check.text.ts");
  const en = textFor("en"), zh = textFor("zh-TW");
  expect(en.tailorNoBase(true)).toBe("It does not say which version to use. Write base_variant: en");
  expect(en.tailorNoBase(false)).toBe("It does not say which version to use (Chinese or English)");
  expect(en.tailorNotInVariant(true)).toBe("A bullet in the order list does not belong to this version");
  expect(en.tailorNotInVariant(false)).toContain("(Chinese or English)");
  expect(en.unknownArg("--x", false)).toContain("[--104]");
  expect(en.idsKnown([], false)).toContain("104 cover letter");
  expect(zh.tailorNoBase(true)).toBe("沒寫要用哪一個版本（中文或英文）");
  expect(zh.unknownArg("--x", true)).toContain("[--104]");
  expect(zh.idsKnown([], true)).toContain("104 應徵信");
  expect(en.failedTotal(1)).toBe("Failed: 1 problem in total. Fix it and check again.");
  expect(en.failedTotal(2)).toBe("Failed: 2 problems in total. Fix them and check again.");
  expect(en.lineScope(true)).toContain("visa words");
  expect(en.lineScope(false)).not.toContain("visa words");
  expect(en.templateBad(true)).toBe('The resume style is not valid. Use "us"');
});

test("the make-resume playbook names the tab and status words the page shows", () => {
  const text = require("node:fs").readFileSync(join(US_KIT, "playbooks", "make-resume-file.md"), "utf-8");
  expect(text).toContain('go to its "Resumes" tab');
  expect(text).toContain("still says 'To apply', it changes to 'Applied'");
  expect(text).not.toContain("'todo'");
});
