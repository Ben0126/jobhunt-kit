// US kit, P8 fixes. K1: every non-bullet line of linkedin.md / handshake.md is compared with resume.yaml (a headline part,
// an About opening, a Skills line, a paragraph title), not only the "• " lines. K2: resume.yaml is compared with each story's
// "Sentence at confirmation (do not change)" section. Plus "B2B" is not read as 2 billion and example.com emails are placeholders.
// The profile and the stories below are the shapes of the real P8 run folders (C-en-sales-handshake, B-zh-dig-linkedin, A-zh-oldresume).
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "../../web/js/core/rules.js";
import { parseConfirmed, runCheck, runChecks } from "../src/check.ts";
import { EN_PLACEHOLDERS, normEnglish } from "../src/english.ts";
import { Folder } from "../src/folder.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const write = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

const RESUME = `basics:
  name: Ana Ribeiro
  email: ana.ribeiro@gmail.com
  phone: ""
  location: ""
  links: []
variants:
  en: {title: English, major: 1}
sections: [summary, education, experience, projects, skills]
section_titles: {summary: Summary, education: Education, experience: Experience, projects: Projects & Activities, skills: Skills & Certifications}
summary: {en: ""}
education:
  - school: Northfield College
    degree: B.B.A. Marketing
    dates: "May 2026"
    details: []
    source: Education
    variants: [en]
experience:
  - id: s001
    org: Northfield College Bookstore
    role: Sales Associate
    dates: "Jan 2024 – May 2026"
    variants: [en]
    bullets:
      - id: s001_a
        text: Rang up sales at the register, with about 30 customers per shift.
        source: S-001
      - id: s001_b
        text: Trained 2 new student hires on the register.
        source: S-001
projects:
  - id: s003
    name: Northfield Food Drive
    dates: "Nov 2024"
    variants: [en]
    bullets:
      - id: s003_a
        text: Helped collect cans as one of the volunteers.
        source: S-003
skills:
  - {label: Software, items: [Google Sheets, Excel (basic)], sources: [S-004], variants: [en]}
  - {label: Languages, items: [Portuguese (native), English (fluent)], sources: [S-005], variants: [en]}
`;

const head = (id: string, title: string, org: string) => `---\nid: ${id}\ntitle: ${title}\ntype: job\norg: ${org}\nstatus: confirmed\nconfirmed: "2026-10-09"\nconfirmed_via: chat\nconfirmed_reply: "confirm ${id}"\n---\n\n## Your words\n\n> text\n\n## Sentence for the resume\n\nx\n\n`;

// S-001 has notes appended after the section (run B's S-002 shape), S-003 is plain, S-004 / S-005 are the Skills form
const S001 =
  head("S-001", "Bookstore sales associate", "Northfield College Bookstore") +
  `## Sentence at confirmation (do not change)\n\nTitle: Sales Associate\n1. Rang up sales at the register, with about 30 customers per shift.\n2. Trained 2 new student hires on the register.\n\nShown back in Chinese:\n1. 在收銀台結帳。\n2. 訓練 2 位新進學生員工。\n- a note added later: they asked for \"led a team\", refused\n`;
const S003 = head("S-003", "Food drive", "Northfield Food Drive") + `## Sentence at confirmation (do not change)\n\n1. Helped collect cans as one of the volunteers.\n\nShown back: their words are English, so no translation needed.\n`;
const S004 = head("S-004", "Software", "") + `## Sentence at confirmation (do not change)\n\nSoftware: Google Sheets, Excel (basic)\n\nShown back: their words are English, so no translation needed.\n`;
const S005 = head("S-005", "Languages", "") + `## Sentence at confirmation (do not change)\n\nLanguages: Portuguese (native), English (fluent)\n`;

// me/profile.md as the playbook (onboarding.md) writes it: the roles and the place of a "Looking for" sentence come from here
const PROFILE = `# Job goals\n\n## Work they want\n- Sales, retail\n- Inferred (old resume): event coordination. Not asked yet.\n\n## Location and work type\n- Columbus, OH\n\n## Education\n- Northfield College, B.B.A. Marketing, May 2026 (typed by them in English)\n- Dean's List, 2025\n`;

function usFolder(opts: { resume?: string; s001?: string } = {}): string {
  const dir = copyFixture();
  dirs.push(dir);
  const yml = readFileSync(join(dir, "jobhunt.yaml"), "utf-8");
  write(dir, "jobhunt.yaml", yml.replace(/^market:.*$/m, "market: us").replace(/^language:.*$/m, "language: en").replace(/^paper:.*$/m, "paper: letter"));
  write(dir, "resume.yaml", opts.resume ?? RESUME);
  for (const f of ["S-001", "S-002", "S-003", "S-004"]) rmSync(join(dir, "me/stories", `${f}.md`), { force: true });
  write(dir, "me/stories/S-001.md", opts.s001 ?? S001);
  write(dir, "me/stories/S-003.md", S003);
  write(dir, "me/stories/S-004.md", S004);
  write(dir, "me/stories/S-005.md", S005);
  write(dir, "me/profile.md", PROFILE);
  return dir;
}

const HEAD_LI = "# LinkedIn profile text (draft)\nUpdated: 2026-10-09\nStories used: S-001\nDraft text for you to paste yourself. Lines starting with \"- \" and \"Source:\" are notes; do not paste them.\n\n";
const HEAD_HS = HEAD_LI.replace("LinkedIn", "Handshake");

const OPENING = "B.B.A. Marketing graduate of Northfield College (May 2026). Looking for sales roles.";

/** A LinkedIn file in the shape of run C's: the pieces can be swapped to build one bypass at a time. */
function linkedin(p: { headline?: string; opening?: string; title?: string; skills?: string; extra?: string } = {}): string {
  return (
    HEAD_LI +
    `## Headline\n- Fill: paste\n\n${p.headline ?? "Seeking sales roles | B.B.A. Marketing, Northfield College | Google Sheets, Excel (basic)"}\nSource: Education, Job goals, S-004\n\n` +
    `## About\n- Fill: paste\n\n${p.opening ?? OPENING}\nSource: Education, Job goals\n\n` +
    `${p.title ?? "Sales Associate, Northfield College Bookstore"}\n• Rang up sales at the register, with about 30 customers per shift.\n• Trained 2 new student hires on the register.\n${p.extra ?? ""}Source: S-001\n\n` +
    `${p.skills ?? "Skills: Google Sheets, Excel (basic), Portuguese (native), English (fluent)"}\nSource: S-004, S-005\n\n` +
    `## Experience: Sales Associate at Northfield College Bookstore\n- Title: Sales Associate\n- Company: Northfield College Bookstore\n- Dates: Jan 2024 – May 2026\n- Fill: paste\n\n• Rang up sales at the register, with about 30 customers per shift.\n• Trained 2 new student hires on the register.\nSource: S-001\n`
  );
}

async function problemsOf(dir: string, rel: string, text: string): Promise<string[]> {
  write(dir, rel, text);
  const report = await runChecks(new Folder(dir), { ids: [], general: false });
  return [...report.profiles.flatMap((f) => f.problems), ...(report.resumeData ?? [])].map((p) => p.message);
}
const li = (dir: string, text: string) => problemsOf(dir, "profiles/linkedin.md", text);
const has = (msgs: string[], part: string) => msgs.some((m) => m.includes(part));

const HEADLINE_ONLY = HEAD_LI + "## Headline\n- Fill: paste\n\nSeeking sales roles\nSource: Job goals\n";

async function exitCode(dir: string, ...args: string[]): Promise<number> {
  return runCheck(["check", ...args], dir, () => {});
}

// ---------------------------------------------------------------- K1

test("K1：照格式寫的 LinkedIn 檔（run C 的樣子）沒有任何錯", async () => {
  const dir = usFolder();
  expect(await li(dir, linkedin())).toEqual([]);
  write(dir, "profiles/linkedin.md", linkedin());
  expect(await exitCode(dir, "--profiles")).toBe(0);
});

const BYPASSES: [string, Parameters<typeof linkedin>[0]][] = [
  ["About 開頭多一句 Fluent in Mandarin.", { opening: OPENING + " Fluent in Mandarin." }],
  ["About 開頭多一行 Led a team of student employees.", { opening: OPENING + "\nLed a team of student employees." }],
  ["Skills 行多一項 Mandarin (fluent)", { skills: "Skills: Google Sheets, Excel (basic), Mandarin (fluent)" }],
  ["Headline 多一段 Salesforce Certified Administrator", { headline: "Seeking sales roles | B.B.A. Marketing, Northfield College | Salesforce Certified Administrator" }],
  ["Headline 多一段 Restaurant Manager", { headline: "Seeking sales roles | B.B.A. Marketing, Northfield College | Restaurant Manager" }],
  ["段落標題改成 Sales Team Lead", { title: "Sales Team Lead, Northfield College Bookstore" }],
  ["段落標題只寫 Sales Team Lead", { title: "Sales Team Lead" }],
  ["經歷段落裡多一行非條列句", { extra: "Led a team of student employees.\n" }],
];
for (const [name, p] of BYPASSES)
  test(`K1：${name} → 沒通過（--profiles 結束碼 1）`, async () => {
    const dir = usFolder();
    write(dir, "profiles/linkedin.md", linkedin(p));
    expect(await exitCode(dir, "--profiles")).toBe(1);
  });

test("K1：Headline 可以把 Skills 的括號等級拿掉（Excel 對 Excel (pivot tables)），其他段落要是 resume.yaml 有的", async () => {
  const dir = usFolder();
  expect(await li(dir, linkedin({ headline: "Seeking sales roles | Sales Associate, Northfield College Bookstore | Google Sheets, Excel" }))).toEqual([]);
  expect(has(await li(dir, linkedin({ headline: "Sales roles | B.B.A. Marketing, Northfield College" })), "headline part")).toBe(true);
  expect(has(await li(dir, linkedin({ headline: "Seeking sales roles | B.B.A. Marketing, Other College" })), "headline part")).toBe(true);
});

test("K1：About 的開頭和 Skills 行：畢業句型、Looking for 句型、專長要在 resume.yaml", async () => {
  const dir = usFolder();
  // the other frame (student at ...) with the same end date is the same fact written another way; a wrong school is not
  expect(await li(dir, linkedin({ opening: "B.B.A. Marketing student at Northfield College (May 2026). Looking for sales and retail roles in Columbus, OH." }))).toEqual([]);
  expect(has(await li(dir, linkedin({ opening: "B.B.A. Marketing graduate of Other College (May 2026)." })), "fixed sentence frame")).toBe(true);
  expect(has(await li(dir, linkedin({ opening: "B.B.A. Marketing graduate of Northfield College (May 2027)." })), "fixed sentence frame")).toBe(true);
  expect(has(await li(dir, linkedin({ skills: "Skills: Google Sheets, Mandarin (fluent)" })), 'The skill "Mandarin (fluent)"')).toBe(true);
});

test("K1：Handshake 的 My Journey 也一樣；其他區塊裡多出來的非條列行也擋", async () => {
  const dir = usFolder();
  const journey = (line: string) => `${HEAD_HS}## My Journey\n- Fill: paste\n\n${line}\nSource: Education, Job goals\n`;
  expect(await problemsOf(dir, "profiles/handshake.md", journey(OPENING))).toEqual([]);
  expect(has(await problemsOf(dir, "profiles/handshake.md", journey(OPENING + " Fluent in Mandarin.")), "fixed sentence frame")).toBe(true);
  const work = (extra: string) =>
    `${HEAD_HS}## Work Experience: Sales Associate at Northfield College Bookstore\n- Title: Sales Associate\n- Company: Northfield College Bookstore\n- Fill: paste\n\n• Trained 2 new student hires on the register.\n${extra}Source: S-001\n`;
  expect(await problemsOf(dir, "profiles/handshake.md", work(""))).toEqual([]);
  expect(has(await problemsOf(dir, "profiles/handshake.md", work("Managed the whole store.\n")), "fixed sentence frame")).toBe(true);
});

// ---------------------------------------------------------------- K2

test("K2：parseConfirmed 讀到第一個不是編號句的文字就停（Shown back、後來加的備註都不算）；專長形式也讀得到", () => {
  expect(parseConfirmed(S001)).toEqual({
    title: "Sales Associate",
    sentences: ["Rang up sales at the register, with about 30 customers per shift.", "Trained 2 new student hires on the register."],
    skills: [],
  });
  expect(parseConfirmed(S004)?.skills).toEqual(["Google Sheets", "Excel (basic)"]);
  expect(parseConfirmed(S005)?.skills).toEqual(["Portuguese (native)", "English (fluent)"]);
  expect(parseConfirmed(S003)).toEqual({ title: null, sentences: ["Helped collect cans as one of the volunteers."], skills: [] });
  expect(parseConfirmed("## Your words\n> x\n")).toBeNull();
});

test("K2：resume.yaml 和確認卡一致 → 通過（卡片後面附加備註也不影響）", async () => {
  const dir = usFolder();
  const report = await runChecks(new Folder(dir), { ids: [], general: false });
  expect(report.resumeData).toEqual([]);
  expect(report.ok).toBe(true);
});

test("K2：職稱被改成 Manager（run B 的挑錯）→ 錯誤，結束碼 1", async () => {
  const dir = usFolder({ resume: RESUME.replace("role: Sales Associate", "role: Sales Manager") });
  const report = await runChecks(new Folder(dir), { ids: [], general: false });
  expect(report.ok).toBe(false);
  expect(has(report.resumeData!.map((p) => p.message), "Sales Associate")).toBe(true);
  write(dir, "profiles/linkedin.md", HEADLINE_ONLY); // a clean profile: the exit code 1 below is K2's
  expect(await exitCode(dir, "--profiles")).toBe(1);
});

test("K2：重點句被改寫、專長項目被加 → 錯誤；自己加的專長沒有在確認卡 Skills 行就擋", async () => {
  let dir = usFolder({ resume: RESUME.replace("Trained 2 new student hires on the register.", "Managed 2 new student hires on the register.") });
  let r = await runChecks(new Folder(dir), { ids: [], general: false });
  expect(has(r.resumeData!.map((p) => p.message), "Sentence at confirmation")).toBe(true);
  dir = usFolder({ resume: RESUME.replace("Excel (basic)]", "Excel (basic), Salesforce]") });
  r = await runChecks(new Folder(dir), { ids: [], general: false });
  expect(r.resumeData!.map((p) => p.quote)).toEqual(["Salesforce"]);
  write(dir, "profiles/linkedin.md", HEADLINE_ONLY);
  expect(await exitCode(dir, "--profiles")).toBe(1);
});

test("K2：自我確認的舊履歷（Skills 形式、兩張卡合成一行 skills）逐項對卡片上的文字", async () => {
  const resume = RESUME.replace(/\nskills:\n[\s\S]*$/, "\nskills:\n  - {label: Skills, items: [Excel, Google Workspace, Mandarin, English], sources: [S-004, S-005], variants: [en]}\n");
  const dir = usFolder({ resume });
  write(dir, "me/stories/S-004.md", head("S-004", "Software", "") + "## Sentence at confirmation (do not change)\n\nSkills: Excel, Google Workspace\n");
  write(dir, "me/stories/S-005.md", head("S-005", "Languages", "") + "## Sentence at confirmation (do not change)\n\nSkills: Mandarin, English\n");
  expect((await runChecks(new Folder(dir), { ids: [], general: false })).resumeData).toEqual([]);
  write(dir, "resume.yaml", resume.replace("English]", "English, Python]"));
  expect((await runChecks(new Folder(dir), { ids: [], general: false })).resumeData!.length).toBe(1);
});

test("K2：確認過的卡沒有 Sentence at confirmation 這一段 → 錯誤（不能因為讀不到就不比對）；台灣版完全不跑這個檢查", async () => {
  const dir = usFolder({ resume: RESUME.replace("role: Sales Associate", "role: Sales Manager"), s001: head("S-001", "x", "y") });
  const msgs = (await runChecks(new Folder(dir), { ids: [], general: false })).resumeData!.map((p) => p.message);
  expect(has(msgs, "S-001 is confirmed, but its file has no")).toBe(true);
  const tw = usFolder({ resume: RESUME.replace("role: Sales Associate", "role: Sales Manager") });
  write(tw, "jobhunt.yaml", "market: tw\nlanguage: zh-TW\n");
  expect((await runChecks(new Folder(tw), { ids: [], general: false })).resumeData).toBeUndefined();
  const twNoSection = usFolder({ s001: head("S-001", "x", "y") });
  write(twNoSection, "jobhunt.yaml", "market: tw\nlanguage: zh-TW\n");
  expect((await runChecks(new Folder(twNoSection), { ids: [], general: false })).resumeData).toBeUndefined();
});

// ---------------------------------------------------------------- P8-fix: the bypasses found by the reviewers (each one passed `check` before)

const rd = async (dir: string) => (await runChecks(new Folder(dir), { ids: [], general: false })).resumeData!.map((p) => p.message);
const rdOk = async (dir: string) => expect(await rd(dir)).toEqual([]);
const SEC = "## Sentence at confirmation (do not change)";

test("P8fix-1：Looking for / Seeking 的職位和地點要寫在 me/profile.md（Work they want、Location and work type），中間不能塞別的字", async () => {
  const dir = usFolder();
  const about = (line: string) => linkedin({ opening: line });
  for (const ok of [
    "Looking for sales roles.",
    "Looking for Sales and Retail roles in Columbus, OH.",
    "Looking for sales, retail roles in columbus, oh.",
    "B.B.A. Marketing graduate of Northfield College (May 2026). Looking for sales roles in Columbus, OH.",
  ])
    expect(await li(dir, about(ok)), ok).toEqual([]);
  for (const bad of [
    "Looking for sales roles in Columbus, OH, where I can use my fluent Mandarin and team leadership.", // C01
    "Looking for sales roles in Columbus, OH as a fluent Mandarin speaker with team leadership.", // C07
    "Looking for sales roles as a Fluent Mandarin speaker and former Team Lead, open to all roles.",
    "Looking for bilingual Mandarin-fluent team lead roles.",
    "Looking for Fluent in Mandarin roles.",
    "Looking for sales roles in Boston.", // a place the profile does not have
    "Looking for 5 sales roles.", // digits
    "Looking for event coordination roles.", // an "Inferred" line of the profile is not what they asked for
  ])
    expect(has(await li(dir, about(bad)), "fixed sentence frame"), bad).toBe(true);
  // Handshake My Journey: same rule (problemsOf reads every file in profiles/, so drop the LinkedIn one first)
  rmSync(join(dir, "profiles/linkedin.md"));
  const journey = (line: string) => `${HEAD_HS}## My Journey\n- Fill: paste\n\n${line}\nSource: Education, Job goals\n`;
  expect(await problemsOf(dir, "profiles/handshake.md", journey("Looking for sales roles in Columbus, OH."))).toEqual([]);
  expect(has(await problemsOf(dir, "profiles/handshake.md", journey("Looking for sales roles in Columbus, OH as a fluent Mandarin speaker with team leadership.")), "fixed sentence frame")).toBe(true);
  rmSync(join(dir, "profiles/handshake.md"));
  // the headline: split on "|" with or without spaces; the first part is Seeking <roles> roles
  const hl = (h: string) => li(dir, linkedin({ headline: h }));
  expect(await hl("Seeking sales and retail roles | B.B.A. Marketing, Northfield College")).toEqual([]);
  for (const bad of [
    "Seeking sales roles as a Fluent Mandarin speaker and former Team Lead, open to all roles | B.B.A. Marketing, Northfield College", // C02
    "Seeking sales roles|Fluent in Mandarin|Restaurant Manager roles | B.B.A. Marketing, Northfield College", // C03
    "Seeking Fluent in Mandarin roles | B.B.A. Marketing, Northfield College",
    "Seeking sales roles|Fluent in Mandarin",
  ])
    expect(has(await hl(bad), "headline part"), bad).toBe(true);
  // no "Work they want" section = nothing to check the roles against
  rmSync(join(dir, "me/profile.md"));
  expect(has(await li(dir, about("Looking for sales roles.")), "fixed sentence frame")).toBe(true);
});

test("P8fix-2：重點掛多個來源、或來源不是 S- 代號，也要和確認卡比對", async () => {
  const bullet = "Trained 2 new student hires on the register.";
  const fake = "Managed the restaurant and its staff.";
  const swap = (to: string) => RESUME.replace(`text: ${bullet}\n        source: S-001`, to);
  // legitimate: a sentence of any of the cards it names
  await rdOk(usFolder({ resume: swap(`text: ${bullet}\n        source: S-003, S-001`) }));
  // an invented sentence with two sources (K04h)
  expect(has(await rd(usFolder({ resume: swap(`text: ${fake}\n        source: S-003, S-001`) })), "Sentence at confirmation")).toBe(true);
  expect(has(await rd(usFolder({ resume: swap(`text: ${fake}\n        sources: [S-001, S-003]`) })), "Sentence at confirmation")).toBe(true);
  // a role upgrade hidden behind one multi-source bullet (K02b)
  const upgraded = swap(`text: ${bullet}\n        source: S-003, S-001`).replace("role: Sales Associate", "role: Restaurant Manager");
  expect(has(await rd(usFolder({ resume: upgraded })), "Sales Associate")).toBe(true);
  // a bullet whose source is not a card (K24)
  expect(has(await rd(usFolder({ resume: swap(`text: ${fake}\n        source: Job goals`) })), "no source starting with S-")).toBe(true);
});

test("P8fix-3：重點的來源是只有技能那一行的卡 → 錯誤（句子要在那張卡的編號原句裡）", async () => {
  const dir = usFolder({ resume: RESUME.replace("text: Trained 2 new student hires on the register.\n        source: S-001", "text: Built pivot-table dashboards for the club in Excel.\n        source: S-004") });
  expect(has(await rd(dir), "Sentence at confirmation")).toBe(true);
});

test("P8fix-4：確認段落標題被改名、或開頭多一行標籤 → 錯誤（不能因此整張卡不比對）", async () => {
  const upgraded = RESUME.replace("role: Sales Associate", "role: Restaurant Manager");
  // heading renamed
  expect(has(await rd(usFolder({ resume: upgraded, s001: S001.replace(SEC, "## Confirmed text") })), "S-001 is confirmed, but its file has no")).toBe(true);
  // a label line before Title: (K26) used to turn Title: into a "skill"
  expect(has(await rd(usFolder({ resume: upgraded, s001: S001.replace(`${SEC}\n\n`, `${SEC}\n\nConfirmed by: chat\n`) })), "is not in the exact format")).toBe(true);
  // a note between the heading and the sentences
  expect(has(await rd(usFolder({ s001: S001.replace(`${SEC}\n\nTitle`, `${SEC}\n\nNote: checked\nTitle`) })), "is not in the exact format")).toBe(true);
  // a sentence without a number
  expect(has(await rd(usFolder({ s001: S001.replace("2. Trained", "Trained") })), "is not in the exact format")).toBe(true);
  // the format as the playbook writes it still passes (CRLF too)
  await rdOk(usFolder({ s001: S001.replace(/\n/g, "\r\n") }));
  await rdOk(usFolder());
  // parseConfirmed: malformed sections are marked, a missing heading is null
  expect(parseConfirmed(S001.replace(`${SEC}\n\n`, `${SEC}\n\nConfirmed by: chat\n`))?.bad).toBe(true);
  expect(parseConfirmed(S001.replace(SEC, "## Confirmed text"))).toBeNull();
});

test("P8fix-4b：沒有重點的經歷項目也要連到確認卡；職稱要是它的卡上的 Title", async () => {
  const item = (extra: string) => `  - id: s009\n    org: Golden Dragon Restaurant\n    role: Restaurant Manager\n    dates: "2024"\n    variants: [en]\n${extra}    bullets: []\n`;
  expect(has(await rd(usFolder({ resume: RESUME.replace("projects:\n", item("") + "projects:\n") })), "not tied to any confirmed card")).toBe(true);
  expect(has(await rd(usFolder({ resume: RESUME.replace("projects:\n", item("    source: S-001\n") + "projects:\n") })), "Sales Associate")).toBe(true);
  await rdOk(usFolder({ resume: RESUME.replace("projects:\n", item("    source: S-001\n").replace("Restaurant Manager", "Sales Associate") + "projects:\n") }));
});

test("P8fix-5：專長行掛的卡有確認段落、但沒有 Skills 行 → 每一項都擋", async () => {
  const dir = usFolder({ resume: RESUME.replace("sources: [S-004]", "sources: [S-001]") });
  const r = await runChecks(new Folder(dir), { ids: [], general: false });
  expect(r.resumeData!.map((p) => p.quote)).toEqual(["Google Sheets", "Excel (basic)"]);
});

test("P8fix-6：Handshake Courses 的每一項要逐字出現在學歷 details 或某條重點", async () => {
  const resume = RESUME.replace("details: []", `details: ["Advanced Statistics", "Dean's List, 2025"]`);
  const dir = usFolder({ resume });
  write(dir, "me/profile.md", PROFILE.replace("- Dean's List, 2025", "- Dean's List, 2025\n- Advanced Statistics"));
  const courses = (items: string[]) => `${HEAD_HS}## Courses\n- Fill: paste\n\n${items.map((x) => `• ${x}`).join("\n")}\nSource: Education\n`;
  expect(await problemsOf(dir, "profiles/handshake.md", courses(["Advanced Statistics"]))).toEqual([]);
  for (const bad of ["Fluent in Mandarin", "Advanced Mandarin Interpretation"])
    expect(has(await problemsOf(dir, "profiles/handshake.md", courses(["Advanced Statistics", bad])), "course name"), bad).toBe(true);
});

test("P8fix-7：學歷 details 會印在履歷上：只有 Education 當來源的要逐字寫在 me/profile.md 的 Education；有 S- 代號的跟卡片比", async () => {
  const withDetails = (d: string) => RESUME.replace("details: []", `details: [${d}]`);
  await rdOk(usFolder({ resume: withDetails(`"Dean's List, 2025"`) }));
  expect(has(await rd(usFolder({ resume: withDetails(`"Dean's List, 2025", Fluent in Mandarin`) })), "word for word under")).toBe(true);
  // sourced by a card: the card decides
  const carded = withDetails("Fluent in Mandarin").replace("source: Education", "source: S-003");
  expect(has(await rd(usFolder({ resume: carded })), "education detail")).toBe(true);
  await rdOk(usFolder({ resume: withDetails("Helped collect cans as one of the volunteers.").replace("source: Education", "source: S-003") }));
});

test("P8fix-8：About 的職稱行要是 Source 列出的那筆經歷的職稱", async () => {
  const dir = usFolder();
  expect(has(await li(dir, linkedin({ title: "Food Drive Organizer, Northfield Food Drive" })), "fixed sentence frame")).toBe(true); // exists in no item
  // a title that exists, hung on another experience's bullets (the paragraph's Source is S-001; this title is S-003's)
  expect(has(await li(dir, linkedin({ title: "Northfield Food Drive" })), "fixed sentence frame")).toBe(true);
  expect(await li(dir, linkedin())).toEqual([]);
});

test("P8fix-9：還沒畢業（Expected）不能寫成 graduate；日期的破折號前後沒空格也認得", async () => {
  const dir = usFolder({ resume: RESUME.replace('dates: "May 2026"', 'dates: "Aug 2023–Expected Dec 2026"') });
  const open = (kind: string) => linkedin({ opening: `B.B.A. Marketing ${kind} Northfield College (Expected Dec 2026). Looking for sales roles.` });
  expect(await li(dir, open("student at"))).toEqual([]);
  expect(has(await li(dir, open("graduate of")), "fixed sentence frame")).toBe(true);
  const done = usFolder({ resume: RESUME.replace('dates: "May 2026"', 'dates: "Aug 2022–May 2026"') });
  expect(await li(done, linkedin({ opening: "B.B.A. Marketing graduate of Northfield College (May 2026). Looking for sales roles." }))).toEqual([]);
});

// ---------------------------------------------------------------- english.ts

test("B2B 不會被讀成 20 億；真的 2B 還是 20 億", () => {
  expect([...R.numbers(normEnglish("Sold B2B SaaS to 40 accounts."))]).toEqual(["40"]);
  expect([...R.numbers(normEnglish("Raised $2B."))]).toContain("2000000000");
  expect([...R.numbers(normEnglish("A 2B market."))]).toContain("2000000000");
});

test("example.com / .org / .net 的 email 算佔位字；連到 example.com 的網址、一般 email 不算", () => {
  const hits = (s: string) => EN_PLACEHOLDERS.flatMap((re) => [...s.matchAll(re)].map((m) => m[0]));
  expect(hits("Email: x@example.com")).toEqual(["x@example.com"]);
  expect(hits("jane.doe@Example.ORG and a@example.net")).toEqual(["jane.doe@Example.ORG", "a@example.net"]);
  expect(hits("See https://example.com for the team.")).toEqual([]);
  expect(hits("jane.doe@gmail.com, a@notexample.com")).toEqual([]);
});

test("example.com 的 email 出現在履歷內容裡 → check 回報佔位字", async () => {
  const dir = usFolder();
  const msgs = await li(dir, linkedin({ opening: OPENING + " Write to x@example.com." }));
  expect(has(msgs, "placeholder")).toBe(true);
});

// ---------------------------------------------------------------- M1: the tracker row the playbook adds (tailor-resume.md "Tracker row")

test("M1：進度表沒有這一筆 → 「存一份」報找不到；照 playbook 的格式加一列（todo、resume_version 指到客製履歷）→ 存得成，狀態變已投遞", async () => {
  const { Applications } = await import("../src/applications.ts");
  const { parseCsv, rowToObject } = await import("../src/csv.ts");
  const { readCsv, writeCsv } = await import("./helpers.ts");
  const d = copyFixture();
  dirs.push(d);
  writeFileSync(join(d, "resumes", "new-job.html"), readFileSync(join(d, "resumes", "261008-01.html")));
  const apps = new Applications(new Folder(d), () => "2026-10-09");
  const v0 = (await apps.board()).version;
  await expect(apps.archive({ id: "new-job", to: "submitted/2026-10-09_new-job.html", version: v0 })).rejects.toThrow("進度表裡找不到");
  // the row as tailor-resume.md writes it: job_id, company, role from jd.md, status todo, resume_version targets/<id>, the rest empty
  const csv = readCsv(d);
  const header = parseCsv(csv).header;
  const row = header.map((h) => ({ job_id: "new-job", company: "Harborview Software", role: "Sales Development Representative", status: "todo", resume_version: "targets/new-job" } as Record<string, string>)[h] ?? "");
  writeCsv(d, csv.replace(/\r?\n?$/, "\n") + row.join(",") + "\n");
  const p = await apps.archivePreview({ id: "new-job" });
  expect(p.index).toBeGreaterThanOrEqual(0);
  const res = await apps.archive({ id: "new-job", to: "submitted/2026-10-09_new-job.html", version: (await apps.board()).version });
  expect(res.saved).toBe("submitted/2026-10-09_new-job.html");
  const after = parseCsv(readCsv(d));
  const mine = after.rows.map((r) => rowToObject(after.header, r)).find((r) => r.job_id === "new-job")!;
  expect(mine).toMatchObject({ status: "applied", applied_date: "2026-10-09", resume_file: "submitted/2026-10-09_new-job.html" });
});
