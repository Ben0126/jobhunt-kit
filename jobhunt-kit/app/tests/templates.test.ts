// 履歷範本：深色抬頭（resume-tw.html，預設）、精緻單欄（resume-tw-classic.html）、英文版（resume-en.html）。
// 照每個範本做出來的正確履歷檔要通過；多一句沒確認過的話要被抓到。範本由 targets 的 template 決定，
// 沒寫就看履歷檔本身（make-resume-file.md 第 1 步第 7 點、第 5 步）。
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck, templateFor } from "../src/check.ts";
import { scriptsOf, templateWords } from "../src/htmltext.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const TEMPLATES = join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-general", "templates");
const tpl = (name: string) => readFileSync(join(TEMPLATES, name), "utf-8");
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
const edit = (dir: string, rel: string, from: string | RegExp, to: string) => {
  const before = read(dir, rel);
  const after = before.replace(from, to);
  if (after === before) throw new Error(`fixture edit did not apply: ${rel} ${from}`);
  write(dir, rel, after);
};

async function check(dir: string): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCheck(["check", ID], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

// ---------------------------------------------------------------- filling a template the way make-resume-file.md says

type Entry = { title: string; role?: string; date: string; bullets: string[] };
type Resume = {
  name: string;
  want?: string; // 希望職稱 (Chinese templates only)
  contact: Record<string, string>; // template slot → value; slots not listed are removed with their <li>
  summary: string;
  sections: Record<string, Entry[]>; // <h2> text as in the template → entries; sections not listed are removed
};

/** One template section filled: its entry block copied once per entry, slots replaced, unused parts removed. */
function fillSection(section: string, list: Entry[]): string {
  const block = /<div class="entry">[\s\S]*?\n    <\/div>/.exec(section)![0];
  const one = (e: Entry) => {
    let h = block.replace(/ *<!--[^>]*location[^>]*-->\n/, "").replace(/ *<div class="entry-sub">[^\n]*<\/div>\n/, "");
    h = h.replace(/(<div class="entry-title">)\{\{[^}]*\}\}/, `$1${e.title}`);
    h = e.role ? h.replace(/(<span class="role">)\{\{[^}]*\}\}/, `$1${e.role}`) : h.replace(/<span class="role">[^<]*<\/span>/, "");
    h = h.replace(/(<div class="entry-date">)\{\{[^}]*\}\}/, `$1${e.date}`);
    return e.bullets.length
      ? h.replace(/ *<li>\{\{[^}]*\}\}<\/li>\n/, e.bullets.map((b) => `        <li>${b}</li>\n`).join(""))
      : h.replace(/ *<!--[^>]*-->\n *<ul>[\s\S]*?<\/ul>\n/, "").replace(/ *<ul>[\s\S]*?<\/ul>\n/, "");
  };
  return section.replace(block, list.map(one).join("\n"));
}

function fill(template: string, r: Resume): string {
  let h = template.replace(/ *<!-- ===== 照片區塊開始[\s\S]*?照片區塊結束 ===== -->\n/, ""); // photo: false
  h = h.replace(/<section class="block">\s*<h2>([^<]*)<\/h2>[\s\S]*?<\/section>\n*/g, (sec, title: string) => {
    if (/^(自我介紹|Summary)$/.test(title)) return sec.replace(/\{\{[^}]*\}\}/, r.summary);
    const list = r.sections[title];
    return list?.length ? fillSection(sec, list) : "";
  });
  h = h.replace(/\{\{(?:姓名|Full Name)\}\}/g, r.name);
  h = r.want ? h.replace("{{希望職稱}}", r.want) : h.replace(/ *<!--[^>]*希望職稱[^>]*-->\n *<p class="want">[^\n]*\n/, "");
  h = h.replace(/ *<li>[^<\n]*\{\{([^}]*)\}\}<\/li>\n/g, (li, slot: string) => (slot in r.contact ? li.replace(`{{${slot}}}`, r.contact[slot]) : ""));
  if (/\{\{/.test(h.replace(/<!--[\s\S]*?-->/g, ""))) throw new Error(`test filler left a slot: ${/\{\{[^}]*\}\}/.exec(h)?.[0]}`);
  return h;
}

const SUMMARY = "中國文學系 2025-06 畢業，在好市多做過收銀員，2024-03 獲得月度優秀員工。";

const TW: Resume = {
  name: "李欣怡",
  want: "人資行政助理",
  contact: { 手機: "0922-555-666", Email: "xinyi@example.com", 居住縣市: "台中市" },
  summary: SUMMARY,
  sections: {
    學歷: [{ title: "逢甲大學", role: "中國文學系", date: "2021-09 – 2025-06", bullets: [] }],
    工作與社團經歷: [
      { title: "好市多", role: "收銀員", date: "2023-07 – 2025-05", bullets: ["顧客的小問題先處理，大的叫主管。", "收銀。", "2024-03 獲得月度優秀員工。"] },
    ],
  },
};

/** The fixture with its one real problem fixed (OO大學) and the target's `template` set (or left out). */
function folder(template?: string): string {
  const dir = copyFixture();
  dirs.push(dir);
  for (const rel of ["resume.yaml", "104/履歷欄位.md"]) edit(dir, rel, /OO大學/g, "逢甲大學");
  if (template) edit(dir, T, "photo: false", `photo: false\ntemplate: ${template}`);
  return dir;
}

// ---------------------------------------------------------------- Chinese: 深色抬頭 and 精緻單欄

for (const [file, kind, name] of [
  ["resume-tw.html", "tw", "深色抬頭"],
  ["resume-tw-classic.html", "tw-classic", "精緻單欄"],
] as const) {
  test(`${name}（${file}）：照範本做的正確履歷檔 → 全部通過`, async () => {
    const dir = folder(kind);
    write(dir, HTML, fill(tpl(file), TW));
    const { code, out } = await check(dir);
    expect(out).toContain("全部通過");
    expect(code).toBe(0);
    expect(read(dir, `checks/${ID}.md`)).toContain(`範本：${name}）`);
  });

  test(`${name}（${file}）：多一句沒確認過的話 → 沒通過，說出是哪一句`, async () => {
    const dir = folder(kind);
    const html = fill(tpl(file), TW).replace("<li>收銀。</li>", "<li>收銀。</li>\n        <li>協助店長安排新人訓練。</li>");
    write(dir, HTML, html);
    const { code, out } = await check(dir);
    expect(code).toBe(1);
    expect(out).toContain("履歷檔：這一句和 AI 準備的內容對不上");
    expect(out).toContain("協助店長安排新人訓練。");
  });

  test(`${name}（${file}）：範本的小字（標題、「手機」「希望職稱：」）不算對不上，但英文版範本的標題不行`, async () => {
    const dir = folder(kind);
    const html = fill(tpl(file), TW);
    expect(html).toContain("<h2>工作與社團經歷</h2>");
    write(dir, HTML, html.replace("<h2>學歷</h2>", "<h2>Education</h2>"));
    const { code, out } = await check(dir);
    expect(code).toBe(1);
    expect(out).toContain("履歷檔：這一句和 AI 準備的內容對不上（不是確認過的經歷，或履歷檔還沒照最新的內容重做）。原文：「Education」");
  });
}

test("兩個中文範本的頁數提醒：超過 1 頁就提醒（台灣履歷以 1 頁為目標），只提醒不擋", () => {
  for (const file of ["resume-tw.html", "resume-tw-classic.html"]) {
    const html = tpl(file);
    expect(html).toContain("if (pages > 1) {");
    expect(html).not.toContain("pages > 2");
    expect(html).toContain("台灣履歷以 1 頁為目標");
    expect(html).toContain("{{自我介紹，2 到 3 句");
  }
});

test("舊版範本（app/src/legacy）只多認一段舊的程式：印出來的字和現在的範本一樣，兩個中文範本的字也一樣", () => {
  const legacy = (n: string) => readFileSync(join(import.meta.dir, "..", "src", "legacy", n), "utf-8");
  const words = (h: string) => templateWords(h).sort();
  expect(words(legacy("resume-tw-2026-10-08.html"))).toEqual(words(tpl("resume-tw.html")));
  expect(words(tpl("resume-tw-classic.html"))).toEqual(words(tpl("resume-tw.html")));
  expect(words(legacy("resume-en-2026-10-08.html"))).toEqual(words(tpl("resume-en.html")));
  expect(scriptsOf(tpl("resume-tw-classic.html"))).toEqual(scriptsOf(tpl("resume-tw.html")));
});

// ---------------------------------------------------------------- which template

test("沒寫 template：看履歷檔本身的樣式認出是哪個範本", async () => {
  for (const [file, name] of [
    ["resume-tw.html", "深色抬頭"],
    ["resume-tw-classic.html", "精緻單欄"],
  ]) {
    const dir = folder();
    write(dir, HTML, fill(tpl(file), TW));
    const { code, out } = await check(dir);
    expect(out).toContain("全部通過");
    expect(code).toBe(0);
    expect(read(dir, `checks/${ID}.md`)).toContain(`範本：${name}）`);
  }
});

test("template 寫精緻單欄、範本檔不在所以改用深色抬頭（make-resume-file.md 第 5 步）→ 照檔案認，照樣通過", async () => {
  const dir = folder("tw-classic");
  write(dir, HTML, fill(tpl("resume-tw.html"), TW));
  const { code, out } = await check(dir);
  expect(out).toContain("全部通過");
  expect(code).toBe(0);
  expect(read(dir, `checks/${ID}.md`)).toContain("範本：深色抬頭）");
});

test("template 寫了不認得的樣式 → 沒通過，說只能用哪幾個", async () => {
  const dir = folder("fancy");
  write(dir, HTML, fill(tpl("resume-tw.html"), TW));
  const { code, out } = await check(dir);
  expect(code).toBe(1);
  expect(out).toContain("客製履歷：履歷樣式寫錯了，只能是深色抬頭（tw）、精緻單欄（tw-classic）或英文版（en）");
  expect(out).toContain("template: fancy");
});

test("樣式被改過（認不出範本）：照 template 欄位；欄位也沒寫就照語言", () => {
  const changed = fill(tpl("resume-tw-classic.html"), TW).replace("--accent: #1e3d63;", "--accent: #000;");
  expect(templateFor(changed, { template: "tw-classic" })).toEqual({ kind: "tw-classic", how: "field" });
  expect(templateFor(changed, {})).toEqual({ kind: "tw", how: "guess" });
  expect(templateFor(changed, { base_variant: "en" })).toEqual({ kind: "en", how: "guess" });
  for (const v of ["en-swe", "en_ops", "EN-Business"]) expect(templateFor(changed, { base_variant: v }), v).toEqual({ kind: "en", how: "guess" }); // several English versions
  for (const v of ["tw", "tw-sales", "english", "ent"]) expect(templateFor(changed, { base_variant: v }), v).toEqual({ kind: "tw", how: "guess" });
  expect(templateFor(changed, { template: "toString" })).toEqual({ kind: "tw", how: "guess" });
  expect(templateFor(fill(tpl("resume-tw-classic.html"), TW), { template: "tw" })).toEqual({ kind: "tw-classic", how: "style" });
});

test("中文履歷檔放了英文版範本的程式 → 沒通過（每個範本只認自己的程式）", async () => {
  const dir = folder("tw");
  // "<script>\n": the real script, not the words 「<script>」 in the notes to the AI
  const enScript = /<script>\n[\s\S]*?<\/script>/.exec(tpl("resume-en.html"))![0];
  write(dir, HTML, fill(tpl("resume-tw.html"), TW).replace(/<script>\n[\s\S]*?<\/script>/, enScript));
  const { code, out } = await check(dir);
  expect(code).toBe(1);
  expect(out).toContain("履歷檔：有範本沒有的程式（<script>）");
});

test("回歸：用 2026-10-08 舊版 resume-tw.html 做的履歷檔（測試資料夾裡那份）照樣通過", async () => {
  const dir = folder();
  edit(dir, HTML, /OO大學/g, "逢甲大學");
  expect(read(dir, HTML)).toContain("if (pages > 2) {"); // the old page tip
  const { code, out } = await check(dir);
  expect(out).toContain("全部通過");
  expect(code).toBe(0);
});

// ---------------------------------------------------------------- English

const EN_YAML = `
  - school: Feng Chia University
    degree: B.A. in Chinese Literature
    dates: "Sep 2021 – Jun 2025"
    details: []
    source: 學歷
    variants: [en]
`;
const EN_EXP = `
  - id: s001_en
    org: Costco
    role: Cashier
    dates: "Jul 2023 – May 2025"
    variants: [en]
    bullets:
      - id: s001_en_a
        text: Handled small customer issues myself and passed bigger ones to the supervisor.
        source: S-001
      - id: s001_en_b
        text: Named Employee of the Month in March 2024.
        source: S-001
`;

function enFolder(): string {
  const dir = folder();
  edit(dir, "resume.yaml", "    variants: [tw]\n# 例：\n#  - school", `    variants: [tw]\n${EN_YAML.slice(1)}# 例：\n#  - school`);
  edit(dir, "resume.yaml", "        source: S-001\n# 例：\n#  - id: pxmart", `        source: S-001\n${EN_EXP.slice(1)}# 例：\n#  - id: pxmart`);
  edit(dir, T, "base_variant: tw\nlang: zh-TW", "base_variant: en\nlang: en\ntemplate: en");
  edit(dir, T, /summary: >-\n  [^\n]*\n/, "summary: >-\n  Chinese Literature graduate with two years as a cashier at Costco.\n");
  edit(dir, T, "  s001: [s001_a, s001_b, s001_c]", "  s001_en: [s001_en_a, s001_en_b]");
  edit(dir, T, /answered:\n[\s\S]*?\napplication_answers/, 'answered:\n  - {q: "summary", a: 是, date: "2026-10-08"}\napplication_answers');
  return dir;
}

const EN: Resume = {
  name: "李欣怡",
  contact: { Email: "xinyi@example.com", "Phone, e.g. +886 912 345 678": "0922-555-666" },
  summary: "Chinese Literature graduate with two years as a cashier at Costco.",
  sections: {
    Education: [{ title: "Feng Chia University", role: "B.A. in Chinese Literature", date: "Sep 2021 – Jun 2025", bullets: [] }],
    Experience: [
      {
        title: "Costco",
        role: "Cashier",
        date: "Jul 2023 – May 2025",
        bullets: ["Handled small customer issues myself and passed bigger ones to the supervisor.", "Named Employee of the Month in March 2024."],
      },
    ],
  },
};

test("英文版（resume-en.html）：照範本做的正確履歷檔 → 全部通過", async () => {
  const dir = enFolder();
  write(dir, HTML, fill(tpl("resume-en.html"), EN));
  const { code, out } = await check(dir);
  expect(out).toContain("全部通過");
  expect(code).toBe(0);
  expect(read(dir, `checks/${ID}.md`)).toContain("範本：英文版）");
});

test("回歸：用 2026-10-08 舊版 resume-en.html（頁數提醒有 1% 寬限那版）做的英文履歷檔照樣通過", async () => {
  const dir = enFolder();
  const old = readFileSync(join(import.meta.dir, "..", "src", "legacy", "resume-en-2026-10-08.html"), "utf-8");
  expect(old).toContain("content > usable * 1.01");
  write(dir, HTML, fill(old, EN));
  const { code, out } = await check(dir);
  expect(out).toContain("全部通過");
  expect(code).toBe(0);
});

test("英文版（resume-en.html）：多一句沒確認過的話 → 沒通過；中文範本的「手機」也不行", async () => {
  const dir = enFolder();
  const html = fill(tpl("resume-en.html"), EN)
    .replace("<li>Named Employee", "<li>Trained new cashiers on the register.</li>\n        <li>Named Employee")
    .replace("<li>0922-555-666</li>", "<li>手機 0922-555-666</li>");
  write(dir, HTML, html);
  const { code, out } = await check(dir);
  expect(code).toBe(1);
  const off = "履歷檔：這一句和 AI 準備的內容對不上（不是確認過的經歷，或履歷檔還沒照最新的內容重做）。";
  expect(out).toContain(`${off}原文：「Trained new cashiers on the register.」`);
  expect(out).toContain(`${off}原文：「手機 0922-555-666」`);
});
