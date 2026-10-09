// The guardrails, identical to the Python engine (jobhunt/resume/fact_check.py, voice_check.py, tailor.py,
// model.py). tests/parity/*.json holds shared cases that both test suites run, so the two can't drift apart.

// ---------------------------------------------------------------- numbers (fact_check.py)

// Boundaries are explicit (no \b): Python treats Chinese characters as word characters and JS doesn't, so \b
// made the two engines disagree on text like "2025/06加入".
const DATE = new RegExp(
  String.raw`(?<![A-Za-z0-9])(?:19|20)[0-9][0-9]\s?[–—-]\s?(?:(?:19|20)[0-9][0-9]|[0-9][0-9])(?![A-Za-z0-9])(?![-/.][0-9])|` +
  String.raw`(?<![A-Za-z0-9])(?:19|20)[0-9][0-9][-/.](?:0?[1-9]|1[0-2])(?:[-/.][0-9]{1,2})?(?![A-Za-z0-9])|` +
  String.raw`(?<![A-Za-z])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)[0-9][0-9](?![A-Za-z0-9])|` +
  String.raw`(?<![A-Za-z])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)[0-9][0-9](?![A-Za-z0-9])`, "gi");
// Chinese dates: 2024 年 3 月, 民國 113 年, 112 學年度, 3 月 5 日 (ROC years without 民國: 80–149 before 年/年度).
const ZH_DATE = new RegExp(
  String.raw`(?<![0-9.,])(?:(?:19|20)[0-9][0-9]|民國\s?[0-9]{2,3}|[89][0-9]|1[0-4][0-9])\s?(?:學年度|年度|年)(?:\s?[0-9]{1,2}\s?月(?:\s?[0-9]{1,2}\s?[日號])?)?|` +
  String.raw`(?<![0-9.,])(?:0?[1-9]|1[0-2])\s?月(?:\s?[0-9]{1,2}\s?[日號])?`, "g");
const NOT_CHENG = "(?![員功長為立績本果效交就熟品])";   // 成 as a unit (三成 = 30%), not 成員 / 成功 / 成長…
// A number may touch letters (TOEIC900, NT300000, Top3, 300K): only digits and "." next to it end it.
const NUM = new RegExp(String.raw`(?<![0-9.])([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(\s?[百千萬億]+|k(?![A-Za-z]))?` +
  String.raw`(\s?(?:%|percent(?![A-Za-z0-9])|x(?![A-Za-z0-9])|×|-fold(?![A-Za-z0-9])|倍|成${NOT_CHENG}))?(?![0-9])`, "gi");
const YEAR = /^(19[9]\d|20[0-3]\d)$/;
const SHIFT = { 百: 2, 千: 3, 萬: 4, 億: 8, k: 3, K: 3 };
// Characters nobody sees on screen or paper, but that split a word or a number for a checker (and get pasted into 104).
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g;
const NO_DOT = /(?<![A-Za-z])No\.\s?(?=[0-9])/gi;   // No.1
const FAN_BEI = /翻了?一?倍/g;                     // 業績翻倍 = 2x

export const PRINTED = ["summary", "skills_order", "bullet_overrides"];

// Chinese numerals: 五十 → 50, 兩萬三千 → 23,000, 三成 → 30%, 百分之二十 → 20%, 二〇二四年 → 2024年.
const ZH_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNIT = { 十: 10, 百: 100, 千: 1000, 萬: 10000, 億: 100000000 };
const ZH_RUN = /[零〇一二三四五六七八九兩十百千萬億]+/g;
// A lone numeral only counts as a number before one of these (三位、兩年、五成). 月 and 日 are left out (三月 is a date),
// 分 too (十分 = very).
const COUNTER_WORDS = String.raw`位|個|人|名|次|家|間|場|件|份|項|年|天|週|周|小時|元|塊|組|篇|本|張|台|臺|輛|種|門|堂|所|隻|條|筆|則|歲|屆|隊|班|頁|字|分鐘|秒|公斤|公里|坪|箱|包|杯|單|通|支|封|季|部|套|檔|期|批|趟|輪|科|倍|%|成${NOT_CHENG}`;
const COUNTER = new RegExp(String.raw`^\s?(?:${COUNTER_WORDS})`);
const YEAR_COUNTER = new RegExp(String.raw`^\s?(?!年)(?:${COUNTER_WORDS})`);   // 2000 筆 is a count (2000 年 is a date)
const ZH_PERCENT = /百分之\s?([零〇一二三四五六七八九兩十百千]+|[0-9]+(?:\.[0-9]+)?)/g;
const ZH_CHENG_DIGIT = new RegExp(String.raw`([一二三四五六七八九])成([一二三四五六七八九])(?![零〇一二三四五六七八九兩十百千萬億])(?!\s?(?:位|個|人|名|次|家|間|場|件|份|項|年|天))`, "g");
// ①② and (1) (2) are list markers, not numbers — unless a counter follows (⑳位、(30)位).
const CIRCLED = new RegExp(String.raw`[\u2460-\u24ff\u2776-\u2793](?!\s?(?:${COUNTER_WORDS}))`, "g");

const LIST_MARK = new RegExp(String.raw`\([0-9]{1,2}\)(?!\s?(?:${COUNTER_WORDS}))|^[ \t]*[0-9]{1,2}[.、)](?=[ \t]|[^\x00-\x7f])`, "gm");   // (1), "1. " at a line start
const WAN_QIAN = /(?<![0-9.,])([0-9]+)\s?萬\s?([0-9])\s?千/g;   // 3萬2千 = 32000

const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Value of a Chinese numeral: 五十 → 50, 兩萬三千 → 23000, 三百五 → 350, 一百零五 → 105, 十五 → 15. */
export function zhNumber(run) {
  let big = 0, section = 0, digit = 0;
  for (const c of run) {
    if (c in ZH_DIGIT) digit = ZH_DIGIT[c];
    else {
      const u = ZH_UNIT[c];
      if (u === 100000000) { big = ((big + section + digit) || 1) * u; section = 0; }
      else if (u === 10000) { big += ((section + digit) || 1) * u; section = 0; }
      else section += (digit || 1) * u;
      digit = 0;
    }
  }
  // 三百五 = 350, 兩萬五 = 25000: a last digit right after 百/千/萬 means one step down
  const chars = [...run];
  const before = chars.length > 1 ? chars[chars.length - 2] : "";
  if (digit && ZH_UNIT[before] >= 100) digit *= ZH_UNIT[before] / 10;
  return big + section + digit;
}

/** Rewrite Chinese numerals as digits (only where they read as numbers); approximations like 三四十 go to `approx`. */
function zhToDigits(text, approx) {
  return text.replace(ZH_RUN, (run, offset, str) => {
    const before = str.slice(0, offset), after = str.slice(offset + run.length);
    if (/[0-9]\s?$/.test(before)) return run;                   // 1.2 萬: the Arabic number owns the 萬
    const counter = COUNTER.test(after);
    if (run === "一") {                                          // 一起、一次、每一位 are words, not counts
      const ok = /^\s?(?:倍|成)/.test(after) || (before.endsWith("第") && /^\s?(?:名|$|[。、!,.;)」』\s])/.test(after));
      return ok ? "1" : run;                                     // 第一名、業績第一。 (not 第一次、第一線)
    }
    if (run === "零" && /^\s?(?:客訴|失誤|缺勤|錯誤|差錯|遲到|事故|投訴|退貨|誤差)/.test(after)) return "0";   // 零客訴
    if (/[十百千萬億]$/.test(run) && /^[幾多餘來]/.test(after)) { approx.push(run + after[0]); return " "; }   // 十幾、百餘
    if (/^[十百千萬億]+$/.test(run)) {
      if (!counter && /[上破近逾超數幾]$/.test(before)) { approx.push(before.slice(-1) + run); return " "; }   // 破千萬、好幾百
      if (run.length > 1 && /^\s?[元預營業額]/.test(after)) return commas(zhNumber(run));                  // 百萬預算
    }
    const compound = /[零〇一二三四五六七八九兩][十百千萬億]|^十[一二三四五六七八九]/.test(run);
    if (!counter && !compound) return run;                       // 十分、百貨、千萬、萬一
    if (/^[零〇一二三四五六七八九]+$/.test(run) && (run.length >= 3 || /[〇零]/.test(run)))
      return [...run].map((c) => ZH_DIGIT[c]).join("");          // 二〇二四 → 2024 (read digit by digit)
    if (/[一二三四五六七八九兩]{2}/.test(run)) { approx.push(run); return " "; }   // 三四十、一兩百: kept as written
    return commas(zhNumber(run));                                // commas: 兩千 is a count, never a year
  });
}

/** "12" shifted k decimal places: shift("1.2", 4) = "12000"; trailing zeros after a point dropped. */
function shift(num, k) {
  let [i, f = ""] = num.split(".");
  if (k) {
    if (f.length <= k) { i = i + f + "0".repeat(k - f.length); f = ""; }
    else { i = i + f.slice(0, k); f = f.slice(k); }
    i = i.replace(/^0+(?=\d)/, "");
  }
  f = f.replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

/** Numbers in text, without dates and years: "40%", "3x", "5.4", "1000"; Chinese too: 三成 → "30%", 五十 → "50". */
export function numbers(text) {
  const out = new Set(), approx = [];
  // ，is never a thousands separator in Chinese; NFKC would turn it into "," and glue "3，500" together
  let t = String(text).replace(INVISIBLE, "").replace(CIRCLED, " ").replace(/，/g, "、").normalize("NFKC").replace(/一成不變/g, " ");
  t = t.replace(ID_NUMBER, " ").replace(ID_OLD, " ").replace(NO_DOT, "No ");   // ID numbers are a problem of their own
  t = t.replace(LIST_MARK, " ").replace(WAN_QIAN, (_, a, b) => commas(Number(a) * 10000 + Number(b) * 1000));
  t = t.replace(/百分百/g, "100%").replace(FAN_BEI, " 2倍");
  t = t.replace(ZH_PERCENT, (_, n) => `${/[0-9]/.test(n) ? n : commas(zhNumber(n))}%`);
  t = t.replace(ZH_CHENG_DIGIT, (_, a, b) => `${ZH_DIGIT[a]}${ZH_DIGIT[b]}%`);
  t = zhToDigits(t, approx);
  const clean = t.replace(DATE, " ").replace(ZH_DATE, " ");
  for (const m of clean.matchAll(NUM)) {
    const raw = m[1], mag = (m[2] || "").trim(), unit = (m[3] || "").trim().toLowerCase();
    if (YEAR.test(raw) && !mag && !unit && !YEAR_COUNTER.test(clean.slice(m.index + m[0].length))) continue;
    let k = [...mag].reduce((a, c) => a + SHIFT[c], 0);
    if (unit === "成") k += 1;
    const num = shift(raw.replace(/,/g, ""), k);
    out.add(num + (["%", "percent", "成"].includes(unit) ? "%" : ["x", "×", "-fold", "倍"].includes(unit) ? "x" : ""));
  }
  for (const a of approx) out.add(a);
  return out;
}

export function strings(node) {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(strings);
  if (node && typeof node === "object") return Object.values(node).flatMap(strings);
  return [];
}

/** Keys that only label things (S-003, s001_a): their digits are not facts. */
export const MARKER_KEYS = ["id", "source", "sources"];

function factStrings(node) {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(factStrings);
  if (node && typeof node === "object")
    return Object.entries(node).filter(([k]) => !MARKER_KEYS.includes(k)).flatMap(([, v]) => factStrings(v));
  return [];
}

export function facts(resume) {
  return numbers(factStrings(resume).join("\n"));
}

/** Personal ID numbers: Taiwan ID card (A123456789), the new resident certificate (A823456789) and the old one
 * (two capital letters and 8 digits: FA12345678). */
const ID_NUMBER = /(?<![A-Za-z0-9])[A-Z][1289][0-9]{8}(?![0-9])/gi;
const ID_OLD = /(?<![A-Za-z0-9])[A-Z]{2}[0-9]{8}(?![0-9])/g;
export function idNumbers(text) {
  const t = String(text).replace(INVISIBLE, "").normalize("NFKC");
  return [...t.matchAll(ID_NUMBER), ...t.matchAll(ID_OLD)].sort((a, b) => a.index - b.index).map((m) => m[0].toUpperCase());
}

export function fields(target, names) {
  const out = [];
  for (const name of names) {
    const val = target[name];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) if (v) out.push([`${name}.${k}`, String(v)]);
    } else if (Array.isArray(val)) {
      for (const v of val) if (v) out.push([name, String(v)]);
    } else if (val) out.push([name, String(val)]);
  }
  return out;
}

/** {field: [numbers not found in resume]}; empty object = all backed. */
export function unsupported(target, resume, names = PRINTED) {
  const known = facts(resume);
  const out = {};
  for (const [name, text] of fields(target, names)) {
    const missing = [...numbers(text)].filter((n) => !known.has(n)).sort();
    if (missing.length) out[name] = [...new Set([...(out[name] || []), ...missing])];
  }
  return out;
}

// ---------------------------------------------------------------- plain voice (voice_check.py)

export const MAX_WORDS = 35;
export const MAX_CHARS = 60;   // Chinese sentences: characters (an English word or a number counts as one)
export const AI_WORDS = [
  "architect(?:ed|ing)", "engineered", "leverag(?:e|ed|es|ing)", "utiliz(?:e|ed|es|ing)", "robust(?:ly|ness)?",
  "proven", "extensive(?:ly)?", "expertise", "rigorous(?:ly)?", "spearhead(?:ed|ing)?", "cutting-edge",
  "state-of-the-art", "seamless(?:ly)?", "synerg(?:y|ies|istic)", "passionate", "successfully",
  "meticulous(?:ly)?", "showcas(?:e|ed|ing)", "delv(?:e|ed|ing)", "innovative", "holistic",
  "streamlin(?:e|ed|ing)", "pivotal", "transformative", "empower(?:ed|ing)?", "orchestrat(?:e|ed|ing)",
  "賦能", "打造", "致力於", "全方位", "無縫", "極致", "卓越", "熱忱", "充滿熱情", "成功地", "積極主動", "具備優秀",
];
const ENUM = /\(\d+\)/g;
// English: split after . ! ? when a capital follows. Chinese: split after 。！？ (not before a closing quote).
const SENT = /(?<=[.!?])\s+(?=[A-Z(])|(?<=[。！？])\s*(?=[^\s。！？」』）)\]])|(?<=[!?])\s*(?=[\u3400-\u9fff])/;
const CJK = /[\u3400-\u9fff]/;
const ASCII = /^[\x00-\x7f]*$/;

export function sentences(text) {
  return String(text).split(/\s+/).filter(Boolean).join(" ").split(SENT).filter(Boolean);
}

/** Length the long-sentence rule uses: Chinese → characters (no spaces; "Excel" or "2024" = 1); English → words. */
export function sentenceLength(s) {
  return CJK.test(s) ? [...s.replace(/\s+/g, "").replace(/[A-Za-z0-9]+/g, "a")].length : s.split(" ").length;
}

const isLong = (s) => sentenceLength(s) > (CJK.test(s) ? MAX_CHARS : MAX_WORDS);

export class Voice {
  constructor(extraWords = [], allowWords = []) {
    const allow = new Set(allowWords.map((w) => w.toLowerCase()));
    const words = [...AI_WORDS, ...extraWords].filter((w) => !allow.has(w.toLowerCase()));
    // English words need a boundary (not inside another word); Chinese words have none, so they match as-is.
    // Chinese words also match with spaces between the characters (打 造); plain words only, not patterns.
    const en = words.filter((w) => ASCII.test(w));
    const zh = words.filter((w) => !ASCII.test(w)).map((w) => (/[\\^$.*+?()[\]{}|]/.test(w) ? w : [...w].join("[ \\t]*")));
    const parts = [...(en.length ? [`(?<![A-Za-z0-9])(?:${en.join("|")})(?![A-Za-z0-9])`] : []), ...zh];
    this.ai = parts.length ? new RegExp(`(${parts.join("|")})`, "gi") : null;
  }

  /** Problem codes with details: [{code: "ai_word", word} | {code: "parens", n, sentence} | {code: "semicolon"}]. */
  problems(text, skills = false) {
    text = String(text).replace(INVISIBLE, "").normalize("NFKC");   // full-width （）；and letters count the same as half-width
    const out = this.ai ? [...text.matchAll(this.ai)].map((m) => ({ code: "ai_word", word: m[0] })) : [];
    if (skills) return out;
    for (const s of sentences(text)) {
      const n = (s.match(/\(/g) || []).length - (s.match(ENUM) || []).length;
      if (n > 1) out.push({ code: "parens", n, sentence: s.slice(0, 60) });
    }
    if (text.includes(";")) out.push({ code: "semicolon" });
    return out;
  }

  check(target, names = PRINTED) {
    const out = {};
    for (const [name, text] of fields(target, names)) {
      const found = this.problems(text, name.startsWith("skills_order"));
      if (found.length) (out[name] ||= []).push(...found);
    }
    return out;
  }
}

export function longSentences(text) {
  return sentences(text).filter(isLong).map((s) => s.slice(0, 60));
}

// ---------------------------------------------------------------- printed text (the local app: 104 fields, letters)

const SOURCE_LINE = /^[ \t]*來源[ \t]*[:：].*$/gm;
// Placeholders the AI forgot to fill: OO / OOO / O O / XX / xx、某某、◯◯ ○○ 〇〇 (not 二〇〇五)、＿＿、[公司名稱] 【姓名】
// （待補）、TODO / TBD、{{ and { {.
const PLACEHOLDER = new RegExp([
  String.raw`(?<![A-Za-z])(?:O(?:[ \t]?O)+|X{2,}|x{2,})(?![A-Za-z])`,
  "某某",
  "[\u25EF\u25CB]{2,}",
  "(?<![零〇一二三四五六七八九十])〇{2,}(?![零〇一二三四五六七八九十])",
  "_{2,}",
  String.raw`[\[【(〔「『<]\s*(?:你的|您的)?(?:姓名|名字|學校|科系|公司|職稱|職位|名稱|日期|電話|待補|待填|待確認)(?:名稱)?\s*[\]】)〕」』>]`,
  "(?<![A-Za-z])(?:TODO|TBD)(?![A-Za-z])",
  String.raw`\{\s*\{`,
].join("|"), "g");
const HAS_INVISIBLE = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/;

/** Text with the "來源：S-003" lines removed (they are notes for the user, never pasted). */
export function stripSources(text) {
  return String(text).replace(SOURCE_LINE, "").replace(/\n{2,}/g, "\n").trim();
}

/** Characters a form like 104 counts: everything except line breaks (an emoji is one). */
export function countChars(text) {
  return [...String(text)].filter((c) => c !== "\n" && c !== "\r").length;
}

/**
 * Every problem in a piece of printed text, checked against the confirmed resume:
 * {code: "numbers", numbers} | voice problems (ai_word / parens / semicolon) | {code: "long", sentence, length}
 * | {code: "id_number", text} | {code: "placeholder", text} | {code: "invisible"}. Empty list = OK. Source lines are ignored.
 * skills: true for a skills line (parentheses and sentence length don't apply).
 */
export function checkText(text, resume, { voice = new Voice(), skills = false } = {}) {
  const t = stripSources(text);
  const out = [];
  const known = facts(resume || {});
  const missing = [...numbers(t)].filter((n) => !known.has(n)).sort();
  if (missing.length) out.push({ code: "numbers", numbers: missing });
  out.push(...voice.problems(t, skills));
  const seen = t.replace(INVISIBLE, "").normalize("NFKC");
  if (!skills)
    for (const s of sentences(seen)) if (isLong(s)) out.push({ code: "long", sentence: s.slice(0, 60), length: sentenceLength(s) });
  for (const id of idNumbers(t)) out.push({ code: "id_number", text: id });
  for (const m of seen.matchAll(PLACEHOLDER)) out.push({ code: "placeholder", text: m[0] });
  if (HAS_INVISIBLE.test(t)) out.push({ code: "invisible" });
  return out;
}

/** Application answers (pasted into forms): same number and wording rules as the printed fields. */
export function checkAnswers(resume, target, voice = new Voice()) {
  const errs = [];
  for (const [field, nums] of Object.entries(unsupported(target, resume, ["application_answers"])))
    errs.push({ code: "numbers", field, numbers: nums });
  for (const [field, probs] of Object.entries(voice.check(target, ["application_answers"])))
    errs.push({ code: "voice", field, problems: probs });
  return errs;
}

// ---------------------------------------------------------------- job ids (util.py job_id)

/** "公司 職稱" → id: English letters/digits as before (cathay-hr-assistant); none → YYMMDD-NN; taken → -2, -3… */
export function jobId(text, existing = [], today = new Date()) {
  const taken = new Set(existing instanceof Set ? existing : Array.isArray(existing) ? existing : Object.keys(existing || {}));
  const base = String(text).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base) {
    let id = base, n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  }
  const d = typeof today === "string" ? today.slice(2, 10).replace(/-/g, "")
    : `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const re = new RegExp(`^${d}-([0-9]{2,})(?:-[0-9]+)?$`);
  const used = [...taken].map((id) => re.exec(id)).filter(Boolean).map((m) => Number(m[1]));
  return `${d}-${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- resume model (model.py)

export const SECTIONS = ["summary", "education", "experience", "projects", "skills"];
export const BULLET_SECTIONS = ["experience", "projects"];
export const TITLES = { summary: "Summary", education: "Education", experience: "Experience", projects: "Projects", skills: "Skills" };

export class RuleError extends Error {}

export function inVariant(node, variant) {
  const vs = node && node.variants;
  return !vs || !vs.length || vs.includes(variant);
}

/** List of problems with a resume object (empty = valid). */
export function validateResume(data) {
  const errs = [];
  if (!data || typeof data !== "object") return ["resume must be an object"];
  if (!(data.basics && data.basics.name)) errs.push("basics.name is required");
  const variants = data.variants || {};
  if (!Object.keys(variants).length) errs.push("define at least one variant");
  const seen = new Set();
  for (const sec of BULLET_SECTIONS) {
    (data[sec] || []).forEach((item, i) => {
      for (const b of item.bullets || []) {
        if (!b || typeof b !== "object" || !b.text) { errs.push(`${sec}[${i}] has a bullet without text`); continue; }
        if (b.id && seen.has(b.id)) errs.push(`bullet id '${b.id}' is used twice`);
        if (b.id) seen.add(b.id);
        for (const v of b.variants || []) if (!(v in variants)) errs.push(`bullet '${b.id || b.text.slice(0, 30)}' lists unknown variant '${v}'`);
      }
      for (const v of item.variants || []) if (!(v in variants)) errs.push(`${sec}[${i}] lists unknown variant '${v}'`);
    });
  }
  return errs;
}

export function variantSpec(data, variant) {
  const variants = data.variants || {};
  if (!(variant in variants)) throw new RuleError(`unknown variant '${variant}' (have ${Object.keys(variants).join(", ")})`);
  const spec = { ...(variants[variant] || {}) };
  spec.title ??= variant;
  spec.one_page ??= true;
  spec.major ??= Object.keys(variants).indexOf(variant) + 1;
  return spec;
}

export function bulletIndex(data) {
  const out = {};
  for (const sec of BULLET_SECTIONS)
    for (const item of data[sec] || [])
      for (const b of item.bullets || []) if (b.id) out[b.id] = [sec, item, b];
  return out;
}

const squash = (s) => String(s).split(/\s+/).filter(Boolean).join(" ");

/** resume + variant → the document a renderer draws (same shape as model.resolve). */
export function resolve(data, variant) {
  const spec = variantSpec(data, variant);
  const order = spec.sections || data.sections || SECTIONS;
  const titles = { ...TITLES, ...(data.section_titles || {}) };
  const out = { basics: structuredClone(data.basics), variant, title: spec.title, one_page: !!spec.one_page, sections: [] };
  for (const kind of order) {
    const sec = { kind, title: titles[kind] || kind };
    if (kind === "summary") {
      const s = data.summary || {};
      const text = typeof s === "object" ? (s[variant] ?? s.default) : s;
      if (!text) continue;
      sec.text = squash(text);
    } else if (kind === "education") {
      sec.items = (data.education || []).filter((e) => inVariant(e, variant)).map((e) => structuredClone(e));
    } else if (BULLET_SECTIONS.includes(kind)) {
      sec.items = (data[kind] || []).filter((it) => inVariant(it, variant)).map((it) => {
        const { bullets, variants, ...rest } = it;
        return { ...structuredClone(rest), bullets: (bullets || []).filter((b) => inVariant(b, variant)).map((b) => squash(b.text)) };
      });
    } else if (kind === "skills") {
      sec.lines = (data.skills || []).filter((l) => inVariant(l, variant)).map((l) => ({ label: l.label || "", items: [...(l.items || [])] }));
    }
    if ((sec.items && !sec.items.length) || (sec.lines && !sec.lines.length)) continue;
    out.sections.push(sec);
  }
  return out;
}

// ---------------------------------------------------------------- targets (tailor.py)

/** A copy of the resume with this target's choices applied. Throws RuleError. */
export function tailor(data, target) {
  const tid = target.id, variant = target.base_variant;
  if (!variant) throw new RuleError(`${tid}: base_variant is required`);
  variantSpec(data, variant);
  data = structuredClone(data);
  const index = bulletIndex(data);
  const order = Object.values(target.bullet_order || {}).flatMap((ids) => ids || []);
  const overrides = target.bullet_overrides || {};
  for (const bid of [...order, ...Object.keys(overrides)])
    if (!(bid in index)) throw new RuleError(`${tid}: unknown bullet id '${bid}' (known: ${Object.keys(index).sort().join(", ")})`);
  for (const bid of order) {
    const [, item, b] = index[bid];
    if (!(inVariant(item, variant) && inVariant(b, variant))) throw new RuleError(`${tid}: bullet '${bid}' is not in the '${variant}' variant`);
  }
  if (new Set(order).size !== order.length) throw new RuleError(`${tid}: a bullet id is listed twice in bullet_order`);
  for (const [bid, text] of Object.entries(overrides)) index[bid][2].text = squash(text);
  if (target.summary) {
    const s = data.summary;
    data.summary = { ...(s && typeof s === "object" ? s : { default: s }), [variant]: squash(target.summary) };
  }
  const listed = new Map(), projectOrder = [];
  for (const bid of order) {
    const [sec, item, b] = index[bid];
    if (!listed.has(item)) { listed.set(item, []); if (sec === "projects") projectOrder.push(item); }
    listed.get(item).push(b);
  }
  for (const item of data.experience || []) if (listed.has(item)) item.bullets = listed.get(item);
  if (projectOrder.length) { for (const item of projectOrder) item.bullets = listed.get(item); data.projects = projectOrder; }
  if (target.skills_order && target.skills_order.length) {
    data.skills = target.skills_order.map((line) => {
      const i = String(line).indexOf(":");
      const label = i < 0 ? "" : String(line).slice(0, i).trim(), items = i < 0 ? "" : String(line).slice(i + 1).trim();
      if (!label || !items) throw new RuleError(`${tid}: skills_order line needs 'Label: items': ${JSON.stringify(line)}`);
      return { label, items: [items.replace(/\.$/, "")] };
    });
  }
  return data;
}

/** Every reason a target can't be built — what `jobhunt check` / `build` would fail on. */
export function checkTarget(resume, target, voice = new Voice()) {
  const errs = [];
  if (!target || typeof target !== "object") return [{ code: "shape" }];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(target.id || ""))) errs.push({ code: "id", id: target.id });
  try { tailor(resume, target); } catch (e) { if (e instanceof RuleError) errs.push({ code: "tailor", message: e.message }); else throw e; }
  const missing = unsupported(target, resume);
  for (const [field, nums] of Object.entries(missing)) errs.push({ code: "numbers", field, numbers: nums });
  for (const [field, probs] of Object.entries(voice.check(target))) errs.push({ code: "voice", field, problems: probs });
  for (const key of ["gaps", "confirm"]) if (target[key] != null && !Array.isArray(target[key])) errs.push({ code: "list", field: key });
  return errs;
}

/** Bullet ids available in each variant (what a tailoring prompt may choose from). */
export function bulletMenu(data) {
  const index = bulletIndex(data), out = {};
  for (const v of Object.keys(data.variants || {}))
    out[v] = Object.entries(index).filter(([, [, item, b]]) => inVariant(item, v) && inVariant(b, v)).map(([id]) => id);
  return out;
}

/** Plain text of a resolved document, in reading order (what an ATS reads; hashed for version numbers). */
export function plainText(doc) {
  const b = doc.basics || {};
  const lines = [b.name, [b.location, b.phone, b.email, ...(b.links || []).map((l) => l.label || l.url)].filter(Boolean).join(" · ")];
  for (const s of doc.sections) {
    lines.push("", s.title.toUpperCase());
    if (s.kind === "summary") lines.push(s.text);
    for (const it of s.items || []) {
      const head = [it.school || it.org || it.name, it.role || it.degree].filter(Boolean).join(" — ");
      lines.push([head, it.location, it.dates].filter(Boolean).join(" | "));
      for (const d of it.details || []) lines.push(`• ${d}`);
      for (const t of it.bullets || []) lines.push(`• ${t}`);
    }
    for (const l of s.lines || []) lines.push(`${l.label}: ${l.items.join(", ")}`);
  }
  return lines.join("\n");
}
