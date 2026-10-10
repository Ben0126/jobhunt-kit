// US kit, phase P2: English numbers and dates on both sides of the comparison, English placeholders, the US resume
// template and the US jobhunt.yaml. Everything here is market us; the Taiwan folder is checked to stay as it was.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "../../web/js/core/rules.js";
import { runCheck, runChecks, templateFor, TEMPLATE_NAMES } from "../src/check.ts";
import { englishYearMonths, moreThanClaims, normEnglish } from "../src/english.ts";
import { Folder } from "../src/folder.ts";
import { visaWords } from "../src/visa.ts";
import { oddMarkup, scriptsOf, templateWords } from "../src/htmltext.ts";
import { marketFromConfig } from "../src/market.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const US_KIT = join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us");
const tplUs = readFileSync(join(US_KIT, "templates", "resume-us.html"), "utf-8");
const ID = "261008-01";
const T = `targets/${ID}.yaml`;
const HTML = `resumes/${ID}.html`;

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf-8");
const write = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

// ---------------------------------------------------------------- a US folder with an English resume.yaml

const BULLETS = [
  "Handled twenty-five customers per hour at the register.",
  "Doubled newsletter signups to three hundred.",
  "Managed a $1.2M annual budget.",
  "Trained over 50 new hires.",
  "Raised 47 donations.",
  "Cut wait time by 15%.",
  "Answered two hundred emails weekly.",
];

const RESUME = `basics:
  name: Jane Doe
  email: jane.doe@gmail.com
  phone: "(555) 555-0100"
  location: "Austin, TX"
  links: []
variants:
  en: {title: English, major: 1}
sections: [summary, education, experience, projects, skills]
section_titles: {summary: Summary, education: Education, experience: Experience, projects: Projects & Activities, skills: Skills & Certifications}
summary: {en: ""}
education:
  - school: State University
    degree: B.A. in Communication
    dates: "Aug 2021 – Expected May 2027"
    details: []
    source: 學歷
    variants: [en]
experience:
  - id: s001
    org: Campus Bookstore
    role: Cashier
    dates: "Jun 2023 – Present"
    variants: [en]
    bullets:
${BULLETS.map((b, i) => `      - id: s001_${"abcdefg"[i]}\n        text: ${JSON.stringify(b)}\n        source: S-001`).join("\n")}
  - id: s002
    org: City Library
    role: Volunteer
    dates: "Sep 2024 – Dec 2024"
    variants: [en]
    bullets:
      - id: s002_a
        text: Shelved books.
        source: S-002
projects: []
skills: []
`;

const TARGET = `id: ${ID}
job_id: ${ID}
base_variant: en
lang: en
template: us
photo: false
summary: >-
  Cashier with campus experience.
bullet_order:
  s001: [s001_a, s001_b, s001_c, s001_d, s001_e, s001_f, s001_g]
  s002: [s002_a]
bullet_overrides: {}
skills_order: []
company: Acme
role: Office Assistant
confirm: []
answered: []
application_answers: {}
`;

/** The fixture turned into a US folder: market us, English resume.yaml and target, no resume file yet. */
function usFolder(): string {
  const dir = copyFixture();
  dirs.push(dir);
  write(dir, "jobhunt.yaml", read(dir, "jobhunt.yaml").replace(/^market:.*$/m, "market: us").replace(/^language:.*$/m, "language: en").replace(/^paper:.*$/m, "paper: letter"));
  write(dir, "resume.yaml", RESUME);
  // P8-fix: resume.yaml is compared with the "Sentence at confirmation" of the cards it names, so the two cards carry those sentences
  const card = (id: string, title: string, org: string, sentences: string[]) =>
    `---\nid: ${id}\ntitle: ${title}\ntype: job\norg: ${org}\nstatus: confirmed\nconfirmed: "2026-10-09"\nconfirmed_via: chat\nconfirmed_reply: "confirm ${id}"\n---\n\n## Your words\n\n> text\n\n## Sentence at confirmation (do not change)\n\nTitle: ${title}\n${sentences.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n`;
  write(dir, "me/stories/S-001.md", card("S-001", "Cashier", "Campus Bookstore", BULLETS));
  write(dir, "me/stories/S-002.md", card("S-002", "Volunteer", "City Library", ["Shelved books."]));
  write(dir, T, TARGET);
  rmSync(join(dir, HTML));
  return dir;
}

/** Problems the checker finds in this summary text (the only thing that changes), as `message` strings. */
async function summaryMessages(dir: string, summary: string): Promise<string[]> {
  write(dir, T, TARGET.replace("Cashier with campus experience.", summary));
  const report = await runChecks(new Folder(dir), { ids: [ID], general: false });
  return report.items[0].problems.filter((p) => p.where.includes("Summary")).map((p) => p.message);
}

// ---------------------------------------------------------------- numbers

test("英文數字：英文數字字、$1.2M、1.2 million、twice、百分比、N+ 兩邊都換成同一種寫法，寫法不同但意思一樣就過", async () => {
  const dir = usFolder();
  const fine = [
    "Handled twenty-five customers per hour.",
    "Handled 25 customers per hour.",
    "Handled 25 customers an hour, twice as fast.",
    "Managed a $1,200,000 annual budget.",
    "Managed a $1.2M annual budget.",
    "Managed a $1.2 million annual budget.",
    "Managed a $1200000 annual budget.",
    "Signups went to 300.",
    "Answered 200 emails weekly.",
    "Answered two hundred emails weekly.",
    "Cut wait time by fifteen percent.",
    "Cut wait time by 15 percent.",
    "Raised forty-seven donations.",
    "Trained over fifty new hires.",
    "Trained more than 50 new hires.",
    "Trained 50+ new hires.",
    "Trained fifty new hires.",
  ];
  for (const s of fine) expect([s, await summaryMessages(dir, s)]).toEqual([s, []]);
});

test("英文數字：沒確認過的數字照樣抓（二十六、$2.4M、tripled），而且說出是哪個數字", async () => {
  const dir = usFolder();
  const cases: [string, string][] = [
    ["Handled twenty-six customers per hour.", "26"],
    ["Managed a $2.4M annual budget.", "2400000"],
    ["Managed a $2.4 million annual budget.", "2400000"],
    ["Tripled newsletter signups.", "3x"],
    ["Answered five hundred emails weekly.", "500"],
    ["Cut wait time by half.", "50%"],
  ];
  for (const [s, n] of cases) {
    const msgs = await summaryMessages(dir, s);
    expect([s, msgs.some((m) => m.startsWith("The number") && m.includes(`"${n}"`))]).toEqual([s, true]);
  }
});

test("N+：本人原話沒說過「超過 N」就不准寫 50+、over 47、more than 47、47 or more；原話說了 over 50 才准 50+", async () => {
  const dir = usFolder();
  const flagged = ["Raised 47+ donations.", "Raised over 47 donations.", "Raised more than 47 donations.", "Raised 47 or more donations.", "Raised over forty-seven donations."];
  for (const s of flagged) {
    const msgs = await summaryMessages(dir, s);
    expect([s, msgs.filter((m) => m.includes(`You never said "over 47"`)).length]).toEqual([s, 1]);
  }
  // 47 is only a plain number in the user's words; 50 is "over 50" there
  expect(await summaryMessages(dir, "Raised 47 donations.")).toEqual([]);
  expect(await summaryMessages(dir, "Trained 50+ new hires.")).toEqual([]);
  // a number nobody said is the numbers problem alone, not reported twice
  const msgs = await summaryMessages(dir, "Raised 60+ donations.");
  expect(msgs.filter((m) => m.startsWith("The number") && m.includes("\"60\"")).length).toBe(1);
  expect(msgs.some((m) => m.includes("never said"))).toBe(false);
});

test("英文數字：normEnglish / moreThanClaims 單元", () => {
  const n = (s: string) => [...R.numbers(normEnglish(s))].sort();
  expect(n("five hundred and twelve")).toEqual(["512"]);
  expect(n("eleven hundred, one hundred and fifty")).toEqual(["1100", "150"]);
  expect(n("one hundred twenty")).toEqual(["120"]);
  expect(n("two thousand five hundred")).toEqual(["2500"]);
  expect(n("a twelve-person team")).toEqual(["12"]);
  expect(n("$15K and 15k")).toEqual(["15000"]);
  expect(n("no one knew; one of the team; one-on-one")).toEqual([]); // "one" is a pronoun here
  expect(n("a one-year project")).toEqual(["1"]);
  expect(n("tenant, hundreds of someone")).toEqual([]);
  expect(n("twice a week, doubled, halved, cut in half")).toEqual(["2x", "50%"]); // "twice a week" is a frequency, not a 2x claim: only doubled gives the 2x
  expect(n("twice as fast")).toEqual(["2x"]);
  expect(moreThanClaims("Led 50+ events, over $1.2M, more than 3 years, 12 or more").map((c) => c.n).sort()).toEqual(["1200000", "12", "3", "50"].sort());
});

// ---------------------------------------------------------------- dates

test("英文日期（兩邊都認）：May 2024、Sept. 2024、05/2024、Expected May 2027、Present、Q3 2024；yaml 寫 Mon YYYY 履歷寫 MM/YYYY 也對得上", async () => {
  const dir = usFolder();
  const fine = [
    "Cashier since Jun 2023.",
    "Cashier since June 2023.",
    "Cashier since 06/2023.",
    "Cashier since 6/2023.",
    "Library volunteer in Sept. 2024.",
    "Library volunteer in Sep 2024.",
    "Library volunteer in 09/2024.",
    "Graduating Expected May 2027.",
    "Cashier from Jun 2023 to Present.",
    "Busy in Q3 2024.",
    "Cashier since Aug 2021.",
  ];
  for (const s of fine) expect([s, await summaryMessages(dir, s)]).toEqual([s, []]);
});

test("英文日期：確認過的資料裡沒有的月份要抓；05/2024 不會被當成數字 5 和 2024", async () => {
  const dir = usFolder();
  for (const s of ["Cashier since Mar 2023.", "Cashier since May 2024.", "Cashier since 07/2023.", "Cashier since Sept 2023."]) {
    const msgs = await summaryMessages(dir, s);
    expect([s, msgs.length, msgs[0]?.startsWith("The date")]).toEqual([s, 1, true]);
    expect(msgs.some((m) => m.startsWith("The number"))).toBe(false);
  }
  expect(await summaryMessages(dir, "Cashier since 06/2023.")).toEqual([]); // 6 and 2023 are not number claims either
  expect(englishYearMonths("Sep 2021 – Expected May 2027, 05/2024, marketing 2024").map((d) => `${d.year}-${d.month}`)).toEqual(["2021-09", "2027-05", "2024-05"]);
  expect([...R.numbers(normEnglish("05/2024 and Q3 2024"))]).toEqual([]);
});

test("英文日期：市場是台灣時完全照舊（May 2024 不查月份）", async () => {
  const dir = usFolder();
  write(dir, "jobhunt.yaml", read(dir, "jobhunt.yaml").replace(/^market:.*$/m, "market: tw"));
  expect(await summaryMessages(dir, "Cashier since Mar 2023.")).toEqual([]);
});

// ---------------------------------------------------------------- placeholders

test("英文佔位字：[Company Name]、[Your Name]、Lorem ipsum、TBD、XXX、Company Name 都算沒填完；一般句子不誤擋", async () => {
  const dir = usFolder();
  for (const s of ["Worked at [Company Name] as Cashier.", "Hello [Your Name].", "Lorem ipsum dolor sit amet.", "Started in TBD.", "Phone XXX-XXX.", "Company Name hired me.", "Left from {School Name}.", "Worked at <Job Title>."]) {
    const msgs = await summaryMessages(dir, s);
    expect([s, msgs.some((m) => m.includes("placeholder"))]).toEqual([s, true]);
  }
  for (const s of ["Updated the company name in the CRM.", "Wrote a [link](https://example.com) for the team.", "Taught Excel at the school."]) {
    expect([s, (await summaryMessages(dir, s)).filter((m) => m.includes("placeholder"))]).toEqual([s, []]);
  }
});

// ---------------------------------------------------------------- the US template

/** resume-us.html filled in by hand the way its notes say (sections replaced, Projects and Skills removed). */
function fillUs(tail = ""): string {
  let h = tplUs;
  const body = (title: string, html: string) => {
    h = h.replace(new RegExp(`(<h2>${title}</h2>)[\\s\\S]*?(\\n  </section>)`), `$1\n${html}$2`);
  };
  h = h.replace(/\{\{Full Name\}\}/g, "Jane Doe");
  h = h.replace(/<ul class="contact">[\s\S]*?<\/ul>/, `<ul class="contact">\n      <li>Austin, TX</li>\n      <li>(555) 555-0100</li>\n      <li>jane.doe@gmail.com</li>\n    </ul>`);
  h = h.replace(/<p class="summary">[^<]*<\/p>/, `<p class="summary">Cashier with campus experience.</p>`);
  body("Education", `    <div class="entry">\n      <div class="entry-head">\n        <div class="entry-title">State University<span class="role">B.A. in Communication</span></div>\n        <div class="entry-date">Aug 2021 – Expected May 2027</div>\n      </div>\n    </div>`);
  body(
    "Experience",
    `    <div class="entry">\n      <div class="entry-head">\n        <div class="entry-title">Campus Bookstore<span class="role">Cashier</span></div>\n        <div class="entry-date">Jun 2023 – Present</div>\n      </div>\n      <ul>\n${BULLETS.map((b) => `        <li>${b}</li>`).join("\n")}\n      </ul>\n    </div>\n` +
      `    <div class="entry">\n      <div class="entry-head">\n        <div class="entry-title">City Library<span class="role">Volunteer</span></div>\n        <div class="entry-date">Sep 2024 – Dec 2024</div>\n      </div>\n      <ul>\n        <li>Shelved books.</li>\n      </ul>\n    </div>`,
  );
  h = h.replace(/\n  <section class="block">\s*<h2>Projects &amp; Activities<\/h2>[\s\S]*?<\/section>\n/, "\n");
  h = h.replace(/\n  <section class="block">\s*<h2>Skills &amp; Certifications<\/h2>[\s\S]*?<\/section>\n/, "\n");
  h = h.replace("</main>", `${tail}</main>`);
  if (/\{\{/.test(h.replace(/<!--[\s\S]*?-->/g, ""))) throw new Error(`test filler left a slot: ${/\{\{[^}]*\}\}/.exec(h.replace(/<!--[\s\S]*?-->/g, ""))?.[0]}`);
  return h;
}

async function check(dir: string): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCheck(["check", ID], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

test("範本 resume-us.html：Letter、一頁提醒、沒有照片、沒有中文、電話是 555-01xx 的美國格式、聯絡方式是 City, State", () => {
  expect(tplUs).toContain('data-paper="letter"');
  expect(tplUs).toContain("@page { size: letter; margin: 0.6in; }");
  expect(tplUs).not.toMatch(/size:\s*A4/i);
  expect(tplUs).not.toContain("<img");
  expect(tplUs).not.toContain("photo.jpg");
  expect(tplUs).not.toMatch(/[　-鿿＀-￯]/); // no Chinese, no full-width characters anywhere
  expect(tplUs).not.toContain("+886");
  expect(tplUs).toContain("{{Phone, e.g. (555) 555-0100}}");
  expect(tplUs).toContain("{{City, State}}");
  expect(tplUs).not.toContain("Country");
  expect(tplUs).toContain("Save as PDF"); // English print hints
  expect(tplUs).toContain("A US resume should be one page");
  for (const h of ["Summary", "Education", "Experience", "Projects &amp; Activities", "Skills &amp; Certifications"]) expect(tplUs).toContain(`<h2>${h}</h2>`);
  expect(scriptsOf(tplUs).length).toBe(1);
});

test("範本 resume-us.html：照範本做的正確履歷檔 → 全部通過，範本認成「美國版」（看樣式，不用靠 template 欄位）", async () => {
  const dir = usFolder();
  write(dir, T, TARGET.replace("template: us\n", ""));
  write(dir, HTML, fillUs());
  const { code, out } = await check(dir);
  expect(out).toContain("All passed.");
  expect(code).toBe(0);
  expect(read(dir, `checks/${ID}.md`)).toContain("template: US Letter)");
  expect(templateFor(fillUs(), {}, "us")).toEqual({ kind: "us", how: "style" });
  expect(TEMPLATE_NAMES.us).toBe("美國版");
});

test("範本 resume-us.html：多一句沒確認過的話、範本以外的程式 → 沒通過", async () => {
  const dir = usFolder();
  write(dir, HTML, fillUs().replace("<li>Shelved books.</li>", "<li>Shelved books.</li>\n        <li>Ran the whole library.</li>"));
  let r = await check(dir);
  expect(r.code).toBe(1);
  expect(r.out).toContain("Ran the whole library.");
  write(dir, HTML, fillUs().replace(/<script>[\s\S]*?<\/script>/, "<script>alert(1)</script>"));
  r = await check(dir);
  expect(r.code).toBe(1);
  expect(r.out).toContain("There is a script the template does not have (<script>)");
});

test("美國版：履歷檔上任何 <img> 都是錯（連 photo.jpg 也是）；台灣市場的英文版照舊可以有 photo.jpg", async () => {
  const dir = usFolder();
  write(dir, HTML, fillUs('<img src="photo.jpg" alt="">\n'));
  const { code, out } = await check(dir);
  expect(code).toBe(1);
  expect(out).toContain("a US resume has no images");
  const html = fillUs('<img src="photo.jpg" alt="">\n');
  expect(oddMarkup(html, new Set(scriptsOf(tplUs)))).toEqual([]); // default = the Taiwan rule: photo.jpg is the one picture allowed
  expect(oddMarkup(html, new Set(scriptsOf(tplUs)), false)).toEqual(["有範本沒有的圖片（美國版履歷不放任何圖片，也不放照片）"]);
  expect(oddMarkup(fillUs('<img src="https://x.test/a.png">\n'), new Set(scriptsOf(tplUs)), false).length).toBe(1);
});

test("美國版：認不出範本時猜英文版，不猜深色抬頭；台灣版照舊猜深色抬頭", () => {
  const changed = fillUs().replace(/<style>[\s\S]*?<\/style>/, "<style>body{}</style>").replace('<html lang="en"', "<html");
  expect(templateFor(changed, {}, "us")).toEqual({ kind: "en", how: "guess" });
  expect(templateFor(changed, {})).toEqual({ kind: "tw", how: "guess" });
  expect(templateFor(changed, { template: "us" }, "us")).toEqual({ kind: "us", how: "field" });
  expect(templateFor(changed, { template: "us" }, "tw")).toEqual({ kind: "tw", how: "guess" }); // a Taiwan folder has no resume-us.html
  expect(templateFor(changed, { template: "fancy" }, "us")).toEqual({ kind: "en", how: "guess" });
});

test("範本 resume-us.html 印出來的字（標題）和英文版範本一樣，只有聯絡欄位的說明不同", () => {
  const en = readFileSync(join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-general", "templates", "resume-en.html"), "utf-8");
  const words = (h: string) => templateWords(h).sort();
  expect(words(tplUs)).toEqual(words(en));
});

// ---------------------------------------------------------------- workspace-us/jobhunt.yaml

test("workspace-us/jobhunt.yaml：language en、market us、paper letter；填充詞清單不和程式內建的重複", () => {
  const cfg: any = Bun.YAML.parse(readFileSync(join(US_KIT, "jobhunt.yaml"), "utf-8"));
  expect(marketFromConfig(cfg)).toEqual({ market: "us", language: "en", paper: "letter" });
  expect(cfg.language).toBe("en"); // marketFromConfig fills these in by itself, so check the raw file too
  expect(cfg.paper).toBe("letter");
  expect(cfg.resume.paper).toBe("letter");
  const extra: string[] = cfg.resume.voice.extra_words;
  expect(extra).toEqual([
    "results-driven", "team player", "self-starter", "go-getter", "hardworking", "dynamic", "fast-paced", "passion for", "excellent communication skills",
  ]);
  const builtin = new R.Voice();
  for (const w of extra) expect([w, builtin.problems(`I am ${w}.`)]).toEqual([w, []]); // not already caught: no duplicates
  expect(extra).not.toContain("detail-oriented"); // can be backed by an event: the AI checks it by hand
});

test("workspace-us/jobhunt.yaml 放進資料夾：Results-driven、team player 被抓，detail-oriented 不被抓", async () => {
  const dir = usFolder();
  write(dir, "jobhunt.yaml", readFileSync(join(US_KIT, "jobhunt.yaml"), "utf-8"));
  for (const s of ["Results-driven cashier.", "A team player at the store.", "Fast-paced store.", "Passion for service."]) {
    const msgs = await summaryMessages(dir, s);
    expect([s, msgs.some((m) => m.includes("sounds like AI writing"))]).toEqual([s, true]);
  }
  expect((await summaryMessages(dir, "Detail-oriented cashier.")).filter((m) => m.includes("sounds like AI writing"))).toEqual([]);
});

// ---------------------------------------------------------------- review fixes (english.ts / visa.ts)

/** Problems in the summary when resume.yaml's last bullet is `extra` (a confirmed sentence), as `message` strings. */
async function summaryWithFact(extra: string, summary: string): Promise<string[]> {
  const dir = usFolder();
  // the base bullets say "Doubled ..." and "over 50", which would hide what is being tested: swap them for neutral ones
  const yaml = read(dir, "resume.yaml").replace(/Doubled newsletter signups to three hundred\./, "Sorted mail.").replace(/Trained over 50 new hires\./, "Sorted parcels.");
  write(dir, "resume.yaml", yaml.replace("        text: Shelved books.", `        text: ${JSON.stringify(extra)}`));
  return summaryMessages(dir, summary);
}
const numberMsgs = (msgs: string[]) => msgs.filter((m) => m.startsWith("The number"));

test("twice a week 不是 2x：事實裡有「twice a week」時，亂寫 Doubled 要被抓；「2 times a week」對「twice a week」不誤報", async () => {
  expect(numberMsgs(await summaryWithFact("Tutored students twice a week.", "Doubled newsletter signups."))).not.toEqual([]);
  expect(await summaryWithFact("Tutored students 2 times a week.", "Tutored students twice a week.")).toEqual([]);
  expect(await summaryWithFact("Tutored students twice as fast.", "Tutored students twice as fast.")).toEqual([]);
});

test("模糊數量：hundreds of / thousands of / dozens of 事實沒這樣說就抓，事實也這樣說就過", async () => {
  for (const s of ["Grew newsletter signups to hundreds of readers.", "Grew newsletter signups to thousands of readers.", "Trained dozens of new hires."])
    expect([s, numberMsgs(await summaryWithFact("Grew newsletter signups to 120.", s)).length]).toEqual([s, 1]);
  expect(await summaryWithFact("Grew newsletter signups to hundreds of readers.", "Grew newsletter signups to hundreds of readers.")).toEqual([]);
});

test("更多說法的「以上」：50-plus / 50 plus / upwards of 50 / in excess of 50 和 50+ 一樣要本人原話", async () => {
  for (const s of ["Trained 50-plus new hires.", "Trained 50 plus new hires.", "Trained upwards of 50 new hires.", "Trained in excess of 50 new hires."]) {
    const msgs = await summaryWithFact("Trained 50 new hires.", s);
    expect([s, msgs.filter((m) => m.includes(`You never said "over 50"`)).length]).toEqual([s, 1]);
  }
  expect(await summaryWithFact("Trained over 50 new hires.", "Trained 50-plus new hires.")).toEqual([]);
});

test("over 加一段時間不是「超過」：over 3 months 不誤報；over 200 hours 照樣當「超過」", async () => {
  expect(await summaryWithFact("Raised $5,000 in 3 months.", "Raised $5,000 over 3 months.")).toEqual([]);
  expect(await summaryWithFact("Raised $5,000 in 2 years.", "Raised $5,000 over 2 years.")).toEqual([]);
  const msgs = await summaryWithFact("Logged 200 hours.", "Logged over 200 hours.");
  expect(msgs.filter((m) => m.includes(`You never said "over 200"`)).length).toBe(1);
});

test("數字字加 and、十幾加 hundred：five hundred and twelve = 512、eleven hundred = 1100", async () => {
  expect(await summaryWithFact("Handled 512 tickets.", "Handled five hundred and twelve tickets.")).toEqual([]);
  expect(await summaryWithFact("Sold 1,100 tickets.", "Sold eleven hundred tickets.")).toEqual([]);
  expect(numberMsgs(await summaryWithFact("Sold 1,100 tickets.", "Sold eleven hundred and one tickets."))).not.toEqual([]);
});

test("$1.2B = $1.2 billion、20-percent = 20%", async () => {
  expect(await summaryWithFact("Managed a $1.2 billion fund.", "Managed a $1.2B fund.")).toEqual([]);
  expect(numberMsgs(await summaryWithFact("Managed a $1.2 billion fund.", "Managed a $2B fund."))).not.toEqual([]);
  expect(await summaryWithFact("Cut errors by 20%.", "Cut errors by 20-percent.")).toEqual([]);
});

test("[Company Name] 只報一次", async () => {
  const msgs = (await summaryMessages(usFolder(), "Managed [Company Name] accounts.")).filter((m) => m.includes("placeholder"));
  expect(msgs.length).toBe(1);
});

test("簽證字：Visa 是本人的雇主（resume.yaml 的 org）就不擋；不是雇主照擋", async () => {
  expect(visaWords("Interned at Visa.")).toEqual(["Visa"]);
  expect(visaWords("Interned at Visa.", ["Visa"])).toEqual([]);
  expect(visaWords("Applied for a visa extension at Visa.", ["Visa"])).toEqual(["visa"]);
  const dir = usFolder();
  write(dir, "resume.yaml", read(dir, "resume.yaml").replaceAll("Campus Bookstore", "Visa"));
  write(dir, HTML, fillUs().replaceAll("Campus Bookstore", "Visa"));
  expect((await check(dir)).out).toContain("All passed.");
  const other = usFolder();
  write(other, HTML, fillUs().replace("Shelved books.", "Shelved books for Visa."));
  expect((await check(other)).code).toBe(1);
});

test("簽證字：募款／社團的 sponsorship 不擋；要簽證擔保的 sponsorship 照擋", () => {
  for (const s of ["Secured sponsorships from local businesses.", "Secured sponsorship for the gala.", "Raised sponsorship for the club."]) expect([s, visaWords(s)]).toEqual([s, []]);
  for (const s of ["I will require sponsorship.", "Requires visa sponsorship.", "Need H-1B sponsorship now.", "Sponsorship required to work."])
    expect([s, visaWords(s).some((w) => /sponsorship/i.test(w))]).toEqual([s, true]);
});

test("簽證字：醫療編碼 CPT 前後都可以（ICD-10 and CPT、CPT-4、CPT®、Current Procedural Terminology (CPT)）；單獨的 CPT 照擋", () => {
  for (const s of ["CPT and ICD-10 coding", "ICD-10 and CPT", "ICD-10 or CPT coding", "CPT-4 codes", "CPT® codes", "Current Procedural Terminology (CPT)"])
    expect([s, visaWords(s)]).toEqual([s, []]);
  expect(visaWords("Authorized on CPT.")).toEqual(["CPT"]);
});
