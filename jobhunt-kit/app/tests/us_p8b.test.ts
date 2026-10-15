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
  // (fixture data: the extra word has to be a word of the card's own Title, so the card is titled Volunteer; see the P8fix2 tests below)
  await rdOk(usFolder({ s003: { ...S003, conf: "Title: Volunteer\n" + S003.conf }, resume: edit(RESUME, "name: Northfield Food Drive", 'name: "Volunteer, Northfield Food Drive"') }));
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

// ================================================================ P8 fix round 2, second pass (review M1-M8)
// Each test below was written against the bypass a reviewer actually ran; the controls next to them are the legitimate spellings.

const S006: Card = { title: "Marketing club treasurer", org: "Northfield Marketing Club", dates: "Aug 2024 – May 2025", said: "I collected the dues", conf: "Title: Treasurer\n1. Collected dues." };
const CLUB_ITEM = `  - id: s006
    org: Northfield Marketing Club
    role: Treasurer
    dates: "Aug 2024 – May 2025"
    variants: [en]
    bullets:
      - id: s006_a
        text: Collected dues.
        source: S-006
`;
const RESUME2 = edit(RESUME, "projects:\n", CLUB_ITEM + "projects:\n");
const two = (o: Parameters<typeof usFolder>[0] = {}) => usFolder({ resume: RESUME2, ...o, extra: { "me/stories/S-006.md": story("S-006", S006), ...(o.extra ?? {}) } });

test("M1 control: two jobs, each on its own card, pass", async () => {
  await rdOk(two());
});

test("M1: an entry that names two cards must agree with EACH card (org, dates, title), whether the second card is on the entry or on a bullet", async () => {
  // item-level second source: the bookstore entry also names the club card → the club's org / dates / title do not match
  const msgs = await rd(two({ resume: edit(RESUME2, "    role: Sales Associate\n", "    role: Sales Associate\n    sources: [S-001, S-006]\n") }));
  expect(has(msgs, "is not the \"Northfield Marketing Club\" confirmed on the card of S-006") || has(msgs, "card of S-006")).toBe(true);
  expect(has(msgs, "is not the title \"Treasurer\"")).toBe(true);
  expect(has(msgs, "dates in resume.yaml are not the \"Aug 2024 – May 2025\"")).toBe(true);
  // the employer, dates and title all rewritten to the club's: now the bookstore card (S-001) disagrees
  const swapped = edit(edit(edit(RESUME2, "    org: Northfield College Bookstore\n", "    org: Northfield Marketing Club\n"), 'dates: "Jan 2024 – May 2026"', 'dates: "Aug 2024 – May 2025"'), "role: Sales Associate", "role: Treasurer");
  expect(has(await rd(two({ resume: edit(swapped, "    role: Treasurer\n", "    role: Treasurer\n    sources: [S-001, S-006]\n") })), "card of S-001")).toBe(true);
  // a bullet moved under another job: its card is the club's
  const moved = edit(RESUME2, "      - id: s001_b\n", "      - id: s001_x\n        text: Collected dues.\n        source: S-006\n      - id: s001_b\n");
  expect(has(await rd(two({ resume: moved })), "card of S-006")).toBe(true);
  // a card with no Title under an entry that prints a role: the card without the title is named
  const noTitle = edit(RESUME2, "    role: Sales Associate\n", "    role: Sales Associate\n    sources: [S-001, S-003]\n");
  expect(has(await rd(two({ resume: noTitle })), "the \"Sentence at confirmation\" of S-003 has no Title")).toBe(true);
});

test("M2/M3: a project name or employer cannot be padded (a title in front, extra words, a bracket the card never had); the card's own bracket may be left out or kept", async () => {
  const proj = (name: string) => edit(RESUME, "name: Northfield Food Drive", `name: ${JSON.stringify(name)}`);
  for (const name of ["Store Manager, Northfield Food Drive", "Northfield Food Drive (Owner and Founder)", "7-Eleven Northfield Food Drive"])
    expect([name, has(await rd(usFolder({ resume: proj(name) })), "is not the \"Northfield Food Drive\"")]).toEqual([name, true]);
  for (const org of ["Northfield College Bookstore (Amazon)", "Northfield College Bookstore [Barnes & Noble corporate]"])
    expect([org, has(await rd(usFolder({ resume: edit(RESUME, "org: Northfield College Bookstore", `org: ${JSON.stringify(org)}`) })), "is not the \"Northfield College Bookstore\"")]).toEqual([org, true]);
  // with an explicit Org: line the name must be exactly the card's, even a word from the Title is too much
  const explicit: Card = { ...S003, conf: "Title: Volunteer\nOrg: Northfield Food Drive\n" + S003.conf };
  expect(has(await rd(usFolder({ s003: explicit, resume: proj("Volunteer, Northfield Food Drive") })), "is not the \"Northfield Food Drive\"")).toBe(true);
  // a job-title word as the "extra" word is refused even when the card's Title has it
  const mgr: Card = { ...S003, conf: "Title: Manager\n" + S003.conf };
  expect(has(await rd(usFolder({ s003: mgr, resume: proj("Manager, Northfield Food Drive") })), "is not the \"Northfield Food Drive\"")).toBe(true);
  // controls: the card's bracketed location kept or dropped; the exact name; the Title's word on the header-org fallback
  const bracketed: Card = { ...S001, org: "Northfield College Bookstore (Columbus)" };
  await rdOk(usFolder({ s001: bracketed }));
  await rdOk(usFolder({ s001: bracketed, resume: edit(RESUME, "org: Northfield College Bookstore", "org: Northfield College Bookstore (Columbus)") }));
});

// ---- M4 / M5: title words

test("M4: plural, lowercase team lead / head of, abbreviations, and 'the' after served as / promoted to are still title claims", async () => {
  const bad = [
    "Bookstore Managers alumna.",
    "Former Supervisors of the year.",
    "Bookstore Team Leads alumna.",
    "Worked as a team lead at the bookstore.",
    "Worked as a team-lead at the bookstore.",
    "Worked as head of sales for the club.",
    "Former CEO of a student startup.",
    "VP of the marketing club.",
    "Assistant Mgr at the bookstore.",
    "A cofounder of a student club.",
    "Served as the store manager.",
    "Promoted to her shift supervisor role.",
    "Mаnager of the bookstore.", // a Cyrillic a
  ];
  for (const s of bad) expect([s, has(await summaryMessages(s), "job title")]).toEqual([s, true]);
  const fine = [
    "Reported to the manager.",
    "Worked with the shift supervisor on schedules.",
    "Ready to lead outreach.",
    "Generated qualified sales leads for the club.",
    "Built leadership skills at the bookstore.",
    "Seeking Operations Manager roles.",
    "Trained 2 new student hires, at the manager's request.",
  ];
  for (const s of fine) expect([s, await summaryMessages(s)]).toEqual([s, []]);
});

test("M4: a title word inside an employer, school or skill that resume.yaml already has is not a claim ('Head Start', 'Meta Ads Manager')", async () => {
  const org = "Northfield Head Start Center";
  const resume = edit(RESUME, "org: Northfield College Bookstore", `org: ${org}`);
  const s001 = { ...S001, org };
  expect(await summaryMessages(`Marketing graduate who worked at ${org}.`, { s001, resume })).toEqual([]);
  expect(has(await summaryMessages("Marketing graduate, Head of the club.", { s001, resume }), "job title \"Head\"")).toBe(true);
  const skills = edit(edit(RESUME, "items: [Google Sheets, Excel (basic)]", "items: [Meta Ads Manager]"), "sources: [S-004]", "sources: [S-004]");
  const extra = { "me/stories/S-004.md": story("S-004", { ...S004, conf: "Software: Meta Ads Manager" }) };
  expect(await summaryMessages("Marketing graduate skilled in Meta Ads Manager.", { resume: skills, extra })).toEqual([]);
});

test("M5: a 'Seeking ... roles' clause ends at a comma or 'after / as / having'; the role must be followed by roles / positions / jobs", async () => {
  expect(has(await summaryMessages("Seeking sales roles, after working as Store Manager at the bookstore."), "job title \"Manager\"")).toBe(true);
  expect(has(await summaryMessages("Seeking sales roles as a Manager."), "job title \"Manager\"")).toBe(true);
  expect(has(await summaryMessages("Seeking Operations Manager."), "job title \"Manager\"")).toBe(true);
  expect(await summaryMessages("Seeking Operations Manager or Director positions.")).toEqual([expect.stringContaining("job title \"Director\"")]);
  expect(await summaryMessages("Seeking Operations Manager roles.")).toEqual([]);
});

// ---- M6: numbers

const withWords = (card: Card, words: string) => story("S-001", card).replace(/## Your words[\s\S]*?(?=## Sentence for the resume)/, `## Your words\n\n${words}\n\n`);
const hires = (n: string): Card => ({ ...S001, said: "I helped customers at the register, usually around 30 customers a shift, and I trained 2 new student hires", conf: S001.conf.replace("2 new student hires", `${n} new student hires`) });

test("M6a: 'a dozen' is 12 (half a dozen 6, two dozen 24) on both sides", async () => {
  expect(has(await rd(usFolder({ s001: hires("a dozen") })), "contain the number 12")).toBe(true);
  expect(has(await rd(usFolder({ s001: hires("half a dozen") })), "contain the number 6")).toBe(true);
  expect(has(await rd(usFolder({ s001: hires("two dozen") })), "contain the number 24")).toBe(true);
  // the user did say it
  const said = { ...hires("a dozen"), said: "I helped customers, around 30 customers a shift, and I trained a dozen new student hires" };
  await rdOk(usFolder({ s001: said, resume: edit(RESUME, "Trained 2 new student hires", "Trained a dozen new student hires") }));
});

test("M6b: a year in a confirmed sentence has to be in the user's words, the Numbers section or the card's dates", async () => {
  const since = { ...hires("2"), conf: S001.conf.replace("on the register.", "on the register since 2019.") };
  expect(has(await rd(usFolder({ s001: since })), "contain the number 2019")).toBe(true);
  const resume = edit(RESUME, "Trained 2 new student hires on the register.", "Trained 2 new student hires on the register since 2019.");
  await rdOk(usFolder({ resume, s001: { ...since, said: since.said + ", since 2019" } }));
  // the card's own dates (2024) vouch for a 2024 in a sentence
  await rdOk(usFolder({ resume: edit(RESUME, "Trained 2 new student hires on the register.", "Trained 2 new student hires on the register in 2024."), s001: { ...hires("2"), conf: S001.conf.replace("on the register.", "on the register in 2024.") } }));
});

test("M6c: what the old resume said and the user denied is not 'said'; with self-attest it is", async () => {
  const sentence = (via: string) =>
    withWords(S001, "Old resume text (old-resume.docx, word for word; NOT their words, they corrected it):\n\n> Increased event attendance by 50%\n\nTheir words (added in conversation):\n\n> I trained 2 new student hires, around 30 customers a shift.\n> 50%那個我不知道 是我朋友幫我寫的")
      .replace("confirmed_via: chat", `confirmed_via: ${via}`)
      .replace("2. Trained 2 new student hires on the register.", "2. Trained 2 new student hires on the register.\n3. Increased event attendance by 50%.");
  const run = async (via: string, numbers: string) => {
    const dir = usFolder();
    write(dir, "me/stories/S-001.md", sentence(via).replace("- none", numbers));
    return rd(dir);
  };
  expect(has(await run("chat", "- 50% dropped: \"我不知道\" (a friend wrote it)"), "contain the number 50%")).toBe(true);
  expect(has(await run("chat", "- none"), "contain the number 50%")).toBe(true);
  expect(has(await run("self-attest", "- none"), "contain the number 50%")).toBe(false);
  // a hedge in its own clause does not take the other numbers with it
  await rdOk(usFolder({ s001: { ...S001, said: "我一個班次大概30個客人，我不知道確切的數字，還有我教過2個新同事" } }));
});

test("M6d: the old resume text ends where words 'added in conversation' start (import-resume.md 5 marks them that way)", async () => {
  const old = "Old resume text (pasted, word for word):\n\n> Helped customers at the register\n\n";
  const said = "I trained 2 new student hires, around 30 customers a shift.";
  for (const words of [`${old}Added in conversation (word for word):\n\n> ${said}`, `${old}> ${said} (added in conversation)`, `${old}(helper said)\n\n> ${said}`]) {
    const dir = usFolder();
    write(dir, "me/stories/S-001.md", withWords(S001, words));
    await rdOk(dir);
  }
});

test("M6: Arabic-Indic digits are read as digits", async () => {
  expect(has(await rd(usFolder({ s001: hires("١٢") })), "contain the number 12")).toBe(true);
});

// ---- M7: what the printed resume file may say

async function resumeFileMessages(o: { resume?: string; target?: string; swap?: [string, string][]; extra?: Record<string, string> }): Promise<string[]> {
  const dir = usFolder({ resume: o.resume, extra: { "targets/t1.yaml": o.target ?? TARGET("Marketing graduate."), ...o.extra } });
  const tpl = readFileSync(join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us", "templates", "resume-us.html"), "utf-8");
  const body = `<main class="page" id="page">
  <header class="top"><h1 class="name">Ana Ribeiro</h1><ul class="contact"><li>ana.ribeiro@gmail.com</li></ul></header>
  <section class="block"><h2>Summary</h2><p class="summary">Marketing graduate.</p></section>
  <section class="block"><h2>Education</h2><div class="entry"><div class="entry-head"><div class="entry-title">Northfield College<span class="role">B.B.A. Marketing</span></div><div class="entry-date">May 2026</div></div></div></section>
  <section class="block"><h2>Experience</h2><div class="entry"><div class="entry-head"><div class="entry-title">Northfield College Bookstore<span class="role">Sales Associate</span></div><div class="entry-date">Jan 2024 – May 2026</div></div>
  <ul><li>Helped customers at the register, usually about 30 customers a shift.</li><li>Trained 2 new student hires on the register.</li></ul></div></section>
  <section class="block"><h2>Projects &amp; Activities</h2><div class="entry"><div class="entry-head"><div class="entry-title">Northfield Food Drive</div><div class="entry-date">Nov 2024</div></div><ul><li>Helped collect cans as one of the volunteers.</li></ul></div></section>
  <section class="block"><h2>Skills &amp; Certifications</h2><ul class="skills"><li><span class="label">Software:</span> Google Sheets, Excel (basic)</li><li><span class="label">Languages:</span> Portuguese (native), English (fluent)</li></ul></section>
</main>`;
  let html = tpl.replace("<title>{{Full Name}} Resume</title>", "<title>Ana Ribeiro Resume</title>").replace(/<main class="page" id="page">[\s\S]*?<\/main>/, () => body);
  for (const [a, b] of o.swap ?? []) {
    expect(html.includes(a), a).toBe(true);
    html = html.replace(a, b);
  }
  write(dir, "resumes/t1.html", html);
  const report = await runChecks(new Folder(dir), { ids: ["t1"], general: false });
  return report.items[0].problems.filter((p) => p.where.includes("Resume file") || p.where.includes("履歷檔")).map((p) => p.message);
}

test("M7 control: the plain printed resume file passes", async () => {
  expect(await resumeFileMessages({})).toEqual([]);
});

test("M7: the printed file may not carry a title, employer or place through an extra key or en_names; resume.yaml items with unknown keys are errors", async () => {
  const roleSwap: [string, string][] = [['Bookstore<span class="role">Sales Associate</span>', 'Bookstore<span class="role">Store Manager</span>']];
  // a `title` key whose value is then printed
  const withTitle = edit(RESUME, "    role: Sales Associate\n", "    role: Sales Associate\n    title: Store Manager\n");
  expect((await resumeFileMessages({ resume: withTitle, swap: roleSwap })).length).toBeGreaterThan(0);
  expect(has(await rd(usFolder({ resume: withTitle })), "a field the program does not know: \"title\"")).toBe(true);
  // en_names in the target (a Taiwan-kit field) no longer widens what the file may print
  const target = TARGET("Marketing graduate.").replace("skills_order: []", "skills_order: []\nen_names: {s001: Store Manager}");
  expect((await resumeFileMessages({ target, swap: roleSwap })).length).toBeGreaterThan(0);
  const orgSwap: [string, string][] = [['<div class="entry-title">Northfield College Bookstore<span', '<div class="entry-title">Amazon<span']];
  expect((await resumeFileMessages({ target: TARGET("Marketing graduate.").replace("skills_order: []", "skills_order: []\nen_names: {s001: Amazon}"), swap: orgSwap })).length).toBeGreaterThan(0);
  // a location that is an organization (two commas) is refused, a plain place is fine
  expect(has(await rd(usFolder({ resume: edit(RESUME, "    role: Sales Associate\n", '    role: Sales Associate\n    location: "Amazon HQ, Seattle, WA"\n') })), "not a plain place")).toBe(true);
  await rdOk(usFolder({ resume: edit(RESUME, "    role: Sales Associate\n", '    role: Sales Associate\n    location: "Columbus, OH"\n') }));
});

// ---- the Certifications section (last): its `Certifications` line prints without a label, `Training` keeps one

const CPR_CARD: Card = { title: "CPR", conf: "Certifications: CPR certified" };
const COURSE_CARD: Card = { title: "Course", conf: "Training: Google Sheets course (online)" };
const WITH_CREDENTIALS = edit(
  edit(RESUME, "sections: [summary, education, experience, projects, skills]", "sections: [summary, education, experience, projects, skills, credentials]"),
  "variants: [en]}\n`".slice(0, 0) + "  - {label: Languages,",
  "  - {label: Certifications, items: [CPR certified], sources: [S-008], variants: [en]}\n  - {label: Training, items: [Google Sheets course (online)], sources: [S-009], variants: [en]}\n  - {label: Languages,",
);
const credentialsFile = (certLine: string): { resume: string; extra: Record<string, string>; swap: [string, string][] } => ({
  resume: WITH_CREDENTIALS,
  extra: { "me/stories/S-008.md": story("S-008", CPR_CARD), "me/stories/S-009.md": story("S-009", COURSE_CARD) },
  swap: [
    ["Skills &amp; Certifications", "Skills"],
    ["</section>\n</main>", `</section>\n  <section class="block"><h2>Certifications</h2><ul class="skills">${certLine}<li><span class="label">Training:</span> Google Sheets course (online)</li></ul></section>\n</main>`],
  ],
});

test("Certifications section: the label-less Certifications line and the labeled Training line pass the resume-file check", async () => {
  expect(await resumeFileMessages(credentialsFile("<li>CPR certified</li>"))).toEqual([]);
});

test("Certifications section: an item that is not on a confirmed card is still refused there", async () => {
  expect((await resumeFileMessages(credentialsFile("<li>CPR certified, Salesforce Certified Administrator</li>"))).length).toBeGreaterThan(0);
});

// ---- M8: the label of a skills line

test("M8: the label of a skills line is the card's label", async () => {
  expect(has(await rd(usFolder({ resume: edit(RESUME, "{label: Software,", "{label: Salesforce Certified Administrator,") })), "label \"Software\"")).toBe(true);
  expect(has(await rd(usFolder({ resume: edit(RESUME, "{label: Software,", "{label: Certified,") })), "label")).toBe(true);
  await rdOk(usFolder({ resume: edit(RESUME, "{label: Software,", "{label: software,") }));
  expect(parseConfirmed("## Sentence at confirmation (do not change)\n\nSoftware: Excel, Word\n")).toMatchObject({ label: "Software", skills: ["Excel", "Word"] });
});
