// 程式檢查（plan 第 10.1 節）：用 web/js/core/rules.js 的同一套防灌水規則，檢查
//   targets/<id>.yaml 會印出的欄位、resumes/<id>.html 上看得到的字、104/履歷欄位.md、jobs/<id>/104-apply.md，
// 結果寫進 checks/<id>.md（104 總履歷寫 checks/_104.md）的「## 程式檢查」一節。
// 命令列：jobhunt check [代號 ...] [--104] [--profiles] [--all]；全部通過結束碼 0，有問題 1，用法或資料夾不對 2。
import * as R from "../../web/js/core/rules.js";
import tplEn from "../../jobhunt/scaffold/workspace-general/templates/resume-en.html" with { type: "text" };
import tplTw from "../../jobhunt/scaffold/workspace-general/templates/resume-tw.html" with { type: "text" };
import tplTwClassic from "../../jobhunt/scaffold/workspace-general/templates/resume-tw-classic.html" with { type: "text" };
import tplUs from "../../jobhunt/scaffold/workspace-us/templates/resume-us.html" with { type: "text" };
// Templates as they were on 2026-10-08 (Chinese tip at 2 pages, English tip with 1% slack): resume files already made
// with them stay valid. Only their <script> differs from today's; the printed words are the same.
import tplTwOld from "./legacy/resume-tw-2026-10-08.html" with { type: "text" };
import tplEnOld from "./legacy/resume-en-2026-10-08.html" with { type: "text" };
import { copyText, isPasted, limitFor, type Paragraph, paragraphs, parse104, SOURCE_LINE, splitSources } from "./blocks104.ts";
import { replaceSection, SECTION, SECTION_EN } from "./checksfile.ts";
import { Folder, FolderError, looksLikeJobhuntFolder } from "./folder.ts";
import { englishYearMonths, EN_PLACEHOLDERS, factText, moreThanClaims, normEnglish, vagueAmounts } from "./english.ts";
import { extraIdMatches, replaceExtraIds, starMask } from "./ids.ts";
import { type Language, type Market, type MarketConfig, readMarket, readMarketSync, TW_DEFAULTS, unrecognisedLanguage } from "./market.ts";
import { marketForTarget, readMode, readModeSync, type MarketId } from "./mode.ts";
import { type CheckText, textFor } from "./check.text.ts";
import { maskVisaWords, visaWords } from "./visa.ts";
import {
  bodyLineProblem,
  canonSource,
  contactMatches,
  customUrlProblem,
  effectiveLimit,
  PROFILE_HEADER,
  PROFILE_SPECS,
  profileKind,
  type ProfileKind,
  backgroundLineOk,
  headlineSegmentOk,
  mdSection,
  profileFacts,
  resumeIndex,
  skillCodes,
  splitHeading,
  splitList,
} from "./profiles.ts";
import { leftoverSlots, oddMarkup, scriptsOf, stripComments, stylesOf, templateWords, visibleLines } from "./htmltext.ts";

/** detail: technical words for the AI (ids, parser errors) — in the checks file and the command line, not the UI. */
export type Problem = { where: string; message: string; quote?: string; detail?: string };

export type Block = {
  name: string; // 「中文自傳」「工作經歷・好市多」「應徵問答・問：…」
  text: string; // exactly what 「複製」 puts on the clipboard (no source lines)
  chars: number;
  limit: number | null;
  pasted: boolean; // false: pick from a list / leave empty / fill yourself — shown, never copied
  note: string;
  problems: Problem[];
  warnings?: Problem[]; // profiles only: limits from third-party sources (reported, never failing)
};

export type File104 = { file: string; label: string; blocks: Block[]; problems: Problem[] };

export type Item = {
  id: string;
  company: string;
  role: string;
  updated: string | null;
  hasTarget: boolean;
  hasHtml: boolean;
  photo: boolean;
  checked: string[]; // for the checks file (file names are fine there: the AI reads it)
  problems: Problem[]; // target + resume file + 104-apply, in that order (what the checks file lists)
  resumeProblems: Problem[]; // target + resume file only: what the resume page and its PDF button go by
  apply: File104 | null;
};

/** A US-kit profile text (profiles/*.md). linkedin.md and handshake.md are checked block by block (see checkProfileFile);
 * `warnings` are limits only third-party sources give: shown, but they do not fail the check. */
export type ProfileFile = { file: string; problems: Problem[]; warnings: Problem[]; blocks: Block[] };

/** `resumeData` (market us only; absent in a Taiwan folder): resume.yaml against the confirmed cards. */
export type Report = { checkedAt: string; items: Item[]; general: File104 | null; profiles: ProfileFile[]; resumeData?: Problem[]; problems: number; ok: boolean };

export const GENERAL_104 = "104/履歷欄位.md";
export const GENERAL_CHECKS = "checks/_104.md";
export const PROFILES_CHECKS = "checks/_profiles.md";

// ---------------------------------------------------------------- plain-language messages
// Every sentence a person reads is in check.text.ts (one table per jobhunt.yaml `language`); this file only picks one.

const CJK = /[㐀-鿿]/;
// Same shape as rules.js idNumbers, matched on the original text (full-width letters and digits too) so a quote
// keeps its own punctuation.
const ID_LIKE = /(?<![A-Za-z0-9Ａ-Ｚａ-ｚ０-９])[A-Za-zＡ-Ｚａ-ｚ][1289１２８９][0-9０-９]{8}(?![0-9０-９])/g;

/** Taiwan IDs keep their first two characters (A1********); SSN, SEVIS, A-number and China ID keep only the shape. */
export function maskId(s: string): string {
  return replaceExtraIds(s.replace(ID_LIKE, (m) => [...m].slice(0, 2).join("") + "*".repeat(8)), starMask);
}

/** A short piece of `text` around `needle` (whole text if short), one line, ID numbers masked. */
export function excerpt(text: string, needle?: string, width = 60): string {
  const t = maskId(String(text).replace(/\s+/g, " ").trim());
  if ([...t].length <= width) return t;
  const chars = [...t];
  let at = needle ? t.indexOf(maskId(needle)) : -1;
  if (at < 0) return chars.slice(0, width).join("") + "…";
  at = [...t.slice(0, at)].length;
  const from = Math.max(0, at - Math.floor(width / 3));
  const piece = chars.slice(from, from + width).join("");
  return (from > 0 ? "…" : "") + piece + (from + width < chars.length ? "…" : "");
}

function numberNeedle(text: string, n: string): string | undefined {
  const digits = n.replace(/[%x]$/, "");
  const t = text.normalize("NFKC").replace(/,/g, "");
  return t.includes(digits) ? digits : undefined;
}

/** One rules.js checkText problem → plain words + the piece of text it is about. */
function fromRule(p: any, text: string, T: CheckText): { message: string; quote: string } {
  switch (p.code) {
    case "numbers":
      return { message: T.numbersMissing(p.numbers), quote: excerpt(text, numberNeedle(text, p.numbers[0])) };
    case "ai_word":
      return { message: T.aiWord(p.word), quote: excerpt(text, p.word) };
    case "parens":
      return { message: T.parens(p.n), quote: excerpt(p.sentence ?? text) };
    case "semicolon":
      return { message: T.semicolon, quote: excerpt(text, text.includes("；") ? "；" : ";") };
    case "long":
      return CJK.test(p.sentence ?? "")
        ? { message: T.longChars(p.length, R.MAX_CHARS), quote: excerpt(p.sentence) }
        : { message: T.longWords(p.length, R.MAX_WORDS), quote: excerpt(p.sentence) };
    case "id_number":
      return { message: T.idLike(maskId(p.text)), quote: excerpt(text, p.text) };
    case "placeholder":
      return { message: T.placeholder(p.text), quote: excerpt(text, p.text) };
    case "invisible":
      return { message: T.invisible, quote: excerpt(text) };
    default:
      return { message: T.ruleDefault, quote: excerpt(text) };
  }
}

function tailorMessage(msg: string, T: CheckText, us: boolean): { message: string; detail?: string } {
  let m: RegExpExecArray | null;
  if ((m = /unknown bullet id '([^']+)'/.exec(msg))) return { message: T.tailorUnknownBullet, detail: T.tailorUnknownBulletDetail(m[1]) };
  if ((m = /bullet '([^']+)' is not in the '([^']+)' variant/.exec(msg)))
    return { message: T.tailorNotInVariant(us), detail: T.tailorNotInVariantDetail(m[1], m[2]) };
  if (/listed twice/.test(msg)) return { message: T.tailorTwice };
  if (/base_variant is required/.test(msg)) return { message: T.tailorNoBase(us) };
  if ((m = /unknown variant '([^']+)'/.exec(msg))) return { message: T.tailorUnknownVariant, detail: T.tailorUnknownVariantDetail(m[1]) };
  if (/skills_order line needs/.test(msg)) return { message: T.tailorSkillsLine, detail: msg.replace(/^.*?needs 'Label: items': /, "") };
  return { message: T.tailorFallback, detail: msg };
}

// ---------------------------------------------------------------- folder context

/** What a story file says under "## Sentence at confirmation (do not change)": `Title:` and the numbered sentences, or one
 * `Skills: a, b` line. Reading stops at the first blank line after them (the "Shown back" translation and notes come later). */
export type Confirmed = {
  title: string | null;
  /** `Org:` / `Dates:` lines of the block; undefined = the block has none (the file header's org / dates stand in for them) */
  org?: string;
  dates?: string;
  sentences: string[];
  skills: string[];
  /** the label of a `Label: items` skills line (Software, Languages ...) */
  label?: string;
  /** the section is there but not in the exact format */
  bad?: true;
};
type Story = { status: string; via: string; title: string; org: string; dates: string; /** "Your words" and "Numbers" sections as text; null = neither section is there */ said: string | null; conf?: Confirmed | null; zh?: ConfirmedZh | null } | null;

export function parseConfirmed(text: string): Confirmed | null {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^##\s+Sentence at confirmation/i.test(l.trim()));
  if (h < 0) return null;
  // The exact format (dig-experience.md section 6): the heading, a blank line, then ONE block of lines up to the next blank line.
  // The block is optional `Title:` / `Org:` / `Dates:` lines and numbered sentences, or a single `Label: items` line. Anything else in it (a note, a
  // "Confirmed by:" line, a sentence without a number) makes the section malformed: `bad`. Text after the block (the translation,
  // later notes) is not read.
  const block: string[] = [];
  for (const raw of lines.slice(h + 1)) {
    const l = raw.normalize("NFKC").trim();
    if (/^##\s/.test(l)) break;
    if (!l) {
      if (block.length) break;
      continue;
    }
    block.push(l);
  }
  const out: Confirmed = { title: null, sentences: [], skills: [] };
  const bad = (): Confirmed => ({ title: null, sentences: [], skills: [], bad: true });
  const labelOf = (l: string) => /^([A-Za-z][A-Za-z &/-]{0,40}):\s*(.*)$/.exec(l);
  let rest = block;
  const first = block.length ? labelOf(block[0]) : null;
  // leading `Title:` / `Org:` / `Dates:` lines, each at most once, in any order
  let meta = 0;
  while (rest.length) {
    const m = labelOf(rest[0]);
    const key = m ? m[1].toLowerCase() : "";
    if (!m || !(key === "title" || key === "org" || key === "dates") || out[key] != null) break;
    out[key] = norm(m[2]) as any;
    rest = rest.slice(1);
    meta++;
  }
  if (meta && (!rest.length || out.title === "")) return bad();
  if (rest.length === 1 && !meta && first && !/^(title|org|dates|shown back)/i.test(first[1])) {
    out.skills.push(...splitList(first[2]));
    out.label = norm(first[1]);
    return out.skills.length ? out : bad();
  }
  for (const l of rest) {
    const num = /^[0-9]+[.)]\s+(.+)$/.exec(l);
    if (!num) return bad();
    out.sentences.push(norm(num[1]));
  }
  return out.sentences.length ? out : bad();
}
/** "## 中文確認時的句子（不能改）": the Chinese layer of a story in a folder that looks for work in the US and Taiwan
 * (playbooks/taiwan.md). Optional 職稱／機構／日期 lines, then numbered sentences, up to the first blank line after them. */
export type ConfirmedZh = { title: string | null; org: string | null; dates: string | null; sentences: string[]; bad?: true };
export function parseConfirmedZh(text: string): ConfirmedZh | null {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^##\s+中文確認時的句子/.test(l.trim()));
  if (h < 0) return null;
  const out: ConfirmedZh = { title: null, org: null, dates: null, sentences: [] };
  const KEYS: Record<string, "title" | "org" | "dates"> = { 職稱: "title", 機構: "org", 日期: "dates" };
  let started = false;
  for (const raw of lines.slice(h + 1)) {
    const l = raw.normalize("NFKC").trim();
    if (/^##\s/.test(l)) break;
    if (!l) {
      if (started) break;
      continue;
    }
    started = true;
    const meta = /^(職稱|機構|日期)\s*[:：]\s*(.*)$/.exec(l);
    if (meta && !out.sentences.length) {
      out[KEYS[meta[1]]] = norm(meta[2]);
      continue;
    }
    const num = /^[0-9]+[.)、]\s*(.+)$/.exec(l);
    if (!num) return { title: null, org: null, dates: null, sentences: [], bad: true };
    out.sentences.push(norm(num[1]));
  }
  return out.sentences.length ? out : { ...out, bad: true };
}

/** A clause where the user says they do not know / did not write the number (so a number in it is not one they said). */
const NOT_SAID = /不知道|不清楚|不確定|不記得|don'?t know|do not know|not sure|don'?t remember|do not remember|made (?:that|it) up|friend wrote|朋友幫我寫|wasn'?t true|不對/i;
/** A Numbers line the AI wrote to record that a number was dropped, not said. */
const NUMBER_DROPPED = /dropped|not written|removed|discarded|don'?t know|do not know|unknown/i;
const CLAUSE_END = /[。！？；;，、]|[.!?,](?=\s|$)|(?<=[㐀-鿿])\s+(?=[㐀-鿿])/u;
/** The text under "## Your words" and "## Numbers ..." of a story file (what the user said, and the numbers recorded from it); null when the file has neither.
 * Not counted as said: the "Old resume text (...)" paragraph (the old resume's words; the user only vouched for them when confirmed_via is
 * self-attest), a Numbers line that says the number was dropped, and a clause where the user says they do not know the number. */
function saidOf(text: string, selfAttest = false): string | null {
  const out: string[] = [];
  let on = false;
  let found = false;
  let numbers = false;
  let old = false;
  for (const raw of text.split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(raw.trim());
    if (h) {
      on = /^(your words|numbers)\b/i.test(h[1].trim());
      numbers = /^numbers\b/i.test(h[1].trim());
      old = false;
      found ||= on;
      continue;
    }
    if (!on) continue;
    const t = raw.trim();
    if (!selfAttest) {
      if (/^Old resume text\s*\(/i.test(t)) old = true;
      // what they added in conversation (import-resume.md marks it "(added in conversation)", a helper's words "(helper said)")
      else if (/^Their words\b|\badded in conversation\b|\(helper said\)/i.test(t)) old = false;
      if (old) continue;
    }
    if (numbers && NUMBER_DROPPED.test(t)) continue;
    out.push(...t.split(CLAUSE_END).filter((c) => !NOT_SAID.test(c)));
  }
  return found ? out.join("\n") : null;
}
const nameKey = (s: unknown, dropBrackets: boolean) => {
  let t = norm(String(s ?? "")).toLowerCase();
  if (dropBrackets) t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  return t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
};
/** Employer / project names compared as words: no case, no punctuation, no (bracketed location). The card's side only; see sameName. */
const normName = (s: unknown) => nameKey(s, true);
/** Resume name against the card's name: equal as words once the card's own (bracketed location) is dropped. A bracket the resume adds
 * ("Bookstore (Amazon)") must already be in the card's name; it cannot bring in a new word. */
function sameName(res: unknown, card: unknown): boolean {
  if (!bracketsInCard(res, card)) return false;
  return nameKey(res, true) === nameKey(card, true);
}
/** A project name against the card's org. Equal, or (only when the card has no `Org:` line and the file header's org stands in) the org plus
 * words that are words of the card's own Title ("Volunteer, Food Drive" on a card titled Volunteer). Never a job-title word in the extras. */
function projectNameOk(res: unknown, cardOrg: unknown, explicit: boolean, titles: unknown[]): boolean {
  if (sameName(res, cardOrg)) return true;
  if (explicit || !bracketsInCard(res, cardOrg)) return false;
  const n = ` ${nameKey(res, true)} `;
  const o = nameKey(cardOrg, true);
  if (!o || !n.includes(` ${o} `)) return false;
  const extras = n.replace(` ${o} `, " ").split(" ").filter(Boolean);
  const own = new Set(titles.flatMap((t) => nameKey(t, true).split(" ")));
  const text = extras.join(" ");
  return extras.every((w) => own.has(w)) && !TITLE_WORDS.some((re) => new RegExp(re.source, re.flags).test(text));
}
function bracketsInCard(res: unknown, card: unknown): boolean {
  const full = ` ${nameKey(card, false)} `;
  for (const m of String(res ?? "").normalize("NFKC").matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)) {
    const k = nameKey(m[1] ?? m[2], false);
    if (k && !full.includes(` ${k} `)) return false;
  }
  return true;
}
/** Date ranges compared as written, with any dash or "to" as one dash and no spaces around it. */
const normDates = (s: unknown) =>
  norm(String(s ?? ""))
    .toLowerCase()
    .replace(/\s*(?:[–—―−~～-]|\bto\b|至|到)\s*/g, "-")
    .trim();
/** Job-title words a summary or headline may not use unless a confirmed card's `Title:` has them (plural too: Managers; abbreviations: CEO, VP, Mgr).
 * Lead and Head are read capitalised, or lowercase after team / shift / store ... or before "of" (the verb "lead", "head start" are not titles). */
const TITLE_WORDS = [
  /(?<![A-Za-z])(?:manager|director|supervisor|chief|president|founder|owner|captain|leader|chair(?:man|woman|person)?)s?(?![A-Za-z])/gi,
  /(?<![A-Za-z])(?:CEO|COO|CFO|CTO|CMO|CIO|VP|SVP|EVP|AVP|GM|Mgr|co-?founder)s?(?![A-Za-z])/gi,
  /(?<![A-Za-z])(?:Lead|Head)s?(?![A-Za-z])/g,
  /(?<=(?<![A-Za-z])(?:team|shift|crew|project|floor|store|group|section|student|sales)[ -]+)(?:lead|head)(?![A-Za-z])/gi,
  /(?<![A-Za-z])(?:lead|head)(?=\s+of(?![A-Za-z]))/gi,
];
/** Cyrillic / Greek letters that look like Latin ones, read as the Latin letter ("Mаnager" with a Cyrillic a is still Manager). */
const HOMOGLYPHS: Record<string, string> = Object.fromEntries(
  [..."аеорсхуіјѕһԁАВЕКМНОРСТХΑΒΕΗΙΚΜΝΟΡΤΧΥοντ"].map((c, i) => [c, [..."aeopcxyijshdABEKMHOPCTXABEHIKMNOPTXYovt"][i]]),
);
const deHomoglyph = (t: string) => t.replace(/[Ͱ-ϿЀ-ӿ]/g, (c) => HOMOGLYPHS[c] ?? c);
/** Arabic-Indic and Devanagari digits as 0-9, so the number checks read them. */
const asciiDigits = (t: string) => t.replace(/[٠-٩۰-۹०-९]/g, (c) => String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९".indexOf(c) % 10));
/** Straight quotes and one kind of space, so a pasted sentence is compared by its words. */
const normQ = (s: unknown) => norm(String(s ?? "")).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

const INVISIBLE = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g;
const YM = /(?<![0-9])((?:19|20)[0-9]{2})\s?(?:[-/.]|年)\s?(0?[1-9]|1[0-2])(?![0-9])/g; // 2024-03、2024/3、2024 年 3 月
const YEAR4 = /(?<![0-9])((?:19|20)[0-9]{2})(?![0-9])/g;
const ROC_YEAR = /民國\s?([0-9]{2,3})\s?年/g;
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
// 「連續 6 月」「每 3 月」: a count of months, not a date (with 個 it is already a counted number)
const MONTH_COUNT = /(?:連續|每|共|累計|長達|將近|超過|前後)\s?([0-9]+|[一二兩三四五六七八九十]+)\s?月/g;

// ---------------------------------------------------------------- resume templates
// targets/<id>.yaml `template` (make-resume-file.md 第 1 步第 7 點、第 5 步): tw (or none) = 深色抬頭, tw-classic = 精緻單欄,
// en = English, us = English on US Letter (workspace-us). A resume file may print only its own template's fixed words and run only its own template's script.

export type TemplateKind = "tw" | "tw-classic" | "en" | "us";
export const TEMPLATE_NAMES = textFor("zh-TW").templateNames as Record<TemplateKind, string>; // the Chinese names; the English ones: textFor("en")
type Template = { kind: TemplateKind; styles: Set<string>; scripts: Set<string>; words: string[] };

function template(kind: TemplateKind, versions: string[]): Template {
  return {
    kind,
    styles: new Set(versions.flatMap(stylesOf)),
    scripts: new Set(versions.flatMap(scriptsOf)),
    words: [...new Set(versions.flatMap(templateWords))],
  };
}

// Templates are compared with resume files line by line; normalise line endings like Folder.readText does.
const lf = (s: string) => s.replace(/\r\n?/g, "\n");
const TEMPLATES: Template[] = [template("tw", [tplTw, tplTwOld].map(lf)), template("tw-classic", [tplTwClassic].map(lf)), template("en", [tplEn, tplEnOld].map(lf)), template("us", [tplUs].map(lf))];
const byKind = (k: TemplateKind) => TEMPLATES.find((t) => t.kind === k)!;

/** A `template` value that exists in this market: `us` only in a US folder (a Taiwan folder has no resume-us.html),
 * and `tw` / `tw-classic` never in a US folder (those are the A4 Taiwan layouts). */
const validTemplate = (field: string, market: Market) =>
  Object.hasOwn(TEMPLATE_NAMES, field) && (field !== "us" || market === "us") && (market !== "us" || (field !== "tw" && field !== "tw-classic"));

/** The templates of a folder that looks in these markets (both: every template). */
export const templatesForMarkets = (markets: Market[]): TemplateKind[] => (Object.keys(TEMPLATE_NAMES) as TemplateKind[]).filter((k) => markets.some((m) => validTemplate(k, m)));

/** The templates a folder of this market has (never `us` in a Taiwan folder, never the A4 Taiwan ones in a US folder). */
export const templatesFor = (market: Market): TemplateKind[] => (Object.keys(TEMPLATE_NAMES) as TemplateKind[]).filter((k) => validTemplate(k, market));

/** The template a resume file was made from: the file's own <style> when it is exactly a template's, else the
 * target's `template`, else English when the target or the page is English, else 深色抬頭. The style wins over the
 * field because make-resume-file.md falls back to resume-tw.html when the chosen template file is missing.
 * In a US folder (market us) the last guess is English, never 深色抬頭. */
export function templateFor(html: string, target: any, market: Market = "tw"): { kind: TemplateKind; how: "style" | "field" | "guess" } {
  const styles = stylesOf(html);
  const hit = TEMPLATES.find((t) => styles.length > 0 && styles.every((s) => t.styles.has(s)));
  if (hit) return { kind: hit.kind, how: "style" };
  const field = String(target?.template ?? "").trim();
  if (validTemplate(field, market)) return { kind: field as TemplateKind, how: "field" };
  const en =
    /^en\b/i.test(String(target?.lang ?? "")) ||
    /^en(?:[-_]|$)/i.test(String(target?.base_variant ?? "")) || // en, en-swe, en_ops: several English versions, each with its own `major`
    /<html\b[^>]*\slang\s*=\s*["']?en\b/i.test(stripComments(html));
  return { kind: en || market === "us" ? "en" : "tw", how: "guess" };
}

const norm = (s: string) => String(s).normalize("NFKC").replace(/\s+/g, " ").trim();

class Context {
  market: MarketConfig = TW_DEFAULTS;
  /** Where this folder looks for work (me/mode.yaml, or the older folders' single market). */
  markets: MarketId[] = ["tw"];
  get both(): boolean {
    return this.markets.includes("us") && this.markets.includes("tw");
  }
  /** Run `fn` with the rules of market `m` (a folder that looks in both checks each target under its own market). */
  async withMarket<T>(m: Market, fn: () => Promise<T>): Promise<T> {
    if (this.market.market === m) return fn();
    const keep = this.market;
    this.market = { ...keep, market: m, paper: m === "us" ? "letter" : "a4" };
    try {
      return await fn();
    } finally {
      this.market = keep;
    }
  }
  /** The market a target is for: its own `market:` in a folder that looks in both (else its base_variant: en… is the US),
   * the folder's market otherwise. */
  targetMarket(target: any): Market {
    return marketForTarget(target, this.markets, this.market.market);
  }

  /** The sentences of this folder's language (jobhunt.yaml `language`). */
  get T(): CheckText {
    return textFor(this.market.language);
  }
  resume: any = {};
  resumeProblem: string | null = null;
  resumeDetail: string | undefined;
  voice: any = new R.Voice();
  facts = new Set<string>();
  /** market us: the confirmed numbers after English normalisation (number words, $1.2M, dates out), and the "N+" / "over N" claims the user made. */
  factsEn = new Set<string>();
  moreThanFacts = new Set<string>();
  years = new Set<string>();
  yearMonths = new Set<string>();
  profile = "";
  /** me/profile.md as written (line breaks kept), for the "## " sections */
  profileRaw = "";
  private stories = new Map<string, Story>();
  /** Names (org / title) of stories that are not confirmed and appear nowhere in the confirmed data. */
  draftNames: { code: string; name: string; status: string }[] = [];
  /** market us: the words of the `Title:` lines of confirmed cards (lower case), and me/profile.md "Work they want" (the roles they look for). */
  titleWords = new Set<string>();
  wantWords = new Set<string>();
  /** market us: employer, project, school, degree and skill strings of resume.yaml; a title word inside one of them ("Head Start") is not a claim */
  maskNames: string[] = [];
  /** Workplaces and activities in resume.yaml (not schools): a paragraph sourced only by 學歷 may not talk about them. */
  workNames: string[] = [];
  constructor(readonly folder: Folder) {}

  async load() {
    this.market = await readMarket(this.folder);
    const mode = await readMode(this.folder);
    this.markets = mode.markets.length ? mode.markets : [this.market.market];
    try {
      const r = await this.folder.readYaml("resume.yaml");
      if (r == null) this.resumeProblem = this.T.resumeMissing;
      else if (typeof r !== "object") this.resumeProblem = this.T.resumeBroken;
      else this.resume = r;
    } catch (e: any) {
      this.resumeProblem = this.T.resumeBroken;
      this.resumeDetail = firstLine(e);
    }
    try {
      const cfg: any = await this.folder.readYaml("jobhunt.yaml");
      const v = cfg?.resume?.voice ?? cfg?.voice;
      if (v && typeof v === "object") this.voice = new R.Voice(asList(v.extra_words), asList(v.allow_words));
    } catch {}
    try {
      this.profileRaw = (await this.folder.readText("me/profile.md")) ?? "";
      this.profile = norm(this.profileRaw);
    } catch {}

    this.facts = R.facts(this.resume);
    const all = R.strings(this.resume).join("\n").normalize("NFKC");
    for (const m of all.matchAll(YEAR4)) this.years.add(m[1]);
    for (const m of all.matchAll(ROC_YEAR)) this.years.add(String(Number(m[1]) + 1911));
    for (const m of all.matchAll(YM)) this.yearMonths.add(`${m[1]}-${m[2].padStart(2, "0")}`);
    if (this.market.market === "us") {
      for (const d of englishYearMonths(all)) this.yearMonths.add(`${d.year}-${d.month}`); // May 2024, 05/2024 in resume.yaml too
      const said = factText(this.resume);
      this.factsEn = new Set([...R.numbers(normEnglish(said)), ...vagueAmounts(said)]);
      for (const c of moreThanClaims(said)) this.moreThanFacts.add(c.n);
    }

    for (const n of this.folder.list("me/stories", "file")) {
      const m = /^(S-[0-9]+)\.md$/i.exec(n);
      if (m) await this.story(m[1].toUpperCase());
    }
    if (this.market.market === "us") {
      for (const s of this.stories.values()) if (s?.status === "confirmed" && s.conf?.title) for (const w of s.conf.title.toLowerCase().match(/[a-z]+/g) ?? []) this.titleWords.add(w.replace(/s$/, ""));
      for (const w of (mdSection(this.profileRaw, "Work they want") ?? "").toLowerCase().match(/[a-z]+/g) ?? []) this.wantWords.add(w.replace(/s$/, ""));
      const keep = (x: unknown) => {
        const v = norm(String(x ?? ""));
        if ([...v].length >= 3) this.maskNames.push(v);
      };
      for (const sec of R.BULLET_SECTIONS) for (const it of asArray(this.resume[sec])) [it?.org, it?.name].forEach(keep);
      for (const e of asArray(this.resume.education)) [e?.school, e?.degree].forEach(keep);
      for (const l of asArray(this.resume.skills)) [l?.label, ...asArray(l?.items)].forEach(keep);
      this.maskNames.sort((a, b) => b.length - a.length);
    }
    const schools = asArray(this.resume.education).map((e: any) => norm(String(e?.school ?? ""))).filter((x) => [...x].length >= 2);
    const confirmed = [
      norm(all),
      ...[...this.stories.values()].filter((s) => s?.status === "confirmed").flatMap((s) => [s!.title, s!.org].map(norm)),
    ].join("\n");
    for (const [code, s] of this.stories)
      if (s && s.status !== "confirmed")
        for (const name of new Set([s.org, s.title].map(norm)))
          if ([...name].length >= 2 && !confirmed.includes(name)) this.draftNames.push({ code, name, status: s.status });
    for (const sec of R.BULLET_SECTIONS)
      for (const item of asArray(this.resume[sec]))
        for (const name of [item?.org, item?.name].map((x) => norm(String(x ?? ""))))
          if ([...name].length >= 2 && !schools.some((sc) => sc.includes(name) || (this.market.market !== "us" && name.includes(sc)))) this.workNames.push(name); // US: "Northfield State University Bookstore" is a job, not the school
  }

  async story(code: string): Promise<Story> {
    if (this.stories.has(code)) return this.stories.get(code)!;
    let s: Story = null;
    try {
      const t = await this.folder.readText(`me/stories/${code}.md`);
      if (t != null) {
        const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(t);
        const fm: any = m ? Bun.YAML.parse(m[1]) : null;
        s = {
          status: String(fm?.status ?? "").trim(),
          via: String(fm?.confirmed_via ?? "").trim().toLowerCase(),
          title: String(fm?.title ?? ""),
          org: String(fm?.org ?? ""),
          dates: String(fm?.dates ?? ""),
          said: saidOf(t, String(fm?.confirmed_via ?? "").trim().toLowerCase() === "self-attest"),
          conf: parseConfirmed(t),
          zh: parseConfirmedZh(t),
        };
      }
    } catch {
      s = { status: "?", via: "", title: "", org: "", dates: "", said: null };
    }
    this.stories.set(code, s);
    return s;
  }

  /** market us: resume.yaml against each story's "Sentence at confirmation". Every bullet of an experience / project must name
   * an S- card and be one of the sentences of those cards (all of them, when it names several); the item's role must be the
   * Title of one of the cards its bullets (or the item itself) name, when any of them has a Title; a skills item must be on the
   * Skills line of the cards its line names; an education detail follows its card, or, when only Education is its source,
   * must be written under "## Education" in me/profile.md. A confirmed card that is named but has no section in the exact
   * format cannot be compared, which is an error too (the program must not skip the comparison). Unconfirmed cards are the
   * source checks' business. */
  async confirmedProblems(): Promise<Problem[]> {
    const out: Problem[] = [];
    if (this.market.market !== "us") return out;
    const where = this.T.resumeData;
    const T = this.T;
    // looking in both: the Chinese items (variants tw…) rest on the Chinese cards instead (confirmedZhProblems)
    const english = (it: any) => !this.both || !Array.isArray(it?.variants) || !it.variants.length || it.variants.some((v: unknown) => /^en(?:[-_]|$)/i.test(String(v)));
    const srcList = (o: any): string[] => {
      const src = o?.sources ?? o?.source;
      return (Array.isArray(src) ? src.map(String) : src ? splitSources(String(src), true) : []).map((c) => c.normalize("NFKC").trim()).filter(Boolean);
    };
    const sOf = (o: any): string[] => [...new Set(srcList(o).filter((c) => /^S-[0-9]+$/i.test(c)).map((c) => c.toUpperCase()))];
    const reported = new Set<string>();
    /** What the confirmed cards among `codes` say; `ok` = at least one card could be read (otherwise nothing to compare with). */
    const cards = async (codes: string[]) => {
      const r = { sentences: new Set<string>(), skills: new Set<string>(), labels: [] as string[], ok: false };
      for (const c of codes) {
        const s = await this.story(c);
        if (!s || s.status !== "confirmed") continue;
        if (!s.conf || s.conf.bad) {
          if (!reported.has(c)) out.push({ where, message: T.confirmedNoSection(c, !!s.conf) });
          reported.add(c);
          continue;
        }
        r.ok = true;
        s.conf.sentences.forEach((x) => r.sentences.add(normQ(x)));
        s.conf.skills.forEach((x) => r.skills.add(normQ(x)));
        if (s.conf.label) r.labels.push(s.conf.label);
      }
      return r;
    };
    // The keys an experience / project / education entry may have: anything else could carry a title or employer the checks never see.
    const ITEM_KEYS: Record<string, string[]> = {
      experience: ["id", "org", "role", "dates", "location", "bullets", "source", "sources", "variants"],
      projects: ["id", "name", "org", "role", "dates", "location", "bullets", "source", "sources", "variants"],
      education: ["id", "school", "degree", "dates", "location", "details", "source", "sources", "variants"],
    };
    // one place: "Taipei", "Columbus, OH", "Remote"; at most one comma. (No card records a location, so this is only a shape check.)
    const LOCATION = /^[\p{L}][\p{L} .'’-]{0,40}(?:,\s*[\p{L}][\p{L} .'’-]{0,40})?$/u;
    for (const sec of ["education", ...R.BULLET_SECTIONS])
      for (const item of asArray(this.resume[sec]).filter(english))
        if (item && typeof item === "object") {
          for (const k of Object.keys(item)) if (!ITEM_KEYS[sec].includes(k)) out.push({ where, message: T.resumeItemKey(k), quote: excerpt(norm(String(item.role ?? item.name ?? item.org ?? item.school ?? ""))) });
          if (norm(String(item.location ?? "")) && !LOCATION.test(norm(String(item.location)))) out.push({ where, message: T.resumeItemLocation, quote: excerpt(String(item.location)) });
        }
    for (const sec of R.BULLET_SECTIONS)
      for (const item of asArray(this.resume[sec]).filter(english)) {
        const itemCodes = sOf(item);
        const all = new Set<string>(itemCodes);
        for (const b of asArray(item?.bullets).filter((x: any) => x && typeof x === "object")) {
          const codes = sOf(b).length ? sOf(b) : itemCodes;
          if (!codes.length) {
            out.push({ where, message: T.confirmedBulletNoCard, quote: excerpt(String(b.text ?? "")) });
            continue;
          }
          codes.forEach((c) => all.add(c));
          const c = await cards(codes);
          if (c.ok && !c.sentences.has(normQ(b.text))) out.push({ where, message: T.confirmedBullet(codes.join(", ")), quote: excerpt(String(b.text ?? "")) });
        }
        if (!all.size) {
          out.push({ where, message: T.confirmedItemNoCard, quote: excerpt(norm(String(item?.role ?? item?.name ?? item?.org ?? ""))) });
          continue;
        }
        // Every card this entry rests on (named by the entry or by one of its bullets) has to agree with what the entry prints:
        // one card's sentences cannot sit under another card's employer, dates or title.
        const names = (sec === "projects" ? [item?.name, item?.org] : [item?.org]).map((x) => String(x ?? "")).filter((x) => norm(x));
        for (const code of all) {
          const s = await this.story(code);
          if (!s || s.status !== "confirmed" || !s.conf || s.conf.bad) continue; // confirmedNoSection (above) says why it cannot be compared
          const conf = s.conf;
          if (norm(String(item?.role ?? ""))) {
            if (conf.title == null) out.push({ where, message: T.confirmedRoleNoTitle(code), quote: excerpt(String(item.role)) });
            else if (normQ(conf.title) !== normQ(item.role)) out.push({ where, message: T.confirmedRole(code, conf.title), quote: excerpt(String(item.role)) });
          }
          // the card's Org: line, else the file header's org (the card the user saw carried the same org and dates)
          const cardOrg = conf.org ?? s.org;
          for (const name of names) {
            if (!normName(cardOrg)) out.push({ where, message: T.confirmedOrgNone(code), quote: excerpt(name) });
            else if (!(sec === "projects" ? projectNameOk(name, cardOrg, conf.org !== undefined, [conf.title, s.title]) : sameName(name, cardOrg)))
              out.push({ where, message: T.confirmedOrg(code, cardOrg), quote: excerpt(name) });
          }
          if (norm(String(item?.dates ?? ""))) {
            const cardDates = conf.dates ?? s.dates;
            if (!normDates(cardDates)) out.push({ where, message: T.confirmedDatesNone(code), quote: excerpt(String(item.dates)) });
            else if (normDates(cardDates) !== normDates(item.dates)) out.push({ where, message: T.confirmedDates(code, cardDates), quote: excerpt(String(item.dates)) });
          }
        }
      }
    for (const line of asArray(this.resume.skills)) {
      if (!line || typeof line !== "object") continue;
      const codes = sOf(line);
      if (!codes.length) {
        // a skills line must rest on a card of its own; Education / Job goals are not one
        if (asArray(line.items).some((x: unknown) => norm(String(x ?? "")))) out.push({ where, message: T.confirmedSkillNoCard, quote: excerpt(`${line.label ?? ""}: ${asArray(line.items).join(T.itemSep)}`) });
        continue;
      }
      const c = await cards(codes);
      if (!c.ok) continue;
      for (const it of asArray(line.items)) if (!c.skills.has(normQ(it))) out.push({ where, message: T.confirmedSkill(codes.join(", ")), quote: excerpt(String(it)) });
      if (c.labels.length && norm(String(line.label ?? "")) && !c.labels.some((l) => normQ(l).toLowerCase() === normQ(line.label).toLowerCase()))
        out.push({ where, message: T.confirmedSkillLabel(codes.join(", "), c.labels.join(" / ")), quote: excerpt(String(line.label)) });
    }
    // The numbers and years in a confirmed card's sentences are ones the user said: in the same card's "Your words" or "Numbers" (a year
    // may also be in the card's dates). (Only a consistency check: an AI that edits both the card and the resume to match is not caught here.)
    for (const [code, s] of this.stories) {
      if (!s || s.status !== "confirmed" || !s.conf || s.conf.bad) continue;
      const shown = asciiDigits([...s.conf.sentences, ...s.conf.skills].join("\n"));
      const said = asciiDigits(s.said ?? "");
      const have = new Set([...R.numbers(normEnglish(said)), ...vagueAmounts(said)]);
      const years = new Set(`${said}\n${s.conf.dates ?? s.dates}`.match(YEAR4) ?? []);
      const extra = [...new Set([...R.numbers(normEnglish(shown)), ...vagueAmounts(shown)])].filter((n) => !have.has(n)).sort();
      const extraYears = [...new Set(shown.match(YEAR4) ?? [])].filter((y) => !years.has(y) && !have.has(y) && !extra.includes(y)).sort();
      const all = [...extra, ...extraYears];
      if (all.length) out.push({ where, message: T.confirmedNumbers(code, all.join(", ")), quote: excerpt(s.conf.sentences.find((x) => all.some((n) => asciiDigits(x).includes(n))) ?? shown) });
    }
    // a summary in resume.yaml follows the same title-word rule as a target's summary
    for (const x of R.strings(this.resume.summary ?? "")) out.push(...this.titleWordProblems(x, where));
    const eduText = mdSection(this.profileRaw, "Education");
    for (const e of asArray(this.resume.education).filter(english)) {
      const details = asArray(e?.details).map((d: any) => (typeof d === "string" ? d : d?.text)).filter((d: unknown) => norm(String(d ?? "")));
      if (!details.length) continue;
      const codes = sOf(e);
      const c = codes.length ? await cards(codes) : null;
      for (const d of details) {
        const t = normQ(d);
        if (c) {
          if (c.ok && !c.sentences.has(t) && !c.skills.has(t)) out.push({ where, message: T.confirmedDetail(codes.join(", ")), quote: excerpt(String(d)) });
        } else if (!eduText || !eduText.includes(t.toLowerCase())) out.push({ where, message: T.confirmedDetailEdu, quote: excerpt(String(d)) });
      }
    }
    return dedupe(out);
  }

  /** Looking in both: every Chinese item of resume.yaml (variants tw…) against the "中文確認時的句子" of the cards it names, the
   * same way the English items are held to "Sentence at confirmation": each bullet is one of those sentences, the role is the
   * card's 職稱 and the employer its 機構 when the card has them. A named, confirmed card without a Chinese section is an error. */
  async confirmedZhProblems(): Promise<Problem[]> {
    const out: Problem[] = [];
    if (!this.both) return out;
    const where = this.T.resumeData;
    const T = this.T;
    const chinese = (it: any) => Array.isArray(it?.variants) && it.variants.length > 0 && it.variants.every((v: unknown) => !/^en(?:[-_]|$)/i.test(String(v)));
    const codesOf = (o: any): string[] => {
      const src = o?.sources ?? o?.source;
      const list = Array.isArray(src) ? src.map(String) : src ? splitSources(String(src), false) : [];
      return [...new Set(list.map((c) => c.normalize("NFKC").trim().toUpperCase()).filter((c) => /^S-[0-9]+$/.test(c)))];
    };
    const reported = new Set<string>();
    for (const sec of R.BULLET_SECTIONS)
      for (const item of asArray(this.resume[sec]).filter(chinese)) {
        const itemCodes = codesOf(item);
        const used = new Set<string>(itemCodes);
        for (const b of asArray(item?.bullets).filter((x: any) => x && typeof x === "object")) {
          const codes = codesOf(b).length ? codesOf(b) : itemCodes;
          codes.forEach((c) => used.add(c));
          const sentences = new Set<string>();
          let ok = false;
          for (const c of codes) {
            const st = await this.story(c);
            if (!st || st.status !== "confirmed") continue; // the source checks report drafts and missing cards
            if (!st.zh || st.zh.bad) {
              if (!reported.has(c)) out.push({ where, message: T.confirmedZhNoSection(c, !!st.zh) });
              reported.add(c);
              continue;
            }
            ok = true;
            st.zh.sentences.forEach((x) => sentences.add(normQ(x)));
          }
          if (ok && !sentences.has(normQ(b.text))) out.push({ where, message: T.confirmedZhBullet(codes.join(", ")), quote: excerpt(String(b.text ?? "")) });
        }
        for (const c of used) {
          const st = await this.story(c);
          if (!st || st.status !== "confirmed" || !st.zh || st.zh.bad) continue;
          if (st.zh.title && item?.role != null && norm(String(item.role)) && norm(String(item.role)) !== st.zh.title)
            out.push({ where, message: T.confirmedZhRole(c, st.zh.title), quote: excerpt(String(item.role)) });
          const name = norm(String(item?.org ?? item?.name ?? ""));
          if (st.zh.org && name && name !== st.zh.org) out.push({ where, message: T.confirmedZhOrg(c, st.zh.org), quote: excerpt(name) });
        }
      }
    return dedupe(out);
  }

  /** 學歷 / 求職方向 — in a US folder also Education / Job goals (exact case): sources that are not an experience. */
  isBackground(code: string): boolean {
    const c = code.normalize("NFKC").trim();
    return c === "學歷" || c === "求職方向" || ((this.market.market === "us" || this.markets.includes("us")) && (c === "Education" || c === "Job goals"));
  }

  /** Problems with one source list (「S-003、學歷」 or a bullet's source field). */
  async sourceProblems(codes: string[], where: string, quote: string): Promise<Problem[]> {
    const out: Problem[] = [];
    for (const raw of codes) {
      const c = raw.normalize("NFKC").trim();
      if (this.isBackground(c)) continue;
      if (!/^S-[0-9]+$/i.test(c)) {
        out.push({ where, message: this.T.sourceBad(c, this.market.market === "us"), quote });
        continue;
      }
      const s = await this.story(c.toUpperCase());
      if (!s) out.push({ where, message: this.T.sourceMissing(c), quote });
      else if (s.status === "confirmed") continue;
      else if (s.status === "draft") out.push({ where, message: this.T.sourceDraft(c), quote });
      else if (s.status === "deleted") out.push({ where, message: this.T.sourceDeleted(c), quote });
      else out.push({ where, message: this.T.sourceUnknown(c, s.status), quote });
    }
    return out;
  }

  /** One pasted paragraph (104 card or profile block): it has a source line, the sources are usable, and a paragraph that
   * rests only on 學歷 / 求職方向 (Education / Job goals) does not name a job or activity. */
  async paragraphProblems(p: Paragraph, where: string, sourceWord = this.T.sourceWord): Promise<Problem[]> {
    const out: Problem[] = [];
    const body = p.lines.filter((l) => !SOURCE_LINE.test(l)).join("\n");
    const quote = excerpt(p.lines.find((l) => !SOURCE_LINE.test(l)) ?? "");
    if (p.unsourced != null) out.push({ where, message: this.T.noSourceLine(sourceWord), quote: excerpt(p.unsourced) });
    if (p.sources) {
      out.push(...(await this.sourceProblems(p.sources, where, quote)));
      const onlyBackground = p.sources.every((c) => this.isBackground(c));
      const work = onlyBackground ? this.workNames.find((w) => norm(body).includes(w)) : undefined;
      if (work) out.push({ where, message: this.T.workMentioned(work, this.market.market === "us"), quote: excerpt(body, work) });
    }
    return out;
  }

  /** A text that names a story nobody confirmed (系學會 when S-002 is a draft), whatever its source line says. */
  mentionProblems(text: string, where: string): Problem[] {
    const t = norm(text);
    const out: Problem[] = [];
    const seen = new Set<string>();
    for (const d of this.draftNames)
      if (!seen.has(d.code) && t.includes(d.name)) {
        seen.add(d.code);
        out.push({ where, message: this.T.mentionStory(d.status === "deleted", d.name, d.code), quote: excerpt(text, d.name) });
      }
    return out;
  }

  /** market us: a summary, headline or opening may not use a job-title word (Manager, Lead, Director ...) that no confirmed card has in its
   * `Title:` line. Not counted: "the manager", "her manager", "manager's" (a person, not a title), and, in a "Seeking / Looking for" sentence,
   * a role word the user wrote in "Work they want" of me/profile.md. */
  titleWordProblems(text: string, where: string): Problem[] {
    if (this.market.market !== "us") return [];
    const out: Problem[] = [];
    const DET = "(?:the|her|his|their|my|our|its|your)";
    const stem = (w: string) => w.toLowerCase().replace(/s$/, "");
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim() || SOURCE_LINE.test(line)) continue;
      let t = deHomoglyph(line.replace(INVISIBLE, "").normalize("NFKC"));
      // an employer, school or skill that resume.yaml already has (confirmed) may contain a title word: "Head Start", "Meta Ads Manager"
      for (const n of this.maskNames) t = t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (x) => " ".repeat(x.length));
      const seekAt = [...t.matchAll(/(?<![A-Za-z])(?:seeking|looking\s+for|interested\s+in)(?![A-Za-z])/gi)].map((x) => x.index!);
      // the word is inside a "Seeking ... roles" clause: after the keyword, up to the next "|" , . ; or dash, or a word that starts another
      // statement (after, as, having ...), and it is followed within three words by roles / positions / jobs
      const inSeeking = (at: number, end: number) =>
        seekAt.some((s) => s < at && !/[|.;,—–]|(?<![A-Za-z])(?:after|as|having|former|previously|while|who)(?![A-Za-z])/i.test(t.slice(s, at))) &&
        /^[\s,/&-]*(?:[A-Za-z'’-]+[\s,/&-]+){0,3}(?:roles?|positions?|jobs?|opportunit(?:y|ies))(?![A-Za-z])/i.test(t.slice(end));
      const seen = new Set<number>();
      for (const re of TITLE_WORDS)
        for (const m of t.matchAll(re)) {
          const at = m.index!;
          const end = at + m[0].length;
          if (seen.has(at)) continue;
          seen.add(at);
          const w = stem(m[0]);
          if (this.titleWords.has(w) || (inSeeking(at, end) && this.wantWords.has(w))) continue;
          // a person, not a title: "reported to the manager", "with her shift supervisor", "the manager's request". Not "served as the
          // store manager", "promoted to her shift supervisor" (those claim the title).
          const before = t.slice(0, at);
          const ref = new RegExp(`(^|[.;:!?]\\s*|(?<![A-Za-z])(?:to|with|for|by|from|under|assisted|helped|supported|alongside))\\s*${DET}\\s+(?:[A-Za-z-]+\\s+)?$`, "i").exec(before);
          if (ref && !/(?<![A-Za-z])(?:promoted|promotion|advanced|moved\s+up|elevated|appointed|named|rose)\s+(?:to|as)\s*$/i.test(before.slice(0, ref.index + ref[1].length))) continue;
          if (/^['’]s(?![A-Za-z])/.test(t.slice(end))) continue;
          out.push({ where, message: this.T.titleWord(m[0]), quote: excerpt(t, m[0]) });
        }
    }
    return out;
  }

  /** Dates must be ones the confirmed data has (2019-07 when the job started 2023-07 is inflation). */
  dateProblems(text: string, where: string): Problem[] {
    const t = String(text).replace(INVISIBLE, "").normalize("NFKC");
    const out: Problem[] = [];
    const now = new Date().getFullYear();
    const okYear = (y: string) => this.years.has(y) || y === String(now) || y === String(now + 1);
    const spans: [number, number][] = [];
    if (this.market.market === "us")
      for (const d of englishYearMonths(t)) {
        spans.push([d.index, d.index + d.length]);
        if (!this.yearMonths.has(`${d.year}-${d.month}`))
          out.push({ where, message: this.T.dateMissing(d.text.replace(/\s+/g, " ")), quote: excerpt(text, d.text) });
      }
    for (const m of t.matchAll(YM)) {
      spans.push([m.index!, m.index! + m[0].length]);
      if (!this.yearMonths.has(`${m[1]}-${m[2].padStart(2, "0")}`))
        out.push({ where, message: this.T.dateMissing(m[0].replace(/\s+/g, "")), quote: excerpt(text, m[0]) });
    }
    const monthBefore = new RegExp(`(?:[-–—~～至到]|(?:${MONTHS})[a-z]*\\.?)\\s*$`, "i");
    for (const m of t.matchAll(YEAR4)) {
      const at = m.index!;
      if (spans.some(([a, b]) => at >= a && at < b)) continue;
      const dateLike = /^\s?(?:年|[-–—~～/.])/.test(t.slice(at + 4)) || monthBefore.test(t.slice(0, at));
      if (dateLike && !okYear(m[1])) out.push({ where, message: this.T.yearMissing(m[1]), quote: excerpt(text, m[1]) });
    }
    for (const m of t.matchAll(ROC_YEAR))
      if (!okYear(String(Number(m[1]) + 1911)))
        out.push({ where, message: this.T.yearMissing(m[0].replace(/\s+/g, "")), quote: excerpt(text, m[0]) });
    for (const m of t.matchAll(MONTH_COUNT)) {
      const n = /^[0-9]+$/.test(m[1]) ? String(Number(m[1])) : String(R.zhNumber(m[1]));
      if (!this.facts.has(n))
        out.push({ where, message: this.T.numbersMissing([n]), quote: excerpt(text, m[0]) });
    }
    return out;
  }

  /** Title / Company / School / Degree of a profile block are word for word the resume.yaml role (or project name), org, school, degree. */
  profileFieldProblems(block: string, meta: Record<string, string>, where: string): Problem[] {
    const out: Problem[] = [];
    const vals = (secs: string[], keys: string[]) =>
      new Set(secs.flatMap((sec) => asArray(this.resume[sec]).flatMap((x: any) => keys.map((k) => norm(String(x?.[k] ?? ""))))).filter(Boolean));
    const jobs = ["experience", "projects"];
    const rules: [string, Set<string>][] =
      block === "Education"
        ? [["School", vals(["education"], ["school"])], ["Degree", vals(["education"], ["degree"])]]
        : ["Experience", "Work Experience", "Organizations", "Projects"].includes(block)
          ? [["Title", vals(jobs, ["role", "name"])], ["Company", vals(jobs, ["org"])]]
          : [];
    for (const [key, allowed] of rules) {
      const v = norm(meta[key] ?? "");
      if (v && !allowed.has(v)) out.push({ where, message: this.T.fieldMismatch(key, v, this.T.fieldWhat[key]), quote: excerpt(v) });
    }
    return out;
  }

  /** checkText on each line (sentences never run across lines), as Problems. */
  textProblems(text: string, where: string, opts: { skills?: boolean; only?: string[]; visaCovered?: boolean } = {}): Problem[] {
    const out: Problem[] = [];
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim() || SOURCE_LINE.test(line)) continue; // 來源： / Source: lines are not text (rules.js only knows the first)
      // SSN, SEVIS, A-number, China ID (any market): personal data, reported before — and instead of — "invented numbers".
      // A Taiwan-shaped ID (A123456789 is also a valid A-number shape) stays rules.js's, with its own message.
      const tw = new Set(R.idNumbers(line));
      const ids = [...new Set(extraIdMatches(line))].filter((m) => !tw.has(m.toUpperCase()));
      let probe = line;
      if (ids.length) {
        if (!opts.only || opts.only.includes("id_number"))
          for (const id of ids) out.push({ where, message: this.T.personalId(maskId(id)), quote: excerpt(line, id) });
        probe = replaceExtraIds(line, (m) => (tw.has(m.toUpperCase()) ? m : " "));
      }
      const us = this.market.market === "us";
      for (const p of R.checkText(probe, this.resume, { voice: this.voice, skills: !!opts.skills })) {
        if (opts.only && !opts.only.includes(p.code)) continue;
        if (us && p.code === "numbers") continue; // read the English way below
        out.push({ where, ...fromRule(p, line, this.T) });
      }
      // opts.visaCovered: visaProblems reports the visa words of this text, so their digits ("F-1", "H-1B") are not "numbers" too.
      if (us) out.push(...this.englishProblems(probe, line, where, opts.only, opts.visaCovered ? maskVisaWords(probe, this.workNames) : probe));
      if (!opts.only || opts.only.includes("numbers")) out.push(...this.dateProblems(probe, where));
    }
    return out;
  }

  /** market us: numbers read the English way on both sides, "50+" only when the user said it, and English placeholders. */
  englishProblems(probe: string, line: string, where: string, only?: string[], numberProbe: string = probe): Problem[] {
    const out: Problem[] = [];
    if (!only || only.includes("numbers")) {
      const missing = [...new Set([...R.numbers(normEnglish(numberProbe)), ...vagueAmounts(probe)])].filter((n) => !this.factsEn.has(n)).sort();
      if (missing.length) out.push({ where, ...fromRule({ code: "numbers", numbers: missing }, line, this.T) });
      for (const c of moreThanClaims(probe))
        if (this.factsEn.has(c.n) && !this.moreThanFacts.has(c.n))
          out.push({
            where,
            message: this.T.moreThan(c.quote, c.n),
            quote: excerpt(line, c.quote),
          });
    }
    if (!only || only.includes("placeholder")) {
      const seen: [number, number][] = []; // "[Company Name]" also contains "Company Name": report it once
      for (const re of EN_PLACEHOLDERS)
        for (const m of probe.matchAll(re)) {
          const [a, b] = [m.index!, m.index! + m[0].length];
          if (seen.some(([x, y]) => a >= x && b <= y)) continue;
          seen.push([a, b]);
          out.push({ where, ...fromRule({ code: "placeholder", text: m[0] }, line, this.T) });
        }
    }
    return out;
  }

  /** US kit: visa and work-authorization words may not appear on the resume file or in profiles/*.md (src/visa.ts). */
  visaProblems(text: string, where: string): Problem[] {
    if (this.market.market !== "us") return [];
    return visaWords(text, this.workNames).map((w) => ({
      where,
      message: this.T.visaWord(w),
      quote: excerpt(text, w),
    }));
  }
}

function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function firstLine(e: any): string {
  return String(e?.message ?? e).split(/\r?\n/)[0].slice(0, 80);
}

function dedupe(ps: Problem[]): Problem[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = `${p.where}\n${p.message}\n${p.quote ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- the three kinds of files


/** Split a skills line into items at 、 , ， — but not inside brackets: 「Excel（加總、篩選、簡單表格）」 is one item. */
export function splitSkillItems(text: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "（" || ch === "(") depth++;
    else if ((ch === "）" || ch === ")") && depth > 0) depth--;
    if (depth === 0 && (ch === "、" || ch === "," || ch === "，")) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Every skills_order item must be a skills item of resume.yaml whose line has confirmed sources
 * (tailor-resume.md: 「每一項要和 resume.yaml 的 skills 一字不差」). */
async function skillsProblems(ctx: Context, target: any, where: string): Promise<Problem[]> {
  const out: Problem[] = [];
  const v = target.base_variant;
  const lines = asArray(ctx.resume.skills).filter((l: any) => l && typeof l === "object" && R.inVariant(l, v));
  const sourcesOf = (l: any) => asArray(l.sources ?? (l.source != null ? [l.source] : [])).map(String);
  const checked = new Set<any>();
  const checkLine = async (l: any, quote: string) => {
    if (checked.has(l)) return;
    checked.add(l);
    const codes = sourcesOf(l);
    if (!codes.length) out.push({ where, message: ctx.T.skillsNoSource(l.label ?? ""), quote });
    else out.push(...(await ctx.sourceProblems(codes, where, quote)));
  };
  if (Array.isArray(target.skills_order) && target.skills_order.length) {
    for (const raw of target.skills_order) {
      const line = String(raw ?? "");
      const i = line.indexOf(":");
      if (i < 0) continue; // the format problem is reported by tailor
      for (const raw of splitSkillItems(line.slice(i + 1).replace(/\.$/, ""))) {
        const item = norm(raw);
        if (!item) continue;
        const home = lines.find((l: any) => asArray(l.items).some((x: any) => norm(String(x)) === item));
        if (!home) out.push({ where, message: ctx.T.skillsNotInResume(raw.trim()), quote: excerpt(line) });
        else await checkLine(home, excerpt(line));
      }
    }
  } else {
    for (const l of lines) if (asArray(l.items).length) await checkLine(l, excerpt(`${l.label ?? ""}: ${asArray(l.items).join(ctx.T.itemSep)}`));
  }
  return out;
}

async function checkTargetFile(ctx: Context, id: string, target: any, hasHtml: boolean): Promise<Problem[]> {
  const T = ctx.T;
  const W = T.targetsFile;
  const out: Problem[] = [];
  if (!target || typeof target !== "object" || Array.isArray(target)) return [{ where: W, message: T.fileBroken }];
  if (String(target.id ?? "") !== id) out.push({ where: W, message: T.idMismatch, detail: T.idMismatchDetail(String(target.id ?? ""), id) });
  const tplField = String(target.template ?? "").trim();
  if (tplField && !validTemplate(tplField, ctx.market.market))
    out.push({ where: W, message: T.templateBad(ctx.market.market === "us"), detail: `template: ${target.template}` });

  let structural: any[] = [];
  try {
    structural = R.checkTarget(ctx.resume, target, ctx.voice);
  } catch (e) {
    out.push({ where: W, message: T.targetUnreadable, detail: firstLine(e) });
  }
  for (const e of structural) {
    if (e.code === "numbers" || e.code === "voice") continue; // checked per field below, with the sentence quoted
    if (e.code === "tailor") out.push({ where: W, ...tailorMessage(e.message, T, ctx.market.market === "us") });
    else if (e.code === "id") out.push({ where: W, message: T.idChars, detail: `id: ${e.id ?? ""}` });
    else if (e.code === "list") out.push({ where: W, message: T.notesList, detail: e.field });
    else out.push({ where: W, message: T.targetGeneric });
  }

  for (const [field, text] of R.fields(target, [...R.PRINTED, "application_answers"]) as [string, string][]) {
    const [base, key] = field.split(".");
    const where = `${W}${T.whereSep}${T.fieldNames[base] ?? base}`;
    const detail = key ? `${base}.${key}` : undefined;
    const ps = [...ctx.textProblems(text, where, { skills: base === "skills_order" }), ...ctx.mentionProblems(text, where), ...(base === "summary" ? ctx.titleWordProblems(text, where) : [])];
    out.push(...ps.map((p) => (detail ? { ...p, detail } : p)));
  }
  out.push(...(await skillsProblems(ctx, target, `${W}${T.whereSep}${T.fieldNames.skills_order}`)));

  // Every printed bullet must come from a confirmed story.
  if (!structural.some((e) => e.code === "tailor")) {
    try {
      const v = target.base_variant;
      const data = R.tailor(ctx.resume, target);
      for (const sec of R.BULLET_SECTIONS)
        for (const item of data[sec] || [])
          if (R.inVariant(item, v))
            for (const b of item.bullets || [])
              if (b && R.inVariant(b, v)) {
                const src = b.sources ?? b.source;
                const codes = Array.isArray(src) ? src.map(String) : src ? splitSources(String(src), ctx.market.market === "us") : [];
                const where = T.resumeDataBullets;
                if (!codes.length) out.push({ where, message: T.bulletNoSource, quote: excerpt(b.text ?? "") });
                else out.push(...(await ctx.sourceProblems(codes, where, excerpt(b.text ?? ""))));
              }
    } catch {}
  }

  if (hasHtml && Array.isArray(target.confirm) && target.confirm.length)
    out.push({ where: W, message: T.confirmLeft(target.confirm.length) });
  return out;
}

/** What the resume file may print: the tailored resume (R.tailor + R.resolve) and the template's own words. */
function expectedText(ctx: Context, target: any, tpl: Template): string[] | null {
  let doc: any;
  try {
    doc = R.resolve(R.tailor(ctx.resume, target), target.base_variant);
  } catch {
    return null;
  }
  const out: string[] = [];
  const add = (node: any) => {
    if (typeof node === "string" || typeof node === "number") {
      const s = norm(String(node));
      if (s) out.push(s);
      if (/^https?:\/\//i.test(s)) out.push(s.replace(/^https?:\/\//i, ""));
    } else if (Array.isArray(node)) node.forEach(add);
    else if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node)) if (!["id", "source", "sources", "variants", "kind"].includes(k)) add(v);
  };
  add(doc.basics);
  // market us: an entry prints only the fields the template has (resume.yaml with any other key is an error of its own); a stray key
  // such as `title` or `location` text cannot widen what the file may say
  const us = ctx.market.market === "us";
  const PRINTED = ["org", "role", "name", "school", "degree", "dates", "location", "details", "bullets"];
  const printed = (items: any[]) => (us ? asArray(items).map((it) => (it && typeof it === "object" ? Object.fromEntries(Object.entries(it).filter(([k]) => PRINTED.includes(k))) : it)) : items);
  for (const s of doc.sections) {
    add(s.title);
    add(s.text);
    add(printed(s.items));
    for (const l of s.lines || []) {
      add(l.label);
      for (const x of l.items) {
        add(x);
        add(splitSkillItems(String(x)));
      }
    }
  }
  // English version: school and company names come from the target's en_names (make-resume-file.md 第 5 步)
  // (a US folder has no en_names: the resume data is already English)
  if (!us && target.en_names && typeof target.en_names === "object") add(Object.values(target.en_names));
  out.push(...tpl.words.map(norm));
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

/** Is this visible line made only of tailored content (and punctuation)? */
function lineBacked(line: string, expected: string[]): boolean {
  const l = norm(line);
  if ([...l].length >= 6 && expected.some((e) => e.includes(l))) return true; // a sentence split by <br>
  let rest = l;
  for (const e of expected) if (rest.includes(e)) rest = rest.split(e).join(" ");
  return /^[\s\p{P}\p{S}]*$/u.test(rest);
}

async function checkHtml(ctx: Context, html: string, target: any, tpl: Template): Promise<Problem[]> {
  const T = ctx.T;
  const W = T.resumeFile;
  const out: Problem[] = [];
  for (const m of oddMarkup(html, tpl.scripts, ctx.market.market !== "us", ctx.market.language))
    out.push({ where: W, message: T.oddFollow(m) });
  const lines = visibleLines(html);
  if (!lines.length) out.push({ where: W, message: T.noVisibleText });
  const expected = target && typeof target === "object" ? expectedText(ctx, target, tpl) : null;
  for (const l of lines) {
    if (SOURCE_LINE.test(l.text)) {
      out.push({ where: W, message: T.sourceLineOnPage, quote: excerpt(l.text) });
      continue;
    }
    out.push(...ctx.textProblems(l.text, W, { skills: l.skills, visaCovered: true }), ...ctx.visaProblems(l.text, W));
    if (!expected) continue;
    const want = /^希望職稱\s*[:：]\s*(.+)$/.exec(norm(l.text));
    if (want) {
      const v = want[1];
      if (v !== norm(String(target.role ?? "")) && !ctx.profile.includes(v))
        out.push({ where: W, message: T.wantedTitle, quote: excerpt(l.text) });
    } else if (!lineBacked(l.text, expected))
      out.push({ where: W, message: T.notBacked, quote: excerpt(l.text) });
  }
  if (!out.some((p) => p.message.includes("{{")))
    for (const s of leftoverSlots(html)) out.push({ where: W, message: T.leftoverSlot, quote: excerpt(s) });
  return out;
}

async function check104File(ctx: Context, rel: string, label: string): Promise<File104 | null> {
  let text: string | null;
  try {
    text = await ctx.folder.readText(rel);
  } catch {
    return null;
  }
  if (text == null) return null;
  const file: File104 = { file: rel, label, blocks: [], problems: [] };
  const raw = parse104(text);
  const us = ctx.market.market === "us";
  const T = ctx.T;
  if (!raw.length) file.problems.push({ where: label, message: T.noFields });
  for (const b of raw) {
    const name = b.group ? `${b.group}${T.whereSep}${b.title}` : b.title;
    const where = `${label}${T.whereSep}${name}`;
    const t = copyText(b.body);
    const pasted = !!t && isPasted(b, t);
    const { limit } = limitFor(b);
    const chars = R.countChars(t);
    // Not-copied fields are still typed into 104 by hand: the same wording rules apply.
    const problems: Problem[] = t ? [...ctx.textProblems(t, where), ...ctx.mentionProblems(t, where)] : [];
    let note = "";
    if (!t) note = T.emptyField;
    else if (!pasted) note = T.notCopiedField;
    else {
      for (const p of paragraphs(b.body, us)) problems.push(...(await ctx.paragraphProblems(p, where)));
      if (limit != null && chars > limit)
        problems.push({ where, message: T.overChars(chars, limit) });
    }
    file.blocks.push({ name, text: t, chars, limit, pasted, note, problems: dedupe(problems) });
  }
  return file;
}

// ---------------------------------------------------------------- whole folder

function stem(n: string, ext: string): string | null {
  return n.toLowerCase().endsWith(ext) ? n.slice(0, -ext.length) : null;
}

/** Every job id the folder has something to check for: targets, resume files, 104 letters. */
export function allIds(folder: Folder): string[] {
  const ids = new Set<string>();
  for (const n of folder.list("targets", "file")) {
    const s = stem(n, ".yaml") ?? stem(n, ".yml");
    if (s) ids.add(s);
  }
  for (const n of folder.list("resumes", "file")) {
    const s = stem(n, ".html");
    if (s) ids.add(s);
  }
  for (const d of folder.list("jobs", "dir")) if (folder.exists(`jobs/${d}/104-apply.md`)) ids.add(d);
  return [...ids].sort();
}

function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function jdNames(folder: Folder, id: string): Promise<{ company: string; role: string }> {
  try {
    const t = await folder.readText(`jobs/${id}/jd.md`);
    const m = t && /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(t);
    const fm: any = m ? Bun.YAML.parse(m[1]) : null;
    return { company: String(fm?.company ?? ""), role: String(fm?.role ?? "") };
  } catch {
    return { company: "", role: "" };
  }
}

export async function checkItem(ctx: Context, id: string): Promise<Item> {
  const folder = ctx.folder;
  const targetRel = folder.exists(`targets/${id}.yaml`) ? `targets/${id}.yaml` : folder.exists(`targets/${id}.yml`) ? `targets/${id}.yml` : null;
  const htmlRel = folder.exists(`resumes/${id}.html`) ? `resumes/${id}.html` : null;
  const item: Item = { id, company: "", role: "", updated: null, hasTarget: !!targetRel, hasHtml: !!htmlRel, photo: false, checked: [], problems: [], resumeProblems: [], apply: null };
  const T = ctx.T;

  let target: any = null;
  if (targetRel) {
    item.checked.push(T.checkedTarget(targetRel));
    try {
      target = await folder.readYaml(targetRel);
    } catch (e) {
      item.problems.push({ where: T.targetsFile, message: T.fileBroken, detail: firstLine(e) });
    }
    if (target && typeof target === "object") {
      item.company = String(target.company ?? "");
      item.role = String(target.role ?? "");
      item.photo = target.photo === true;
    }
  }
  if (!item.company && !item.role) Object.assign(item, await jdNames(folder, id));
  if (ctx.resumeProblem && (targetRel || htmlRel)) item.problems.push({ where: T.resumeData, message: ctx.resumeProblem, detail: ctx.resumeDetail });
  // a folder that looks in both checks this job under its own market (targets/<id>.yaml `market:`)
  const tm = ctx.targetMarket(target);
  if (targetRel && target != null) item.problems.push(...(await ctx.withMarket(tm, () => checkTargetFile(ctx, id, target, !!htmlRel))));

  if (htmlRel) {
    const html = (await folder.readText(htmlRel)) ?? "";
    const tpl = templateFor(html, target, tm);
    item.checked.push(T.checkedResume(htmlRel, T.templateNames[tpl.kind], tpl.how === "style"));
    if (!targetRel) item.problems.push({ where: T.resumeFile, message: T.noTargetForResume });
    item.problems.push(...(await ctx.withMarket(tm, () => checkHtml(ctx, html, target, byKind(tpl.kind)))));
  }

  item.resumeProblems = dedupe(item.problems);
  const applyRel = `jobs/${id}/104-apply.md`;
  if (folder.exists(applyRel)) {
    item.apply = await ctx.withMarket(ctx.markets.includes("tw") ? "tw" : ctx.market.market, () => check104File(ctx, applyRel, T.label104Apply)); // 104 is Taiwan
    if (item.apply) {
      item.checked.push(T.checkedApply(applyRel, item.apply.blocks.length));
      item.problems.push(...item.apply.problems, ...item.apply.blocks.flatMap((b) => b.problems));
    }
  }
  item.problems = dedupe(item.problems);
  item.updated = [htmlRel, targetRel].map((r) => (r ? folder.modified(r) : null)).filter(Boolean).sort().pop() ?? null;
  return item;
}

const PROFILE_NAMES: Record<ProfileKind, string> = { linkedin: "LinkedIn", handshake: "Handshake" };
// Codes of R.checkText that apply to a profile block's text. id_number and placeholder are checked on every line of the
// file instead (headers, meta lines and explanation blocks too).
const BLOCK_TEXT_CODES = ["numbers", "ai_word", "parens", "semicolon", "long", "invisible"];

/** One profiles/*.md file of a US-kit folder. linkedin.md and handshake.md are held to the format in
 * playbooks/linkedin-profile.md and handshake-profile.md (§1); any other file only gets the ID-number and visa checks. */
async function checkProfileFile(ctx: Context, file: string, text: string): Promise<ProfileFile> {
  const kind = profileKind(file);
  const T = ctx.T;
  const lang = ctx.market.language;
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const blocks: Block[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  // Every line of the file, whatever the block: ID numbers, visa words (and for the two known files placeholders, phone,
  // email, address).
  problems.push(...ctx.textProblems(text, file, { only: kind ? ["id_number", "placeholder"] : ["id_number"] }));
  for (const line of lines) {
    if (SOURCE_LINE.test(line)) continue;
    problems.push(...ctx.visaProblems(line, file));
    if (kind)
      for (const c of contactMatches(line))
        problems.push({ where: file, message: T.contactBanned(c.kind), quote: excerpt(line.replace(c.text, "…")) });
  }
  if (!kind) return { file, problems: dedupe(problems), warnings, blocks };

  const label = PROFILE_NAMES[kind];
  const specs = PROFILE_SPECS[kind];
  if (!PROFILE_HEADER[kind].test(lines[0]?.trim() ?? ""))
    problems.push({ where: file, message: T.profileFirstLine(label), quote: excerpt(lines[0] ?? "") });
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const h = fence ? null : /^(#{1,6})\s/.exec(l);
    if (h && i > 0 && h[1].length !== 2) problems.push({ where: file, message: T.profileHeading, quote: excerpt(l) });
  });

  const idx = resumeIndex(ctx.resume, (s) => splitSources(s, true));
  const facts = profileFacts(ctx.resume, ctx.profileRaw, (s) => splitSources(s, true));
  const seen = new Set<string>();
  const raw = parse104(text, true);
  if (!raw.some((b) => !b.group)) problems.push({ where: file, message: T.profileNoBlocks });
  for (const b of raw) {
    if (b.group) continue; // a "### " heading: reported above
    const { name } = splitHeading(b.title);
    const where = `${file}${T.whereSep}${b.title}`;
    const bp: Problem[] = [];
    const bw: Problem[] = [];
    const spec = specs.find((x) => x.name === name);
    if (!spec) {
      problems.push({ where, message: T.profileUnknownBlock(name, label, specs.map((x) => x.name)) });
      continue;
    }
    if (!spec.repeat && seen.has(name)) bp.push({ where, message: T.profileOnce(name) });
    seen.add(name);
    const fill = b.meta.Fill;
    if (fill !== spec.fill) bp.push({ where, message: fill == null ? T.profileFillMissing(spec.fill) : T.profileFillWrong(name, spec.fill, fill) });

    const t = copyText(b.body);
    const chars = R.countChars(t);
    const ps = paragraphs(b.body, true);
    const guide = spec.fill === "guide";
    const items = b.body.filter((l) => /^\s*•/.test(l)).length;
    if (guide) {
      if (b.body.some((l) => SOURCE_LINE.test(l))) bp.push({ where, message: T.profileGuideSource });
      if (name === "Custom URL" && b.meta.Suggested != null) {
        const why = customUrlProblem(b.meta.Suggested, lang);
        if (why) bp.push({ where, message: why, quote: excerpt(b.meta.Suggested) });
      }
    } else {
      if (!ps.length) bp.push({ where, message: T.profileNoSource });
      for (const l of b.body) {
        const why = SOURCE_LINE.test(l) ? null : bodyLineProblem(l, lang);
        if (why) bp.push({ where, message: why, quote: excerpt(l) });
      }
      const only = name === "Courses" ? BLOCK_TEXT_CODES.slice(1) : BLOCK_TEXT_CODES;
      if (name === "About") {
        // "Skills: Spanish (native), English (fluent)" is a skills line: the one-pair-of-parentheses rule is for sentences
        const isSkills = (l: string) => /^\s*Skills:/i.test(l);
        const tl = t.split(/\r?\n/);
        bp.push(...ctx.textProblems(tl.filter((l) => !isSkills(l)).join("\n"), where, { only, visaCovered: true }), ...ctx.textProblems(tl.filter(isSkills).join("\n"), where, { skills: true, only, visaCovered: true }));
      } else bp.push(...ctx.textProblems(t, where, { skills: !!spec.list || name === "Headline", only, visaCovered: true }));
      bp.push(...ctx.mentionProblems(t, where));
      if (name === "Headline" || name === "About" || name === "My Journey") bp.push(...ctx.titleWordProblems(b.body.filter((l) => !/^\s*•/.test(l)).join("\n"), where));
      // Every line that is not a "• " bullet or a Source line is compared with resume.yaml too (a sentence cannot be added to a
      // headline, an About opening, a skills line or a paragraph title just because it is not a bullet).
      const notBullet = (l: string) => !!l.trim() && !/^\s*•/.test(l) && !SOURCE_LINE.test(l);
      if (name === "Headline") {
        for (const l of b.body.filter(notBullet))
          norm(l)
            .split(/\s*\|\s*/)
            .forEach((seg, i) => {
              if (!headlineSegmentOk(seg, facts, idx, i === 0)) bp.push({ where, message: T.profileHeadlineSegment(seg), quote: excerpt(l) });
            });
      } else if (name === "About" || name === "My Journey") {
        // a title line must be the title of an experience this paragraph's Source line lists
        const titleOk = (text: string, sources: Set<string>) => [...(facts.titleCodes.get(text) ?? [])].some((c) => sources.has(c));
        for (const p of ps) {
          const sources = new Set((p.sources ?? []).map(canonSource));
          const pitch = ![...sources].some((c) => /^S-[0-9]+$/.test(c)); // only Education / Job goals (or no Source at all): the opening
          let first = true;
          for (const l of p.lines.filter(notBullet)) {
            const text = norm(l);
            const skills = /^Skills:\s*(.*)$/i.exec(text);
            if (skills) {
              for (const it of splitList(skills[1])) if (!skillCodes(it, idx)) bp.push({ where, message: T.profileSkillNotIn(it), quote: excerpt(l) });
            } else if (!((first && titleOk(text, sources)) || (pitch && backgroundLineOk(text, facts)))) bp.push({ where, message: T.profileLineNotOriginal, quote: excerpt(l) });
            first = false;
          }
        }
      } else {
        // Experience, Projects, Education, Skills ...: only "• " lines and Source lines belong in the body
        for (const l of b.body.filter(notBullet)) bp.push({ where, message: T.profileLineNotOriginal, quote: excerpt(l) });
      }
      for (const p of ps) {
        bp.push(...(await ctx.paragraphProblems(p, where, "Source:")));
        // every "• " line is a resume.yaml sentence (or skills item) and its source is on the Source line
        const need = new Set<string>();
        for (const l of p.lines) {
          const m = /^\s*•\s?(.*)$/.exec(l);
          if (!m) continue;
          const bullet = norm(m[1]);
          if (name === "Skills") {
            const codes = skillCodes(bullet, idx);
            if (!codes) bp.push({ where, message: T.profileSkillNotIn(bullet), quote: excerpt(l) });
            else codes.forEach((c) => need.add(c));
          } else if (name === "Courses") {
            // course names: word for word an education detail or a resume.yaml bullet (handshake-profile.md 3.2)
            if (!idx.bullets.has(bullet)) bp.push({ where, message: T.profileCourseNotIn, quote: excerpt(l) });
          } else if (!spec.list) {
            const codes = idx.bullets.get(bullet);
            if (!codes) bp.push({ where, message: T.profileBulletNotOriginal, quote: excerpt(l) });
            else codes.forEach((c) => need.add(c));
          }
        }
        const have = new Set((p.sources ?? []).map(canonSource));
        for (const c of need)
          if (!have.has(c)) bp.push({ where, message: T.profileNeedSource(name === "Skills", c), quote: excerpt(p.lines.find((l) => !SOURCE_LINE.test(l)) ?? "") });
      }
    }
    // Meta lines: dates are ones resume.yaml has, names are not unconfirmed stories', boxes typed on the site have limits.
    if (b.meta.Dates) bp.push(...ctx.dateProblems(b.meta.Dates, where));
    bp.push(...ctx.mentionProblems(["Title", "Company", "School", "Degree"].map((k) => b.meta[k] ?? "").join("\n"), where));
    bp.push(...ctx.profileFieldProblems(name, b.meta, where));
    for (const [k, n] of Object.entries(spec.metaLimits ?? {}))
      if (b.meta[k] != null && [...b.meta[k]].length > n)
        bw.push({ where, message: T.profileMetaOver(k, [...b.meta[k]].length, n), quote: excerpt(b.meta[k]) });
    // Length limits: the smaller of the table's and the file's own number.
    const lim = effectiveLimit(spec, b.meta.Limit);
    if (lim && !guide) {
      const over = lim.unit === "items" ? items > lim.n : chars > lim.n;
      if (over) {
        const message = lim.unit === "items" ? T.profileItemsOver(items, lim.n) : T.profileCharsOver(chars, lim.n, lim.level === "warn");
        (lim.level === "error" ? bp : bw).push({ where, message });
      }
    }
    blocks.push({
      name: b.title,
      text: t,
      chars,
      limit: lim?.unit === "chars" ? lim.n : null,
      pasted: spec.fill === "paste",
      note: spec.fill === "paste" ? "" : T.profileNotCopied,
      problems: dedupe(bp),
      warnings: dedupe(bw),
    });
  }
  problems.push(...blocks.flatMap((b) => b.problems));
  warnings.push(...blocks.flatMap((b) => b.warnings ?? []));
  return { file, problems: dedupe(problems), warnings: dedupe(warnings), blocks };
}

/** profiles/*.md of a US-kit folder (none in a Taiwan folder). */
async function checkProfiles(ctx: Context): Promise<ProfileFile[]> {
  if (!ctx.markets.includes("us")) return [];
  return ctx.withMarket("us", () => checkProfilesUs(ctx));
}

async function checkProfilesUs(ctx: Context): Promise<ProfileFile[]> {
  const out: ProfileFile[] = [];
  for (const name of ctx.folder.list("profiles", "file").filter((n) => n.toLowerCase().endsWith(".md"))) {
    const file = `profiles/${name}`;
    let text: string | null = null;
    try {
      text = await ctx.folder.readText(file);
    } catch {}
    if (text == null) {
      out.push({ file, problems: [{ where: file, message: ctx.T.profileUnreadable }], warnings: [], blocks: [] }); // never skip a file silently
      continue;
    }
    out.push(await checkProfileFile(ctx, file, text));
  }
  return out;
}

export async function runChecks(folder: Folder, opts: { ids?: string[] | null; general?: boolean; profiles?: boolean; now?: Date } = {}): Promise<Report> {
  const ctx = new Context(folder);
  await ctx.load();
  const ids = opts.ids ?? allIds(folder);
  const items: Item[] = [];
  for (const id of ids) items.push(await checkItem(ctx, id));
  let general: File104 | null = null;
  if (opts.general ?? true) {
    general = await ctx.withMarket(ctx.markets.includes("tw") ? "tw" : ctx.market.market, () => check104File(ctx, GENERAL_104, ctx.T.label104General));
    if (general && ctx.resumeProblem) general.problems.unshift({ where: ctx.T.resumeData, message: ctx.resumeProblem, detail: ctx.resumeDetail });
  }
  const profiles = (opts.profiles ?? true) ? await checkProfiles(ctx) : [];
  const resumeData = ctx.markets.includes("us") ? [...(await ctx.withMarket("us", () => ctx.confirmedProblems())), ...(await ctx.confirmedZhProblems())] : null;
  const count =
    items.reduce((n, i) => n + i.problems.length, 0) +
    (general ? generalProblems(general).length : 0) +
    profiles.reduce((n, f) => n + f.problems.length, 0) +
    (resumeData?.length ?? 0);
  return { checkedAt: localStamp(opts.now ?? new Date()), items, general, profiles, ...(resumeData ? { resumeData } : {}), problems: count, ok: count === 0 };
}

export function generalProblems(f: File104): Problem[] {
  return dedupe([...f.problems, ...f.blocks.flatMap((b) => b.problems)]);
}

// ---------------------------------------------------------------- checks/<id>.md

function problemLines(ps: Problem[], T: CheckText): string[] {
  return ps.map((p, i) => T.problemLine(i + 1, p.where, p.message, p.quote, p.detail));
}

function blockLines(f: File104, us: boolean, T: CheckText): string[] {
  return f.blocks.map((b) => T.blockLine(b.name, T.blockSize(b.pasted, b.chars, b.limit, us), b.problems.length, b.warnings?.length ?? 0));
}

/** `us`: the market (picks the US wording of the scope line and the English heading). `lang`: the language of every sentence. */
export function sectionText(when: string, checked: string[], problems: Problem[], files104: File104[], warnings: Problem[] = [], us = false, lang: Language = "zh-TW"): string {
  const T = textFor(lang);
  const lines = [
    us || lang === "en" ? SECTION_EN : SECTION,
    "",
    T.lineCheckedAt(when),
    T.lineCheckedBy,
    T.lineChecked(checked, T.nothingToCheck),
    T.lineCompared,
    T.lineResult(problems.length),
    T.lineScope(us),
  ];
  for (const f of files104) if (f.blocks.length) lines.push("", T.blockHead(f.label), ...blockLines(f, us, T));
  if (problems.length) lines.push("", T.headProblems, ...problemLines(problems, T));
  if (warnings.length) lines.push("", T.headWarnings, ...problemLines(warnings, T));
  return lines.join("\n") + "\n";
}

export async function writeResults(folder: Folder, report: Report): Promise<string[]> {
  const written: string[] = [];
  const mk = await readMarket(folder);
  const us = mk.market === "us";
  const lang = mk.language;
  const T = textFor(lang);
  const eh = us || lang === "en"; // the English kit gets the English heading and first line
  for (const item of report.items) {
    const rel = `checks/${item.id}.md`;
    const doc = await folder.readText(rel);
    const intro = item.company || item.role ? [T.jobIntro(item.company, item.role, item.id)] : [];
    const files = item.apply ? [item.apply] : [];
    await folder.writeText(rel, replaceSection(doc, sectionText(report.checkedAt, item.checked, item.problems, files, [], us, lang), intro, eh));
    written.push(rel);
  }
  if (report.general) {
    const g = report.general;
    const doc = await folder.readText(GENERAL_CHECKS);
    const checked = [T.checkedGeneral(g.file, g.blocks.length)];
    await folder.writeText(GENERAL_CHECKS, replaceSection(doc, sectionText(report.checkedAt, checked, generalProblems(g), [g], [], us, lang), [], eh));
    written.push(GENERAL_CHECKS);
  }
  if (report.profiles.length) {
    const doc = await folder.readText(PROFILES_CHECKS);
    const checked = report.profiles.map((f) => T.checkedProfile(f.file));
    const problems = dedupe(report.profiles.flatMap((f) => f.problems));
    const files = report.profiles.map((f): File104 => ({ file: f.file, label: f.file, blocks: f.blocks, problems: [] }));
    const warnings = dedupe(report.profiles.flatMap((f) => f.warnings));
    await folder.writeText(PROFILES_CHECKS, replaceSection(doc, sectionText(report.checkedAt, checked, problems, files, warnings, us, lang), [], eh));
    written.push(PROFILES_CHECKS);
  }
  return written;
}

// ---------------------------------------------------------------- command line

const MAX_PRINTED = 12;

export function summaryText(report: Report, written: string[], us = false, lang: Language = "zh-TW"): string {
  const T = textFor(lang);
  const out = [T.summaryHead(report.checkedAt)];
  const block = (title: string, ps: Problem[]) => {
    out.push("", T.blockTitle(title, ps.length));
    for (const l of problemLines(ps.slice(0, MAX_PRINTED), T)) out.push(`  ${l}`);
    if (ps.length > MAX_PRINTED) out.push(`  ${T.moreProblems(ps.length - MAX_PRINTED)}`);
  };
  for (const i of report.items) block(T.itemTitle([i.company, i.role].filter(Boolean).join(" ") || T.noCompany, i.id), i.problems);
  if (report.general) block(T.label104General, generalProblems(report.general));
  for (const f of report.profiles) {
    block(f.file, f.problems);
    if (f.warnings.length) {
      out.push(`  ${T.warnHead}`);
      for (const l of problemLines(f.warnings.slice(0, MAX_PRINTED), T)) out.push(`    ${l}`);
    }
  }
  if (report.resumeData?.length) block("resume.yaml", report.resumeData);
  if (!report.items.length && !report.general && !report.profiles.length && !report.resumeData?.length) out.push("", T.nothingYet);
  out.push("", report.ok ? T.allPassed : T.failedTotal(report.problems));
  if (written.length) out.push(T.writtenTo(written, (us || lang === "en" ? SECTION_EN : SECTION).replace(/^## /, "")));
  out.push(T.notChecked);
  return out.join("\n");
}

export type CheckArgs = { ids: string[]; general: boolean; profiles?: boolean; all: boolean; unknown: string[] };

export function parseCheckArgs(argv: string[]): CheckArgs {
  const a: CheckArgs = { ids: [], general: false, all: false, unknown: [] };
  let seenCheck = false;
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--dir" || x === "--folder") {
      i++;
      continue;
    }
    if (/^--(?:dir|folder)=/.test(x)) continue;
    if (!seenCheck && x === "check") {
      seenCheck = true;
      continue;
    }
    if (x === "--104") a.general = true;
    else if (x === "--profiles") a.profiles = true;
    else if (x === "--all") a.all = true;
    else if (x.startsWith("-")) a.unknown.push(x);
    else {
      // be forgiving about what the AI types: targets/x.yaml, resumes\x.html, checks/x.md, _104, 104
      const base = x.replace(/\\/g, "/").split("/").pop()!.replace(/\.(ya?ml|html?|md)$/i, "");
      if (base === "104" || base === "_104" || base === "履歷欄位") a.general = true;
      else if (base === "profiles" || base === "_profiles") a.profiles = true;
      else if (base) a.ids.push(base);
    }
  }
  return a;
}

export async function runCheck(argv: string[], dir: string | null, print: (s: string) => void = (s) => console.log(s)): Promise<number> {
  const args = parseCheckArgs(argv);
  // A folder the program does not recognise has no jobhunt.yaml to read: Chinese is the default, English when the path names the US kit.
  const folderOk = !!dir && looksLikeJobhuntFolder(dir);
  const lang: Language = dir && folderOk ? readMarketSync(dir).language : unrecognisedLanguage(dir);
  const T = textFor(lang);
  // The English wording of a US folder leaves out the Taiwan-only parts (the 104 site). The Chinese table ignores this.
  const usEn = lang === "en" && (!folderOk || readMarketSync(dir!).market === "us"); // an unrecognised folder that speaks English is the US kit
  if (args.unknown.length) {
    print(T.unknownArg(args.unknown.join(" "), usEn));
    return 2;
  }
  if (!dir || !folderOk) {
    print(T.notFolder);
    if (dir) print(T.programAt(dir));
    return 2;
  }
  const folder = new Folder(dir);
  const markets = readModeSync(dir).markets;
  if (args.profiles && !markets.includes("us")) {
    print(T.profilesTw);
    return 2;
  }
  if (args.general && usEn && !markets.includes("tw")) {
    print(T.no104Us);
    return 2;
  }
  const known = allIds(folder);
  const missing = args.ids.filter((id) => !known.includes(id));
  if (missing.length) {
    print(T.idsMissing(missing));
    print(T.idsKnown(known, usEn));
    return 2;
  }
  const everything = args.all || (!args.ids.length && !args.general && !args.profiles);
  const usFolder = (await readMarket(folder)).market === "us";
  const report = await runChecks(folder, {
    ids: everything ? known : [...new Set(args.ids)],
    general: everything || args.general,
    profiles: everything || !!args.profiles,
  });
  if (args.general && !everything && !report.general) {
    print(T.no104);
    return 2;
  }
  if (args.profiles && !everything && !report.profiles.length) {
    print(T.noProfiles);
    return 2;
  }
  let written: string[] = [];
  try {
    written = await writeResults(folder, report);
  } catch (e) {
    print(e instanceof FolderError ? T.writeOutside : T.writeBusy);
    print(summaryText(report, [], usFolder, lang));
    return 2;
  }
  print(summaryText(report, written, usFolder, lang));
  return report.ok ? 0 : 1;
}
