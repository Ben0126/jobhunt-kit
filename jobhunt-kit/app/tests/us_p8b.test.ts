// US kit, P8 fix round 2: the checker binds what a story card records. A card's confirmation section may carry `Org:` and
// `Dates:` lines next to `Title:` (without them the file header's org / dates stand in); resume.yaml's role, employer or
// project name and dates must be the card's; the numbers of a card's sentences must be ones it says it heard; a summary or
// headline may not use a job-title word no card confirmed; a skills line needs a card of its own.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfirmed, runChecks } from "../src/check.ts";
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
        text: Helped customers at the register, usually about 30 customers a shift.
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

type Card = { title?: string; org?: string; dates?: string; said?: string; numbers?: string; conf: string };
/** A story file in the current format (dig-experience.md section 6): header with org and dates, "Your words", "Numbers", then the confirmation section. */
const story = (id: string, c: Card) =>
  `---\nid: ${id}\ntitle: ${c.title ?? "Card"}\ntype: job\norg: ${c.org ?? ""}\ndates: "${c.dates ?? ""}"\nstatus: confirmed\nconfirmed: "2026-10-09"\nconfirmed_via: chat\nconfirmed_reply: "confirm ${id}"\n---\n\n` +
  `## Your words\n\n> ${c.said ?? "text"}\n\n## Sentence for the resume\n\nx\n\n## Numbers (only ones they said)\n\n- ${c.numbers ?? "none"}\n\n## Sentence at confirmation (do not change)\n\n${c.conf}\n`;

const S001: Card = {
  title: "Bookstore sales associate",
  org: "Northfield College Bookstore",
  dates: "Jan 2024 – May 2026",
  said: "I helped customers at the register, usually around 30 customers a shift, and I trained 2 new student hires",
  conf: "Title: Sales Associate\n1. Helped customers at the register, usually about 30 customers a shift.\n2. Trained 2 new student hires on the register.",
};
const S003: Card = { title: "Food drive", org: "Northfield Food Drive", dates: "Nov 2024", conf: "1. Helped collect cans as one of the volunteers." };
const S004: Card = { title: "Software", conf: "Software: Google Sheets, Excel (basic)" };
const S005: Card = { title: "Languages", conf: "Languages: Portuguese (native), English (fluent)" };

function usFolder(o: { resume?: string; s001?: Card; s003?: Card; extra?: Record<string, string> } = {}): string {
  const dir = copyFixture();
  dirs.push(dir);
  const yml = readFileSync(join(dir, "jobhunt.yaml"), "utf-8");
  write(dir, "jobhunt.yaml", yml.replace(/^market:.*$/m, "market: us").replace(/^language:.*$/m, "language: en").replace(/^paper:.*$/m, "paper: letter"));
  write(dir, "resume.yaml", o.resume ?? RESUME);
  for (const f of ["S-001", "S-002", "S-003", "S-004"]) rmSync(join(dir, "me/stories", `${f}.md`), { force: true });
  write(dir, "me/stories/S-001.md", story("S-001", o.s001 ?? S001));
  write(dir, "me/stories/S-003.md", story("S-003", o.s003 ?? S003));
  write(dir, "me/stories/S-004.md", story("S-004", S004));
  write(dir, "me/stories/S-005.md", story("S-005", S005));
  write(dir, "me/profile.md", "# Job goals\n\n## Work they want\n- Sales, retail, Operations Manager\n\n## Location and work type\n- Columbus, OH\n\n## Education\n- Northfield College, B.B.A. Marketing, May 2026\n");
  for (const [rel, text] of Object.entries(o.extra ?? {})) write(dir, rel, text);
  return dir;
}

const rd = async (dir: string) => (await runChecks(new Folder(dir), { ids: [], general: false })).resumeData!.map((p) => p.message);
const rdOk = async (dir: string) => expect(await rd(dir)).toEqual([]);
const has = (msgs: string[], part: string) => msgs.some((m) => m.includes(part));
const edit = (resume: string, from: string, to: string) => {
  expect(resume.includes(from), from).toBe(true);
  return resume.replace(from, to);
};

test("the plain current-format folder (header org and dates, Title line) passes", async () => {
  await rdOk(usFolder());
});

// ---------------------------------------------------------------- 1a: a role needs a confirmed Title

test("1a: a role on a card that has no Title: line → error; with the matching Title it passes", async () => {
  const noTitle: Card = { ...S001, conf: "1. Helped customers at the register, usually about 30 customers a shift.\n2. Trained 2 new student hires on the register." };
  expect(has(await rd(usFolder({ s001: noTitle })), "has no Title: line")).toBe(true);
  // an item with no role claims no title
  await rdOk(usFolder({ s001: noTitle, resume: edit(RESUME, "    role: Sales Associate\n", "") }));
  // the title must be the card's
  expect(has(await rd(usFolder({ resume: edit(RESUME, "role: Sales Associate", "role: Sales Manager") })), "Sales Associate")).toBe(true);
});

// ---------------------------------------------------------------- 1b: employer / project name and dates

test("1b: a card reused under another employer or other dates → error", async () => {
  expect(has(await rd(usFolder({ resume: edit(RESUME, "org: Northfield College Bookstore", "org: Amazon") })), "is not the \"Northfield College Bookstore\"")).toBe(true);
  expect(has(await rd(usFolder({ resume: edit(RESUME, 'dates: "Jan 2024 – May 2026"', 'dates: "Jan 2020 – May 2026"') })), "dates in resume.yaml are not")).toBe(true);
  expect(has(await rd(usFolder({ resume: edit(RESUME, "name: Northfield Food Drive", "name: Global Relief Fund") })), "is not the \"Northfield Food Drive\"")).toBe(true);
  expect(has(await rd(usFolder({ resume: edit(RESUME, 'dates: "Nov 2024"', 'dates: "Nov 2023"') })), "dates in resume.yaml are not")).toBe(true);
});

test("1b: a card that records no org or dates cannot back an employer or dates in resume.yaml", async () => {
  expect(has(await rd(usFolder({ s001: { ...S001, org: "" } })), "does not record a confirmed one")).toBe(true);
  expect(has(await rd(usFolder({ s001: { ...S001, dates: "" } })), "does not record confirmed dates")).toBe(true);
});

test("1b: same employer written the way the card has it still passes (case, a bracketed location, dash style, a longer project name)", async () => {
  await rdOk(usFolder({ s001: { ...S001, org: "northfield college bookstore (Columbus)", dates: "Jan 2024 - May 2026" } }));
  await rdOk(usFolder({ resume: edit(RESUME, "name: Northfield Food Drive", 'name: "Volunteer, Northfield Food Drive"') }));
  // an employer is not allowed the extra words a project name is
  expect(has(await rd(usFolder({ resume: edit(RESUME, "org: Northfield College Bookstore", "org: Northfield College Bookstore Inc") })), "is not the")).toBe(true);
});

test("1b: Org: and Dates: lines in the confirmation section win over the file header; the header stands in when they are absent", async () => {
  const lines: Card = { ...S001, org: "Someone Else", dates: "2001", conf: "Title: Sales Associate\nOrg: Northfield College Bookstore\nDates: Jan 2024 – May 2026\n" + S001.conf.split("\n").slice(1).join("\n") };
  await rdOk(usFolder({ s001: lines }));
  // the other way round: the section says Amazon, the header says the bookstore → the section decides
  const section: Card = { ...S001, conf: S001.conf.replace("Title: Sales Associate", "Title: Sales Associate\nOrg: Amazon") };
  expect(has(await rd(usFolder({ s001: section })), "is not the \"Amazon\"")).toBe(true);
  // an explicit empty line means the user gave none
  const none: Card = { ...S001, conf: S001.conf.replace("Title: Sales Associate", "Title: Sales Associate\nDates:") };
  expect(has(await rd(usFolder({ s001: none })), "does not record confirmed dates")).toBe(true);
});

test("parseConfirmed: Org: / Dates: lines (any order, once each), still bad on notes or duplicates", () => {
  const sec = (block: string) => `## Sentence at confirmation (do not change)\n\n${block}\n`;
  expect(parseConfirmed(sec("Title: Cashier\nOrg: Campus Store\nDates: Sep 2024 – May 2025\n1. Worked the register."))).toEqual({
    title: "Cashier",
    org: "Campus Store",
    dates: "Sep 2024 – May 2025",
    sentences: ["Worked the register."],
    skills: [],
  });
  expect(parseConfirmed(sec("Dates: 2025\nOrg: Food Drive\n1. Sorted cans."))).toMatchObject({ title: null, org: "Food Drive", dates: "2025" });
  expect(parseConfirmed(sec("Title: A\nTitle: B\n1. Sorted cans."))?.bad).toBe(true);
  expect(parseConfirmed(sec("Org: Food Drive"))?.bad).toBe(true);
  expect(parseConfirmed(sec("Org: Food Drive\nNote: checked\n1. Sorted cans."))?.bad).toBe(true);
  // a skills line is still one single line
  expect(parseConfirmed(sec("Software: Excel, Word"))).toMatchObject({ skills: ["Excel", "Word"] });
});

// ---------------------------------------------------------------- 1c: numbers of the sentences

test("1c: a number in a confirmed sentence that is not under the same card's Your words or Numbers → error", async () => {
  const inflated: Card = { ...S001, conf: S001.conf.replace("2 new student hires", "12 new student hires") };
  const resume = edit(RESUME, "Trained 2 new student hires", "Trained 12 new student hires");
  expect(has(await rd(usFolder({ s001: inflated, resume })), "contain the number 12")).toBe(true);
  // the number is on the card's Numbers line (rough ones are listed there): fine
  await rdOk(usFolder({ s001: { ...inflated, numbers: "12 new student hires: \"a dozen or so\"" }, resume }));
  // the number is in the user's own words, in digits or as a word
  await rdOk(usFolder({ s001: { ...inflated, said: "I trained twelve new student hires and helped about 30 customers a shift" }, resume }));
  // a card with no Your words / Numbers section cannot vouch for a number
  const bare = story("S-001", inflated).replace(/## Your words[\s\S]*?(?=## Sentence at confirmation)/, "");
  const dir = usFolder({ resume });
  write(dir, "me/stories/S-001.md", bare);
  expect(has(await rd(dir), "contain the number")).toBe(true);
});

test("1c: Chinese number words in the user's own words count (三十 → 30, 兩 → 2)", async () => {
  const card: Card = { ...S001, said: "我一個班次大概三十個客人，還教過兩位新同事" };
  await rdOk(usFolder({ s001: card }));
  expect(has(await rd(usFolder({ s001: { ...S001, said: "我一個班次大概二十個客人，還教過兩位新同事" } })), "contain the number 30")).toBe(true);
});

// ---------------------------------------------------------------- 1d: job-title words

const TARGET = (summary: string) => `id: t1
job_id: t1
base_variant: en
lang: en
template: us
summary: >-
  ${summary}
bullet_order:
  s001: [s001_a, s001_b]
bullet_overrides: {}
skills_order: []
company: Acme
role: Office Assistant
confirm: []
answered: []
application_answers: {}
`;
async function summaryMessages(summary: string, o: Parameters<typeof usFolder>[0] = {}): Promise<string[]> {
  const dir = usFolder({ ...o, extra: { "targets/t1.yaml": TARGET(summary) } });
  const report = await runChecks(new Folder(dir), { ids: ["t1"], general: false });
  return report.items[0].problems.filter((p) => p.where.includes("Summary")).map((p) => p.message);
}

test("1d: a title word in a target summary that no card's Title has → error", async () => {
  expect(has(await summaryMessages("Marketing graduate with experience as an Office Manager."), "job title \"Manager\"")).toBe(true);
  expect(has(await summaryMessages("Former Team Lead at a campus bookstore."), "job title \"Lead\"")).toBe(true);
  expect(has(await summaryMessages("Founder of a student club."), "job title \"Founder\"")).toBe(true);
  expect(has(await summaryMessages("Captain of the sales team."), "job title \"Captain\"")).toBe(true);
});

test("1d: allowed — the card's own title word, a person ('the manager'), lowercase verbs, and a role the user wrote under Work they want", async () => {
  const withManager: Card = { ...S001, conf: S001.conf.replace("Title: Sales Associate", "Title: Assistant Manager"), };
  const resumeManager = edit(RESUME, "role: Sales Associate", "role: Assistant Manager");
  expect(has(await summaryMessages("Assistant Manager at a campus bookstore.", { s001: withManager, resume: resumeManager }), "job title")).toBe(false);
  expect(has(await summaryMessages("Marketing graduate who trained 2 student hires at the manager's request, and worked with the store manager."), "job title")).toBe(false);
  expect(has(await summaryMessages("Marketing graduate who will lead with curiosity and heads for sales."), "job title")).toBe(false);
  expect(has(await summaryMessages("Marketing graduate seeking Operations Manager roles."), "job title")).toBe(false);
  expect(has(await summaryMessages("Marketing graduate seeking Director roles."), "job title")).toBe(true);
});

test("1d: a summary written in resume.yaml itself follows the same rule", async () => {
  const bad = edit(RESUME, 'summary: {en: ""}', 'summary: {en: "Office Manager with two years of bookstore experience."}');
  expect(has(await rd(usFolder({ resume: bad })), "job title \"Manager\"")).toBe(true);
});

test("1d: a LinkedIn headline or About opening with a title word no card confirmed → error", async () => {
  const head = (line: string) =>
    `# LinkedIn profile text (draft)\nUpdated: 2026-10-09\nStories used: S-001\nDraft text for you to paste yourself. Lines starting with "- " and "Source:" are notes; do not paste them.\n\n## Headline\n- Fill: paste\n\n${line}\nSource: Education, Job goals, S-001\n`;
  const run = async (line: string) => {
    const dir = usFolder({ extra: { "profiles/linkedin.md": head(line) } });
    return (await runChecks(new Folder(dir), { ids: [], general: false })).profiles.flatMap((f) => f.problems).map((p) => p.message);
  };
  expect(has(await run("Seeking sales roles | B.B.A. Marketing, Northfield College | Office Manager"), "job title \"Manager\"")).toBe(true);
  expect(has(await run("Seeking sales roles | B.B.A. Marketing, Northfield College | Sales Associate, Northfield College Bookstore"), "job title")).toBe(false);
});

// ---------------------------------------------------------------- 1e: a skills line needs a card

test("1e: a skills line whose only source is Education / Job goals → error; empty lines and carded lines are fine", async () => {
  const bad = edit(RESUME, "  - {label: Languages, items: [Portuguese (native), English (fluent)], sources: [S-005], variants: [en]}", "  - {label: Languages, items: [Mandarin (fluent)], sources: [Education], variants: [en]}");
  expect(has(await rd(usFolder({ resume: bad })), "not tied to any S- card")).toBe(true);
  const noSource = edit(RESUME, "sources: [S-005], ", "");
  expect(has(await rd(usFolder({ resume: noSource })), "not tied to any S- card")).toBe(true);
  const empty = edit(RESUME, "  - {label: Languages, items: [Portuguese (native), English (fluent)], sources: [S-005], variants: [en]}", "  - {label: Languages, items: [], sources: [], variants: [en]}");
  await rdOk(usFolder({ resume: empty }));
});
