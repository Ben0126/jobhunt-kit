// US kit, phase P4: profiles/linkedin.md and profiles/handshake.md are checked against the format in
// playbooks/linkedin-profile.md and handshake-profile.md (§1): block names, Source lines, numbers, limits
// (official = error, third-party = warning), bullets word for word from resume.yaml. Plus `check --profiles` and the
// English source words Education / Job goals. The Taiwan folder is checked to stay as it was.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allIds, runCheck, runChecks } from "../src/check.ts";
import { splitSources } from "../src/blocks104.ts";
import { Folder } from "../src/folder.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const US_KIT = join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf-8");
const write = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

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
    details: ["Coursework in accounting and statistics."]
    source: Education
    variants: [en]
experience:
  - id: bookstore
    org: Northfield State University Bookstore
    role: Sales Associate
    location: Columbus, OH
    dates: "Sep 2024 – May 2025"
    variants: [en]
    bullets:
      - id: bookstore_a
        text: Worked the register on weekends.
        source: S-001
      - id: bookstore_b
        text: Taught about 5 new employees to use the register at the manager's request.
        source: S-001
      - id: bookstore_c
        text: Helped students find textbooks.
        source: S-001
  - id: food_drive
    org: Campus Food Drive Club
    role: Treasurer
    dates: "2025"
    variants: [en]
    bullets:
      - id: food_drive_a
        text: Sorted donations with a team of volunteers.
        source: S-004
projects: []
skills:
  - {label: Software, items: [Microsoft Word, "Excel (pivot tables)"], sources: [S-006], variants: [en]}
`;

// P8-fix: a confirmed card has the "Sentence at confirmation" section (the program now compares resume.yaml with it, and a missing section is an error)
const story = (id: string, title: string, org: string, status: string, conf = "") =>
  `---\nid: ${id}\ntitle: ${title}\ntype: job\norg: ${org}\nstatus: ${status}\n---\n\n## Your words\n> text\n` + (conf ? `\n## Sentence at confirmation (do not change)\n\n${conf}\n` : "");

/** A US folder with an English resume.yaml (the playbook examples' people) and stories S-001/S-004/S-006 confirmed, S-002 a draft. */
function usFolder(): string {
  const dir = copyFixture();
  dirs.push(dir);
  write(dir, "jobhunt.yaml", read(dir, "jobhunt.yaml").replace(/^market:.*$/m, "market: us").replace(/^language:.*$/m, "language: en").replace(/^paper:.*$/m, "paper: letter"));
  write(dir, "resume.yaml", RESUME);
  for (const f of ["S-001", "S-002", "S-003", "S-004"]) rmSync(join(dir, "me/stories", `${f}.md`));
  write(dir, "me/stories/S-001.md", story("S-001", "Sales Associate", "Northfield State University Bookstore", "confirmed", "Title: Sales Associate\n1. Worked the register on weekends.\n2. Taught about 5 new employees to use the register at the manager's request.\n3. Helped students find textbooks."));
  write(dir, "me/profile.md", "# Job goals\n\n## Work they want\n- Sales, administrative assistant, HR assistant\n\n## Location and work type\n- Columbus, OH\n\n## Education\n- Northfield State University, B.A. in Business Administration, Expected May 2027\n- Coursework in accounting and statistics.\n");
  write(dir, "me/stories/S-004.md", story("S-004", "Treasurer", "Campus Food Drive Club", "confirmed", "Title: Treasurer\n1. Sorted donations with a team of volunteers."));
  write(dir, "me/stories/S-006.md", story("S-006", "Software", "", "confirmed", "Software: Microsoft Word, Excel (pivot tables)"));
  write(dir, "me/stories/S-002.md", story("S-002", "Peer tutor", "Draft Tutoring Center", "draft"));
  return dir;
}

// a "Seeking <roles> roles" headline of exactly n characters: the roles are "sales and sales ..." (each one is written in the profile), padded with spaces
const seekLine = (n: number) => {
  const base = "Seeking sales" + " and sales".repeat(Math.floor((n - 19) / 10));
  return base + " ".repeat(n - 6 - base.length) + " roles";
};

const HEAD_LI = "# LinkedIn profile text (draft)\nUpdated: 2026-10-09\nStories used: S-001\nDraft text for you to paste yourself. Lines starting with \"- \" and \"Source:\" are notes; do not paste them.\n\n";
const HEAD_HS = HEAD_LI.replace("LinkedIn", "Handshake");

type Result = { errors: string[]; warnings: string[]; ok: boolean };

async function profile(dir: string, file: "linkedin" | "handshake", text: string): Promise<Result> {
  write(dir, `profiles/${file}.md`, text);
  const report = await runChecks(new Folder(dir), { ids: [], general: false });
  const f = report.profiles.find((p) => p.file === `profiles/${file}.md`)!;
  return { errors: f.problems.map((p) => p.message), warnings: f.warnings.map((p) => p.message), ok: report.ok };
}
const li = (dir: string, body: string) => profile(dir, "linkedin", HEAD_LI + body);
const hs = (dir: string, body: string) => profile(dir, "handshake", HEAD_HS + body);
const has = (msgs: string[], part: string) => msgs.some((m) => m.includes(part));

async function cli(dir: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCheck(["check", ...args], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

const ABOUT_OK = "## About\n- Fill: paste\n\nB.A. in Business Administration student at Northfield State University (Expected May 2027). Looking for administrative assistant roles in Columbus, OH.\nSource: Education, Job goals\n";

// ---------------------------------------------------------------- the playbooks' own examples

function example(playbook: string): string {
  const t = readFileSync(join(US_KIT, "playbooks", playbook), "utf-8");
  return /```\n(# [A-Za-z]+ profile text[\s\S]*?)\n```/.exec(t)![1] + "\n";
}

test("playbook 的範例檔（LinkedIn、Handshake）照格式檢查是全過、沒有提醒", async () => {
  const dir = usFolder();
  const a = await profile(dir, "linkedin", example("linkedin-profile.md"));
  expect(a.errors).toEqual([]);
  expect(a.warnings).toEqual([]);
  const b = await profile(dir, "handshake", example("handshake-profile.md"));
  expect(b.errors).toEqual([]);
  expect(b.warnings).toEqual([]);
});

// ---------------------------------------------------------------- English source words

test("來源行：splitSources 英文版用逗號分，Job goals 不被切成兩個；台灣版照舊用空白分", () => {
  expect(splitSources("Education, Job goals, S-006", true)).toEqual(["Education", "Job goals", "S-006"]);
  expect(splitSources("S-001 S-002", true)).toEqual(["S-001", "S-002"]);
  expect(splitSources("Job goals", true)).toEqual(["Job goals"]);
  expect(splitSources("S-001 S-002")).toEqual(["S-001", "S-002"]);
  expect(splitSources("學歷、求職方向 S-003")).toEqual(["學歷", "求職方向", "S-003"]);
});

test("來源詞：美國版接受 Education、Job goals（大小寫要一樣）；台灣版還是只認學歷、求職方向", async () => {
  const body = (src: string) => `## 自傳\n- 上限：4000 字\n- 怎麼填：貼上\n\n我在好市多收銀。\nSource: ${src}\n`;
  for (const [us, ok] of [[true, true], [false, false]] as const) {
    const dir = usFolder();
    if (!us) write(dir, "jobhunt.yaml", read(dir, "jobhunt.yaml").replace("market: us", "market: tw"));
    write(dir, "104/履歷欄位.md", body("Education, Job goals"));
    const probs = (await runChecks(new Folder(dir), { ids: [], general: true })).general!.blocks.flatMap((b) => b.problems);
    expect(probs.filter((p) => p.message.includes("The source says")).length > 0).toBe(!ok);
  }
  const dir = usFolder();
  write(dir, "104/履歷欄位.md", body("job goals, education"));
  const probs = (await runChecks(new Folder(dir), { ids: [], general: true })).general!.blocks.flatMap((b) => b.problems);
  expect(probs.filter((p) => p.message.includes("The source says")).length).toBe(2); // wrong case is still refused
});

// ---------------------------------------------------------------- structure

test("結構：第一行標題、區塊名稱、不能有 # ／ ### 標題、Fill、重複的區塊", async () => {
  const dir = usFolder();
  expect((await li(dir, ABOUT_OK)).errors).toEqual([]);

  const noHeader = await profile(dir, "linkedin", ABOUT_OK);
  expect(has(noHeader.errors, "The first line must be")).toBe(true);

  const wrongName = await hs(dir, ABOUT_OK); // About is a LinkedIn block, not a Handshake one
  expect(has(wrongName.errors, "Unknown section name")).toBe(true);
  const lower = await li(dir, ABOUT_OK.replace("## About", "## about"));
  expect(has(lower.errors, "Unknown section name")).toBe(true);

  const dup = await li(dir, ABOUT_OK + "\n" + ABOUT_OK);
  expect(has(dup.errors, "can only appear once")).toBe(true);

  const h3 = await li(dir, ABOUT_OK + "\n### Extra\nSomething.\n");
  expect(has(h3.errors, "Do not use # or ### headings")).toBe(true);
  const h1 = await li(dir, ABOUT_OK + "\n# Another title\n");
  expect(has(h1.errors, "Do not use # or ### headings")).toBe(true);

  const fill = await li(dir, ABOUT_OK.replace("- Fill: paste", "- Fill: guide"));
  expect(has(fill.errors, "Fill")).toBe(true);
  const noFill = await li(dir, ABOUT_OK.replace("- Fill: paste\n", ""));
  expect(has(noFill.errors, "Fill")).toBe(true);
  const badKey = await li(dir, ABOUT_OK.replace("- Fill: paste", "- fill: paste"));
  expect(badKey.errors.length).toBeGreaterThan(0);

  const twoExp = await li(
    dir,
    "## Experience: A\n- Title: Sales Associate\n- Company: Northfield State University Bookstore\n- Fill: paste\n\n• Worked the register on weekends.\nSource: S-001\n\n## Experience: B\n- Title: Sales Associate\n- Company: Northfield State University Bookstore\n- Fill: paste\n\n• Helped students find textbooks.\nSource: S-001\n",
  );
  expect(twoExp.errors).toEqual([]); // "repeat" blocks may repeat
});

// ---------------------------------------------------------------- sources

test("來源行：每一段都要有；草稿、刪掉、不存在的故事、work-auth 都不行；Education／Job goals 可以", async () => {
  const dir = usFolder();
  const exp = (src: string | null) =>
    `## Experience: Sales Associate\n- Title: Sales Associate\n- Company: Northfield State University Bookstore\n- Fill: paste\n\n• Worked the register on weekends.${src == null ? "" : `\nSource: ${src}`}\n`;
  expect((await li(dir, exp("S-001"))).errors).toEqual([]);
  expect(has((await li(dir, exp(null))).errors, "Source:")).toBe(true);
  expect(has((await li(dir, exp("S-002"))).errors, "is still a draft")).toBe(true);
  expect(has((await li(dir, exp("S-099"))).errors, "no experience with that id")).toBe(true);
  expect(has((await li(dir, exp("work-auth"))).errors, "A source can only be")).toBe(true);
  expect(has((await li(dir, exp("S-001, work-auth"))).errors, "A source can only be")).toBe(true);
  const second = await li(dir, ABOUT_OK + "\nAnother paragraph with no source line.\n");
  expect(has(second.errors, "Source:")).toBe(true);
  // an empty block still needs its Source line
  const edu = "## Education: Northfield State University\n- School: Northfield State University\n- Degree: B.A. in Business Administration\n- Dates: Aug 2023 – Expected May 2027\n- Fill: paste\n\n";
  expect((await li(dir, edu + "Source: Education\n")).errors).toEqual([]);
  expect(has((await li(dir, edu)).errors, "Source:")).toBe(true);
});

test("只寫 Education／Job goals 的一段，不能提到經歷（工作、社團）", async () => {
  const dir = usFolder();
  const r = await li(dir, "## About\n- Fill: paste\n\nB.A. student who also served as Treasurer of Campus Food Drive Club.\nSource: Education, Job goals\n");
  expect(has(r.errors, "Campus Food Drive Club")).toBe(true);
  // P8: a free sentence is not allowed in a paragraph that has a story source; the work goes in as the title line of its own paragraph
  const ok = await li(dir, "## About\n- Fill: paste\n\nTreasurer, Campus Food Drive Club\n• Sorted donations with a team of volunteers.\nSource: S-004\n");
  expect(ok.errors).toEqual([]);
});

test("提到還沒確認的經歷（S-002 草稿）：就算來源行寫別的也擋", async () => {
  const dir = usFolder();
  const r = await li(dir, "## About\n- Fill: paste\n\nWorked at Draft Tutoring Center.\nSource: S-001\n");
  expect(has(r.errors, "Draft Tutoring Center")).toBe(true);
});

// ---------------------------------------------------------------- numbers and dates

test("數字和日期：段落裡的數字要是本人說過的；N+ 只有本人說過「超過 N」才行；日期要和 resume.yaml 一樣", async () => {
  const dir = usFolder();
  const about = (s: string) => `## About\n- Fill: paste\n\n${s}\nSource: S-001\n`;
  // P8: a free sentence in About is now an error of its own (not a fixed frame); the number rules below are what this test is about
  expect(has((await li(dir, about("Trained about 5 new employees."))).errors, "not in your confirmed experience")).toBe(false);
  expect(has((await li(dir, about("Served 300 customers a day."))).errors, "not in your confirmed experience")).toBe(true);
  expect(has((await li(dir, about("Trained 5+ new employees."))).errors, "more than")).toBe(true);
  expect(has((await li(dir, about("Worked there since Jun 2019."))).errors, "The date")).toBe(true);
  const exp = (dates: string) => `## Experience: Sales Associate\n- Title: Sales Associate\n- Company: Northfield State University Bookstore\n- Dates: ${dates}\n- Fill: paste\n\n• Worked the register on weekends.\nSource: S-001\n`;
  expect((await li(dir, exp("Sep 2024 – May 2025"))).errors).toEqual([]);
  expect(has((await li(dir, exp("Sep 2022 – May 2025"))).errors, "The date")).toBe(true);
});

// ---------------------------------------------------------------- limits

test("字數上限：第三方來源的上限只提醒（程式還是通過）；LinkedIn 技能 100 項是官方的，超過就沒通過", async () => {
  const dir = usFolder();
  const head = (n: number) => `## Headline\n- Fill: paste\n\n${seekLine(n)}\nSource: Job goals\n`; // P8: a headline starts "Seeking ... roles"
  const ok = await li(dir, head(220));
  expect(ok.errors).toEqual([]);
  expect(ok.warnings).toEqual([]);
  const over = await li(dir, head(222));
  expect(over.errors).toEqual([]);
  expect(has(over.warnings, "over the limit of 220")).toBe(true);
  expect(over.ok).toBe(true);

  const small = await li(dir, head(150).replace("- Fill: paste", "- Limit: 100 characters\n- Fill: paste")); // the user's own, smaller number wins
  expect(has(small.warnings, "over the limit of 100")).toBe(true);
  const big = await li(dir, head(222).replace("- Fill: paste", "- Limit: 5000 characters\n- Fill: paste")); // a bigger number never lets it through
  expect(has(big.warnings, "over the limit of 220")).toBe(true);

  const journey = (n: number) => `## My Journey\n- Fill: paste\n\n${"B.A. student looking for sales roles. ".repeat(20).slice(0, n)}\nSource: Education, Job goals\n`;
  expect((await hs(dir, journey(300))).warnings).toEqual([]);
  expect(has((await hs(dir, journey(301))).warnings, "over the limit of 300")).toBe(true);

  const aboutLong = `## About\n- Fill: paste\n\n${"Looking for sales roles. ".repeat(110).slice(0, 2601)}\nSource: Job goals\n`;
  expect(has((await li(dir, aboutLong)).warnings, "over the limit of 2,600")).toBe(true);

  const title = "T".repeat(101);
  const exp = `## Experience: Long\n- Title: ${title}\n- Company: Northfield State University Bookstore\n- Fill: paste\n\n• Worked the register on weekends.\nSource: S-001\n`;
  const e = await li(dir, exp);
  expect(has(e.warnings, "Title")).toBe(true);
  expect(has(e.errors, "over the limit")).toBe(false); // (the long Title is not a resume.yaml role: that is its own, separate error)

  const skills = (n: number) => `## Skills\n- Fill: paste\n\n${Array.from({ length: n }, (_, i) => (i === 0 ? "• Microsoft Word" : `• Excel (pivot tables)`)).join("\n")}\nSource: S-006\n`;
  expect((await li(dir, skills(100))).errors).toEqual([]);
  const s101 = await li(dir, skills(101));
  expect(has(s101.errors, "101 items")).toBe(true);
  expect(s101.ok).toBe(false);
});

test("自訂網址 Suggested：英文字母和數字 3 到 100 個字、不含 linkedin（官方規則，違反就沒通過）", async () => {
  const dir = usFolder();
  const url = (v: string) => `## Custom URL\n- Fill: guide\n- Suggested: ${v}\n\nYour address would look like linkedin.com/in/ followed by a short name. LinkedIn allows 3 to 100 characters.\n`;
  expect((await li(dir, url("janedoe"))).errors).toEqual([]);
  for (const bad of ["jane-doe", "jd", "janelinkedin", "Jane Doe", "x".repeat(101)])
    expect(has((await li(dir, url(bad))).errors, "custom URL")).toBe(true);
});

// ---------------------------------------------------------------- bullets from resume.yaml

test("重點要和 resume.yaml 一字不差；來源行要有那一條的來源代號；技能一定要是 resume.yaml 的 skills 項目", async () => {
  const dir = usFolder();
  const exp = (bullet: string, src = "S-001") =>
    `## Experience: Sales Associate\n- Title: Sales Associate\n- Company: Northfield State University Bookstore\n- Fill: paste\n\n• ${bullet}\nSource: ${src}\n`;
  expect((await li(dir, exp("Worked the register on weekends."))).errors).toEqual([]);
  expect(has((await li(dir, exp("Worked the register on weekends and holidays."))).errors, "is not a bullet sentence from resume.yaml")).toBe(true);
  expect(has((await li(dir, exp("Worked the register on weekends.", "S-004"))).errors, "does not list S-001, the source of this bullet")).toBe(true);

  const skills = (items: string[], src: string) => `## Skills\n- Fill: paste\n\n${items.map((i) => `• ${i}`).join("\n")}\nSource: ${src}\n`;
  expect((await li(dir, skills(["Microsoft Word", "Excel (pivot tables)"], "S-006"))).errors).toEqual([]);
  expect(has((await li(dir, skills(["Photoshop"], "S-006"))).errors, "is not in the skills of resume.yaml")).toBe(true);
  expect(has((await li(dir, skills(["Microsoft Word"], "S-001"))).errors, "does not list S-006, the source of this skill")).toBe(true);

  // Handshake: courses, skills and career interests are lists, not resume bullets
  // P8-fix: a course name must be word for word an education detail (or a bullet) of resume.yaml; the old test pinned "any name goes"
  const courses = await hs(dir, "## Courses\n- Fill: paste\n\n• Coursework in accounting and statistics.\nSource: Education\n");
  expect(courses.errors).toEqual([]);
  expect(has((await hs(dir, "## Courses\n- Fill: paste\n\n• Intro to Accounting\n• Business Statistics\nSource: Education\n")).errors, "course name")).toBe(true);
  const interests = await hs(dir, "## Career Interests\n- Fill: pick\n\n• administrative assistant\nSource: Job goals\n");
  expect(interests.errors).toEqual([]);
  const wrongFill = await hs(dir, "## Career Interests\n- Fill: paste\n\n• administrative assistant\nSource: Job goals\n");
  expect(has(wrongFill.errors, "Fill")).toBe(true);
});

// ---------------------------------------------------------------- banned things, plain text

test("電話、email、住址：兩個檔案的每個地方都擋（說明區塊也一樣）；簽證字眼照擋", async () => {
  const dir = usFolder();
  for (const bad of ["Call me at (614) 555-0100.", "Reach me at jane.doe@example.com.", "I live at 123 Main Street.", "Phone 614-555-0100", "Box: P.O. Box 55"]) {
    const r = await li(dir, `## About\n- Fill: paste\n\n${bad}\nSource: Job goals\n`);
    expect(has(r.errors, "phone number, email or street address")).toBe(true);
  }
  const guide = await li(dir, "## Open to Work\n- Fill: guide\n\nEmail me at jane.doe@example.com or on F-1 status.\n");
  expect(has(guide.errors, "phone number, email or street address")).toBe(true);
  expect(has(guide.errors, "visa or work authorization")).toBe(true);
  const meta = await li(dir, ABOUT_OK.replace("- Fill: paste", "- Fill: paste\n- Location: 123 Main Street"));
  expect(has(meta.errors, "phone number, email or street address")).toBe(true);
  const header = await profile(dir, "handshake", HEAD_HS.replace("Updated: 2026-10-09", "Updated: 2026-10-09 jane@example.com") + ABOUT_OK.replace("## About", "## My Journey"));
  expect(has(header.errors, "phone number, email or street address")).toBe(true);
  const ph = await li(dir, "## About\n- Fill: paste\n\n[Your Name] is looking for roles. TBD.\nSource: Job goals\n");
  expect(has(ph.errors, "placeholder")).toBe(true);
});

test("貼上的內文是純文字：不能有 - 開頭的行、粗體、連結、表情符號；說明區塊的數字不用對來源", async () => {
  const dir = usFolder();
  const about = (line: string) => `## About\n- Fill: paste\n\n${line}\nSource: Job goals\n`;
  expect(has((await li(dir, about("- Looking for sales roles."))).errors, "for bullet points")).toBe(true);
  expect(has((await li(dir, about("**Looking** for sales roles."))).errors, "bold")).toBe(true);
  expect(has((await li(dir, about("See https://example.com for sales roles."))).errors, "links")).toBe(true);
  expect(has((await li(dir, about("Looking for sales roles 🚀"))).errors, "emoji")).toBe(true);
  const guide = await li(dir, "## Open to Work\n- Fill: guide\n\nThree choices. You can change it 5 times in 6 months.\n");
  expect(guide.errors).toEqual([]);
  const guideSrc = await li(dir, "## Open to Work\n- Fill: guide\n\nThree choices.\nSource: Job goals\n");
  expect(has(guideSrc.errors, "A guide section does not need a Source")).toBe(true);
});

// ---------------------------------------------------------------- command line

test("check --profiles：只查 profiles（不查職缺、104），寫 checks/_profiles.md；提醒印出來但結束碼 0", async () => {
  const dir = usFolder();
  write(dir, "profiles/linkedin.md", HEAD_LI + `## Headline\n- Fill: paste\n\n${seekLine(224)}\nSource: Job goals\n`);
  const r = await cli(dir, "--profiles");
  expect(r.code).toBe(0);
  expect(r.out).toContain("profiles/linkedin.md");
  expect(r.out).toContain("over the limit of 220");
  expect(r.out).toContain("All passed.");
  expect(r.out).not.toContain("104 master resume");
  expect(r.out).toContain("checks/_profiles.md");
  const doc = read(dir, "checks/_profiles.md");
  expect(doc).toContain("over the limit of 220");
  expect(doc).toContain("Warnings (not failures)");
  expect(doc.startsWith("# AI manual check")).toBe(true); // US folder: English heading and first line
  expect(doc).toContain("## Program check");
  expect(doc).not.toContain("## 程式檢查");

  write(dir, "profiles/linkedin.md", HEAD_LI + "## Headline\n- Fill: paste\n\nSeeking sales roles.\n");
  const bad = await cli(dir, "--profiles");
  expect(bad.code).toBe(1);
  expect(bad.out).toContain("Source:");

  // plain `check` (no id) still checks the profiles too
  expect((await cli(dir)).code).toBe(1);
  expect((await cli(dir)).out).toContain("profiles/linkedin.md");
  // the profile name works like the 104 one: `check profiles`
  expect((await cli(dir, "profiles")).out).toContain("profiles/linkedin.md");
});

test("check --profiles：沒有 profiles 檔、或是台灣版資料夾，都說明白而不是默默通過", async () => {
  const us = usFolder();
  const none = await cli(us, "--profiles");
  expect(none.code).toBe(2);
  expect(none.out).toContain("profiles");
  const tw = copyFixture();
  dirs.push(tw);
  write(tw, "profiles/linkedin.md", "F-1 OPT\n");
  const t = await cli(tw, "--profiles");
  expect(t.code).toBe(2);
  expect(t.out).toContain("美國版");
  const unknown = await cli(us, "--nope");
  expect(unknown.out).toContain("--profiles");
});

test("台灣版：profiles/ 不檢查，Source 行與英文來源詞照舊", async () => {
  const tw = copyFixture();
  dirs.push(tw);
  write(tw, "profiles/linkedin.md", "# LinkedIn\n## About\nF-1 OPT\n");
  const report = await runChecks(new Folder(tw), { ids: [], general: false });
  expect(report.profiles).toEqual([]);
});

// ---------------------------------------------------------------- P4 review fixes (red before the fix, green after)

const RESUME_LANG = RESUME.replace(
  /(skills:\n  - \{label: Software[^\n]*\n)/,
  "$1  - {label: Languages, items: [Spanish (native), English (fluent)], sources: [S-006], variants: [en]}\n",
);

test("修正：check <職缺代號> 不連 profiles 一起查，也不寫 checks/_profiles.md；不帶代號的 check 還是查", async () => {
  const dir = usFolder();
  write(dir, "profiles/linkedin.md", HEAD_LI + "## Headline\n- Fill: paste\n\nSeeking sales roles.\n"); // no Source: line = a problem
  const ids = allIds(new Folder(dir));
  expect(ids.length).toBeGreaterThan(0);
  const r = await cli(dir, ids[0]);
  expect(r.out).not.toContain("profiles/linkedin.md");
  expect(() => read(dir, "checks/_profiles.md")).toThrow();
  const alone = await runChecks(new Folder(dir), { ids: [ids[0]], general: false, profiles: false });
  expect(r.code).toBe(alone.ok ? 0 : 1);
  expect((await cli(dir)).out).toContain("profiles/linkedin.md");
});

test("修正：Headline 和 About 的 Skills: 行抄 resume.yaml 的 Spanish (native), English (fluent) 不算括號太多", async () => {
  const dir = usFolder();
  write(dir, "resume.yaml", RESUME_LANG);
  expect(RESUME_LANG).toContain("English (fluent)");
  const head = await li(dir, "## Headline\n- Fill: paste\n\nSeeking sales roles | Spanish (native), English (fluent)\nSource: Job goals, S-006\n");
  expect(head.errors).toEqual([]);
  const about = await li(
    dir,
    "## About\n- Fill: paste\n\nB.A. in Business Administration student at Northfield State University (Expected May 2027).\nSource: Education\n\nSkills: Excel (pivot tables), Spanish (native), English (fluent)\nSource: S-006\n",
  );
  expect(about.errors).toEqual([]);
  // an ordinary sentence still gets the one-pair rule
  const two = await li(dir, "## About\n- Fill: paste\n\nStudent (Expected May 2027) looking for sales (retail) roles.\nSource: Education, Job goals\n");
  expect(has(two.errors, "pairs of parentheses")).toBe(true);
});

test("修正：Skills 每一項都要是 resume.yaml 的 skills 項目，句子裡出現的字（register、textbooks）不算", async () => {
  const dir = usFolder();
  const skills = (items: string[]) => `## Skills\n- Fill: paste\n\n${items.map((i) => `• ${i}`).join("\n")}\nSource: S-001\n`;
  for (const word of ["Register", "Textbooks", "Worked the register"]) expect(has((await li(dir, skills([word]))).errors, "is not in the skills of resume.yaml")).toBe(true);
  const hsr = await hs(dir, "## Skills\n- Fill: paste\n\n• Register\nSource: S-001\n");
  expect(has(hsr.errors, "is not in the skills of resume.yaml")).toBe(true);
});

test("修正：Title、Company、School、Degree 要和 resume.yaml 一字不差", async () => {
  const dir = usFolder();
  const exp = (title: string, company: string, kind = "Experience") =>
    `## ${kind}: x\n- Title: ${title}\n- Company: ${company}\n- Fill: paste\n\n• Worked the register on weekends.\nSource: S-001\n`;
  const co = "Northfield State University Bookstore";
  expect((await li(dir, exp("Sales Associate", co))).errors).toEqual([]);
  expect(has((await li(dir, exp("Office Manager", co))).errors, "Title")).toBe(true);
  expect(has((await li(dir, exp("Sales Associate", "Northfield Bookstore"))).errors, "Company")).toBe(true);
  expect(has((await hs(dir, exp("Store Manager", co, "Work Experience"))).errors, "Title")).toBe(true);
  const edu = (school: string, degree: string) =>
    `## Education: x\n- School: ${school}\n- Degree: ${degree}\n- Dates: Aug 2023 – Expected May 2027\n- Fill: paste\n\nSource: Education\n`;
  expect((await li(dir, edu("Northfield State University", "B.A. in Business Administration"))).errors).toEqual([]);
  expect(has((await li(dir, edu("Northfield State University", "MBA"))).errors, "Degree")).toBe(true);
  expect(has((await li(dir, edu("Harvard University", "B.A. in Business Administration"))).errors, "School")).toBe(true);
});

test("修正：只靠 Education／Job goals 的段落寫到校內打工（名字含學校名）也要被抓到", async () => {
  const dir = usFolder();
  const j = (name: string) => `## My Journey\n- Fill: paste\n\nCashier at ${name}.\nSource: Education, Job goals\n`;
  expect(has((await hs(dir, j("Northfield State University Bookstore"))).errors, "This paragraph mentions")).toBe(true);
});
