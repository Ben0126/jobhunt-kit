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
import { type Market, type MarketConfig, readMarket, TW_DEFAULTS } from "./market.ts";
import { visaWords } from "./visa.ts";
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
  resumeIndex,
  skillCodes,
  splitHeading,
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

export type Report = { checkedAt: string; items: Item[]; general: File104 | null; profiles: ProfileFile[]; problems: number; ok: boolean };

export const GENERAL_104 = "104/履歷欄位.md";
export const GENERAL_CHECKS = "checks/_104.md";
export const PROFILES_CHECKS = "checks/_profiles.md";

// ---------------------------------------------------------------- plain-Chinese messages

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
function fromRule(p: any, text: string): { message: string; quote: string } {
  switch (p.code) {
    case "numbers":
      return {
        message: `數字${p.numbers.map((n: string) => `「${n}」`).join("、")}在確認過的經歷裡找不到。只能用本人親口說過的數字`,
        quote: excerpt(text, numberNeedle(text, p.numbers[0])),
      };
    case "ai_word":
      return { message: `用了 AI 腔的詞「${p.word}」，請換成平常說話的寫法`, quote: excerpt(text, p.word) };
    case "parens":
      return { message: `一句裡有 ${p.n} 組括號，最多 1 組`, quote: excerpt(p.sentence ?? text) };
    case "semicolon":
      return { message: "用了分號，請拆成兩句", quote: excerpt(text, text.includes("；") ? "；" : ";") };
    case "long":
      return CJK.test(p.sentence ?? "")
        ? { message: `這一句有 ${p.length} 字，超過 ${R.MAX_CHARS} 字，請拆短`, quote: excerpt(p.sentence) }
        : { message: `這一句有 ${p.length} 個英文字，超過 ${R.MAX_WORDS} 個，請拆短`, quote: excerpt(p.sentence) };
    case "id_number":
      return { message: `看起來像身分證或居留證號碼（${maskId(p.text)}），不能寫進來`, quote: excerpt(text, p.text) };
    case "placeholder":
      return { message: `還有佔位字「${p.text}」，要換成真的內容`, quote: excerpt(text, p.text) };
    case "invisible":
      return { message: "有看不見的特殊字元（會跟著貼到 104），請把這一句重打一次", quote: excerpt(text) };
    default:
      return { message: "沒通過檢查", quote: excerpt(text) };
  }
}

function tailorMessage(msg: string): { message: string; detail?: string } {
  let m: RegExpExecArray | null;
  if ((m = /unknown bullet id '([^']+)'/.exec(msg))) return { message: "排序裡有一條重點，在確認過的履歷資料裡找不到", detail: `重點代號 ${m[1]}` };
  if ((m = /bullet '([^']+)' is not in the '([^']+)' variant/.exec(msg)))
    return { message: "排序裡有一條重點不屬於這個版本（中文或英文）", detail: `重點代號 ${m[1]}，版本 ${m[2]}` };
  if (/listed twice/.test(msg)) return { message: "同一條重點在排序裡出現兩次" };
  if (/base_variant is required/.test(msg)) return { message: "沒寫要用哪一個版本（中文或英文）" };
  if ((m = /unknown variant '([^']+)'/.exec(msg))) return { message: "確認過的履歷資料裡沒有這個版本", detail: `版本 ${m[1]}` };
  if (/skills_order line needs/.test(msg))
    return { message: "專長那一行要寫成「類別: 項目」，冒號要用半形的「:」", detail: msg.replace(/^.*?needs 'Label: items': /, "") };
  return { message: "這份客製履歷的設定有錯，程式沒辦法排出履歷", detail: msg };
}

// ---------------------------------------------------------------- folder context

type Story = { status: string; title: string; org: string } | null;

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
export const TEMPLATE_NAMES: Record<TemplateKind, string> = { tw: "深色抬頭", "tw-classic": "精緻單欄", en: "英文版", us: "美國版" };
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

/** A `template` value that exists in this market: `us` only in a US folder (a Taiwan folder has no resume-us.html). */
const validTemplate = (field: string, market: Market) => Object.hasOwn(TEMPLATE_NAMES, field) && (field !== "us" || market === "us");

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
    String(target?.base_variant ?? "") === "en" ||
    /<html\b[^>]*\slang\s*=\s*["']?en\b/i.test(stripComments(html));
  return { kind: en || market === "us" ? "en" : "tw", how: "guess" };
}

const norm = (s: string) => String(s).normalize("NFKC").replace(/\s+/g, " ").trim();

class Context {
  market: MarketConfig = TW_DEFAULTS;
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
  private stories = new Map<string, Story>();
  /** Names (org / title) of stories that are not confirmed and appear nowhere in the confirmed data. */
  draftNames: { code: string; name: string; status: string }[] = [];
  /** Workplaces and activities in resume.yaml (not schools): a paragraph sourced only by 學歷 may not talk about them. */
  workNames: string[] = [];
  constructor(readonly folder: Folder) {}

  async load() {
    this.market = await readMarket(this.folder);
    try {
      const r = await this.folder.readYaml("resume.yaml");
      if (r == null) this.resumeProblem = "找不到確認過的履歷資料，所有數字都對不到";
      else if (typeof r !== "object") this.resumeProblem = "確認過的履歷資料格式壞了，程式讀不懂";
      else this.resume = r;
    } catch (e: any) {
      this.resumeProblem = "確認過的履歷資料格式壞了，程式讀不懂";
      this.resumeDetail = firstLine(e);
    }
    try {
      const cfg: any = await this.folder.readYaml("jobhunt.yaml");
      const v = cfg?.resume?.voice ?? cfg?.voice;
      if (v && typeof v === "object") this.voice = new R.Voice(asList(v.extra_words), asList(v.allow_words));
    } catch {}
    try {
      this.profile = norm((await this.folder.readText("me/profile.md")) ?? "");
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
        s = { status: String(fm?.status ?? "").trim(), title: String(fm?.title ?? ""), org: String(fm?.org ?? "") };
      }
    } catch {
      s = { status: "?", title: "", org: "" };
    }
    this.stories.set(code, s);
    return s;
  }

  /** 學歷 / 求職方向 — in a US folder also Education / Job goals (exact case): sources that are not an experience. */
  isBackground(code: string): boolean {
    const c = code.normalize("NFKC").trim();
    return c === "學歷" || c === "求職方向" || (this.market.market === "us" && (c === "Education" || c === "Job goals"));
  }

  /** Problems with one source list (「S-003、學歷」 or a bullet's source field). */
  async sourceProblems(codes: string[], where: string, quote: string): Promise<Problem[]> {
    const out: Problem[] = [];
    for (const raw of codes) {
      const c = raw.normalize("NFKC").trim();
      if (this.isBackground(c)) continue;
      if (!/^S-[0-9]+$/i.test(c)) {
        const words = this.market.market === "us" ? "學歷（Education）、求職方向（Job goals）" : "學歷、求職方向";
        out.push({ where, message: `來源寫了「${c}」。來源只能寫經歷代號（像 S-003）、${words}`, quote });
        continue;
      }
      const s = await this.story(c.toUpperCase());
      if (!s) out.push({ where, message: `來源 ${c} 找不到這則經歷`, quote });
      else if (s.status === "confirmed") continue;
      else if (s.status === "draft") out.push({ where, message: `來源 ${c} 還是草稿，本人還沒確認，不能用`, quote });
      else if (s.status === "deleted") out.push({ where, message: `來源 ${c} 已經刪掉了，不能用`, quote });
      else out.push({ where, message: `來源 ${c} 的狀態看不懂（${s.status || "沒寫"}），先當成還沒確認`, quote });
    }
    return out;
  }

  /** One pasted paragraph (104 card or profile block): it has a source line, the sources are usable, and a paragraph that
   * rests only on 學歷 / 求職方向 (Education / Job goals) does not name a job or activity. */
  async paragraphProblems(p: Paragraph, where: string, sourceWord = "來源："): Promise<Problem[]> {
    const out: Problem[] = [];
    const body = p.lines.filter((l) => !SOURCE_LINE.test(l)).join("\n");
    const quote = excerpt(p.lines.find((l) => !SOURCE_LINE.test(l)) ?? "");
    if (p.unsourced != null) out.push({ where, message: `這一段下面沒有「${sourceWord}」那一行，不知道根據哪一則經歷`, quote: excerpt(p.unsourced) });
    if (p.sources) {
      out.push(...(await this.sourceProblems(p.sources, where, quote)));
      const onlyBackground = p.sources.every((c) => this.isBackground(c));
      const work = onlyBackground ? this.workNames.find((w) => norm(body).includes(w)) : undefined;
      if (work) out.push({ where, message: `這一段寫到經歷「${work}」，來源卻只寫了${this.market.market === "us" ? "學歷或求職方向（Education、Job goals）" : "學歷或求職方向"}`, quote: excerpt(body, work) });
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
        const state = d.status === "deleted" ? "已經刪掉的經歷" : "還沒確認的經歷";
        out.push({ where, message: `提到${state}「${d.name}」（${d.code}），本人確認過才能寫`, quote: excerpt(text, d.name) });
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
          out.push({ where, message: `日期「${d.text.replace(/\s+/g, " ")}」在確認過的經歷裡找不到`, quote: excerpt(text, d.text) });
      }
    for (const m of t.matchAll(YM)) {
      spans.push([m.index!, m.index! + m[0].length]);
      if (!this.yearMonths.has(`${m[1]}-${m[2].padStart(2, "0")}`))
        out.push({ where, message: `日期「${m[0].replace(/\s+/g, "")}」在確認過的經歷裡找不到`, quote: excerpt(text, m[0]) });
    }
    const monthBefore = new RegExp(`(?:[-–—~～至到]|(?:${MONTHS})[a-z]*\\.?)\\s*$`, "i");
    for (const m of t.matchAll(YEAR4)) {
      const at = m.index!;
      if (spans.some(([a, b]) => at >= a && at < b)) continue;
      const dateLike = /^\s?(?:年|[-–—~～/.])/.test(t.slice(at + 4)) || monthBefore.test(t.slice(0, at));
      if (dateLike && !okYear(m[1])) out.push({ where, message: `年份「${m[1]}」在確認過的經歷裡找不到`, quote: excerpt(text, m[1]) });
    }
    for (const m of t.matchAll(ROC_YEAR))
      if (!okYear(String(Number(m[1]) + 1911)))
        out.push({ where, message: `年份「${m[0].replace(/\s+/g, "")}」在確認過的經歷裡找不到`, quote: excerpt(text, m[0]) });
    for (const m of t.matchAll(MONTH_COUNT)) {
      const n = /^[0-9]+$/.test(m[1]) ? String(Number(m[1])) : String(R.zhNumber(m[1]));
      if (!this.facts.has(n))
        out.push({ where, message: `數字「${n}」在確認過的經歷裡找不到。只能用本人親口說過的數字`, quote: excerpt(text, m[0]) });
    }
    return out;
  }

  /** Title / Company / School / Degree of a profile block are word for word the resume.yaml role (or project name), org, school, degree. */
  profileFieldProblems(block: string, meta: Record<string, string>, where: string): Problem[] {
    const out: Problem[] = [];
    const vals = (secs: string[], keys: string[]) =>
      new Set(secs.flatMap((sec) => asArray(this.resume[sec]).flatMap((x: any) => keys.map((k) => norm(String(x?.[k] ?? ""))))).filter(Boolean));
    const jobs = ["experience", "projects"];
    const rules: [string, Set<string>, string][] =
      block === "Education"
        ? [["School", vals(["education"], ["school"]), "學校"], ["Degree", vals(["education"], ["degree"]), "學位"]]
        : ["Experience", "Work Experience", "Organizations", "Projects"].includes(block)
          ? [["Title", vals(jobs, ["role", "name"]), "職稱或專題名稱"], ["Company", vals(jobs, ["org"]), "單位名稱"]]
          : [];
    for (const [key, allowed, what] of rules) {
      const v = norm(meta[key] ?? "");
      if (v && !allowed.has(v)) out.push({ where, message: `${key}「${v}」不是 resume.yaml 裡的${what}。這一欄要和確認過的${what}一字不差`, quote: excerpt(v) });
    }
    return out;
  }

  /** checkText on each line (sentences never run across lines), as Problems. */
  textProblems(text: string, where: string, opts: { skills?: boolean; only?: string[] } = {}): Problem[] {
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
          for (const id of ids) out.push({ where, message: `看起來像個人證號（${maskId(id)}），不能寫進來`, quote: excerpt(line, id) });
        probe = replaceExtraIds(line, (m) => (tw.has(m.toUpperCase()) ? m : " "));
      }
      const us = this.market.market === "us";
      for (const p of R.checkText(probe, this.resume, { voice: this.voice, skills: !!opts.skills })) {
        if (opts.only && !opts.only.includes(p.code)) continue;
        if (us && p.code === "numbers") continue; // read the English way below
        out.push({ where, ...fromRule(p, line) });
      }
      if (us) out.push(...this.englishProblems(probe, line, where, opts.only));
      if (!opts.only || opts.only.includes("numbers")) out.push(...this.dateProblems(probe, where));
    }
    return out;
  }

  /** market us: numbers read the English way on both sides, "50+" only when the user said it, and English placeholders. */
  englishProblems(probe: string, line: string, where: string, only?: string[]): Problem[] {
    const out: Problem[] = [];
    if (!only || only.includes("numbers")) {
      const missing = [...new Set([...R.numbers(normEnglish(probe)), ...vagueAmounts(probe)])].filter((n) => !this.factsEn.has(n)).sort();
      if (missing.length) out.push({ where, ...fromRule({ code: "numbers", numbers: missing }, line) });
      for (const c of moreThanClaims(probe))
        if (this.factsEn.has(c.n) && !this.moreThanFacts.has(c.n))
          out.push({
            where,
            message: `「${c.quote}」寫成「超過／以上」，但本人說的數字只有 ${c.n}，沒說過「超過 ${c.n}」。只有本人原話這樣說才能寫 N+`,
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
          out.push({ where, ...fromRule({ code: "placeholder", text: m[0] }, line) });
        }
    }
    return out;
  }

  /** US kit: visa and work-authorization words may not appear on the resume file or in profiles/*.md (src/visa.ts). */
  visaProblems(text: string, where: string): Problem[] {
    if (this.market.market !== "us") return [];
    return visaWords(text, this.workNames).map((w) => ({
      where,
      message: `履歷和個人檔案不能寫簽證或工作身分的字眼「${w}」。簽證身分放在 me/work-auth.md，申請表上照實回答`,
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

const FIELD_NAMES: Record<string, string> = { summary: "自我介紹", skills_order: "專長", bullet_overrides: "改寫的重點", application_answers: "應徵問答" };

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
    if (!codes.length) out.push({ where, message: `專長「${l.label ?? ""}」那一行在確認過的履歷資料裡沒有寫來源`, quote });
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
        if (!home) out.push({ where, message: `專長「${raw.trim()}」不在確認過的履歷資料裡（要和裡面的專長一字不差）`, quote: excerpt(line) });
        else await checkLine(home, excerpt(line));
      }
    }
  } else {
    for (const l of lines) if (asArray(l.items).length) await checkLine(l, excerpt(`${l.label ?? ""}: ${asArray(l.items).join("、")}`));
  }
  return out;
}

async function checkTargetFile(ctx: Context, id: string, target: any, hasHtml: boolean): Promise<Problem[]> {
  const W = "客製履歷";
  const out: Problem[] = [];
  if (!target || typeof target !== "object" || Array.isArray(target)) return [{ where: W, message: "這個檔案的格式壞了，程式讀不懂" }];
  if (String(target.id ?? "") !== id) out.push({ where: W, message: `檔案裡寫的代號和檔名不一樣`, detail: `id: ${target.id ?? ""}，檔名 ${id}` });
  const tplField = String(target.template ?? "").trim();
  if (tplField && !validTemplate(tplField, ctx.market.market))
    out.push({ where: W, message: "履歷樣式寫錯了，只能是深色抬頭（tw）、精緻單欄（tw-classic）或英文版（en）", detail: `template: ${target.template}` });

  let structural: any[] = [];
  try {
    structural = R.checkTarget(ctx.resume, target, ctx.voice);
  } catch (e) {
    out.push({ where: W, message: "這份客製履歷的設定有錯，程式讀不懂", detail: firstLine(e) });
  }
  for (const e of structural) {
    if (e.code === "numbers" || e.code === "voice") continue; // checked per field below, with the sentence quoted
    if (e.code === "tailor") out.push({ where: W, ...tailorMessage(e.message) });
    else if (e.code === "id") out.push({ where: W, message: "代號只能用英文小寫、數字和 -", detail: `id: ${e.id ?? ""}` });
    else if (e.code === "list") out.push({ where: W, message: "筆記要寫成一條一條的清單", detail: e.field });
    else out.push({ where: W, message: "這份客製履歷的設定有錯" });
  }

  for (const [field, text] of R.fields(target, [...R.PRINTED, "application_answers"]) as [string, string][]) {
    const [base, key] = field.split(".");
    const where = `${W}・${FIELD_NAMES[base] ?? base}`;
    const detail = key ? `${base}.${key}` : undefined;
    const ps = [...ctx.textProblems(text, where, { skills: base === "skills_order" }), ...ctx.mentionProblems(text, where)];
    out.push(...ps.map((p) => (detail ? { ...p, detail } : p)));
  }
  out.push(...(await skillsProblems(ctx, target, `${W}・專長`)));

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
                const where = "履歷資料的重點";
                if (!codes.length) out.push({ where, message: "這條會印出來的重點沒有寫來源（是哪一則經歷）", quote: excerpt(b.text ?? "") });
                else out.push(...(await ctx.sourceProblems(codes, where, excerpt(b.text ?? ""))));
              }
    } catch {}
  }

  if (hasHtml && Array.isArray(target.confirm) && target.confirm.length)
    out.push({ where: W, message: `還有 ${target.confirm.length} 題還沒問過本人，問完才能做成履歷檔` });
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
  for (const s of doc.sections) {
    add(s.title);
    add(s.text);
    add(s.items);
    for (const l of s.lines || []) {
      add(l.label);
      for (const x of l.items) {
        add(x);
        add(splitSkillItems(String(x)));
      }
    }
  }
  // English version: school and company names come from the target's en_names (make-resume-file.md 第 5 步)
  if (target.en_names && typeof target.en_names === "object") add(Object.values(target.en_names));
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
  const W = "履歷檔";
  const out: Problem[] = [];
  for (const m of oddMarkup(html, tpl.scripts, ctx.market.market !== "us"))
    out.push({ where: W, message: `${m}。照範本重做履歷檔，不要加範本以外的寫法` });
  const lines = visibleLines(html);
  if (!lines.length) out.push({ where: W, message: "履歷檔上看不到任何字" });
  const expected = target && typeof target === "object" ? expectedText(ctx, target, tpl) : null;
  for (const l of lines) {
    if (SOURCE_LINE.test(l.text)) {
      out.push({ where: W, message: "履歷檔上不該有「來源：」這一行（它會印出來）", quote: excerpt(l.text) });
      continue;
    }
    out.push(...ctx.textProblems(l.text, W, { skills: l.skills }), ...ctx.visaProblems(l.text, W));
    if (!expected) continue;
    const want = /^希望職稱\s*[:：]\s*(.+)$/.exec(norm(l.text));
    if (want) {
      const v = want[1];
      if (v !== norm(String(target.role ?? "")) && !ctx.profile.includes(v))
        out.push({ where: W, message: "希望職稱不是你說過想找的工作（求職方向裡沒有）", quote: excerpt(l.text) });
    } else if (!lineBacked(l.text, expected))
      out.push({ where: W, message: "這一句和 AI 準備的內容對不上（不是確認過的經歷，或履歷檔還沒照最新的內容重做）", quote: excerpt(l.text) });
  }
  if (!out.some((p) => p.message.includes("{{")))
    for (const s of leftoverSlots(html)) out.push({ where: W, message: "還有佔位字「{{」，要換成真的內容", quote: excerpt(s) });
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
  if (!raw.length) file.problems.push({ where: label, message: "裡面沒有找到任何欄位（每一欄要用「## 欄位名稱」開頭）" });
  for (const b of raw) {
    const name = b.group ? `${b.group}・${b.title}` : b.title;
    const where = `${label}・${name}`;
    const t = copyText(b.body);
    const pasted = !!t && isPasted(b, t);
    const { limit } = limitFor(b);
    const chars = R.countChars(t);
    // Not-copied fields are still typed into 104 by hand: the same wording rules apply.
    const problems: Problem[] = t ? [...ctx.textProblems(t, where), ...ctx.mentionProblems(t, where)] : [];
    let note = "";
    if (!t) note = "這一欄是空的。";
    else if (!pasted) note = "這一欄要在 104 用選的或自己填，不用複製。";
    else {
      for (const p of paragraphs(b.body, us)) problems.push(...(await ctx.paragraphProblems(p, where)));
      if (limit != null && chars > limit)
        problems.push({ where, message: `有 ${chars.toLocaleString("en-US")} 字，超過上限 ${limit.toLocaleString("en-US")} 字` });
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

  let target: any = null;
  if (targetRel) {
    item.checked.push(`客製履歷 ${targetRel}（自我介紹、專長、改寫的重點、應徵問答）`);
    try {
      target = await folder.readYaml(targetRel);
    } catch (e) {
      item.problems.push({ where: "客製履歷", message: "這個檔案的格式壞了，程式讀不懂", detail: firstLine(e) });
    }
    if (target && typeof target === "object") {
      item.company = String(target.company ?? "");
      item.role = String(target.role ?? "");
      item.photo = target.photo === true;
    }
  }
  if (!item.company && !item.role) Object.assign(item, await jdNames(folder, id));
  if (ctx.resumeProblem && (targetRel || htmlRel)) item.problems.push({ where: "履歷資料", message: ctx.resumeProblem, detail: ctx.resumeDetail });
  if (targetRel && target != null) item.problems.push(...(await checkTargetFile(ctx, id, target, !!htmlRel)));

  if (htmlRel) {
    const html = (await folder.readText(htmlRel)) ?? "";
    const tpl = templateFor(html, target, ctx.market.market);
    item.checked.push(`履歷檔 ${htmlRel} 上看得到的每一行字（範本：${TEMPLATE_NAMES[tpl.kind]}${tpl.how === "style" ? "" : "，照設定或語言判斷"}）`);
    if (!targetRel) item.problems.push({ where: "履歷檔", message: "找不到這份履歷檔的客製履歷設定，程式沒辦法對照它是照什麼做的" });
    item.problems.push(...(await checkHtml(ctx, html, target, byKind(tpl.kind))));
  }

  item.resumeProblems = dedupe(item.problems);
  const applyRel = `jobs/${id}/104-apply.md`;
  if (folder.exists(applyRel)) {
    item.apply = await check104File(ctx, applyRel, "104 應徵信與問答");
    if (item.apply) {
      item.checked.push(`104 應徵信與問答 ${applyRel}（${item.apply.blocks.length} 欄）`);
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
        problems.push({ where: file, message: `個人檔案不能寫電話、email 或住址（${c.kind === "email" ? "email" : c.kind === "phone" ? "電話" : "住址"}）`, quote: excerpt(line.replace(c.text, "…")) });
  }
  if (!kind) return { file, problems: dedupe(problems), warnings, blocks };

  const label = PROFILE_NAMES[kind];
  const specs = PROFILE_SPECS[kind];
  if (!PROFILE_HEADER[kind].test(lines[0]?.trim() ?? ""))
    problems.push({ where: file, message: `第一行要寫「# ${label} profile text (draft)」`, quote: excerpt(lines[0] ?? "") });
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const h = fence ? null : /^(#{1,6})\s/.exec(l);
    if (h && i > 0 && h[1].length !== 2) problems.push({ where: file, message: "不能用 # 或 ### 標題，區塊標題只能是「## 區塊名稱」", quote: excerpt(l) });
  });

  const idx = resumeIndex(ctx.resume, (s) => splitSources(s, true));
  const seen = new Set<string>();
  const raw = parse104(text, true);
  if (!raw.some((b) => !b.group)) problems.push({ where: file, message: "裡面沒有找到任何區塊（每一個區塊要用「## 區塊名稱」開頭）" });
  for (const b of raw) {
    if (b.group) continue; // a "### " heading: reported above
    const { name } = splitHeading(b.title);
    const where = `${file}・${b.title}`;
    const bp: Problem[] = [];
    const bw: Problem[] = [];
    const spec = specs.find((x) => x.name === name);
    if (!spec) {
      problems.push({ where, message: `不認得的區塊名稱「${name}」。${label} 的區塊名稱只有：${specs.map((x) => x.name).join("、")}（大小寫要一樣）` });
      continue;
    }
    if (!spec.repeat && seen.has(name)) bp.push({ where, message: `區塊「${name}」只能出現一次` });
    seen.add(name);
    const fill = b.meta.Fill;
    if (fill !== spec.fill) bp.push({ where, message: fill == null ? `區塊開頭少了「- Fill: ${spec.fill}」那一行` : `「${name}」的 Fill 要寫成「${spec.fill}」，不是「${fill}」` });

    const t = copyText(b.body);
    const chars = R.countChars(t);
    const ps = paragraphs(b.body, true);
    const guide = spec.fill === "guide";
    const items = b.body.filter((l) => /^\s*•/.test(l)).length;
    if (guide) {
      if (b.body.some((l) => SOURCE_LINE.test(l))) bp.push({ where, message: "說明區塊不用寫 Source: 那一行（它不會貼到網站上）" });
      if (name === "Custom URL" && b.meta.Suggested != null) {
        const why = customUrlProblem(b.meta.Suggested);
        if (why) bp.push({ where, message: why, quote: excerpt(b.meta.Suggested) });
      }
    } else {
      if (!ps.length) bp.push({ where, message: "這個區塊沒有 Source: 那一行，不知道根據哪一則經歷" });
      for (const l of b.body) {
        const why = SOURCE_LINE.test(l) ? null : bodyLineProblem(l);
        if (why) bp.push({ where, message: why, quote: excerpt(l) });
      }
      const only = name === "Courses" ? BLOCK_TEXT_CODES.slice(1) : BLOCK_TEXT_CODES;
      if (name === "About") {
        // "Skills: Spanish (native), English (fluent)" is a skills line: the one-pair-of-parentheses rule is for sentences
        const isSkills = (l: string) => /^\s*Skills:/i.test(l);
        const tl = t.split(/\r?\n/);
        bp.push(...ctx.textProblems(tl.filter((l) => !isSkills(l)).join("\n"), where, { only }), ...ctx.textProblems(tl.filter(isSkills).join("\n"), where, { skills: true, only }));
      } else bp.push(...ctx.textProblems(t, where, { skills: !!spec.list || name === "Headline", only }));
      bp.push(...ctx.mentionProblems(t, where));
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
            if (!codes) bp.push({ where, message: `專長項目「${bullet}」不在 resume.yaml 的專長裡（句子裡寫到的工具，要先出專長卡、加進 skills 才能用）`, quote: excerpt(l) });
            else codes.forEach((c) => need.add(c));
          } else if (!spec.list) {
            const codes = idx.bullets.get(bullet);
            if (!codes) bp.push({ where, message: "這一行不是 resume.yaml 的重點原句（重點只能挑選、排序，不能改寫）", quote: excerpt(l) });
            else codes.forEach((c) => need.add(c));
          }
        }
        const have = new Set((p.sources ?? []).map(canonSource));
        for (const c of need)
          if (!have.has(c)) bp.push({ where, message: `Source: 那一行沒有寫這${name === "Skills" ? "項專長" : "條重點"}的來源 ${c}`, quote: excerpt(p.lines.find((l) => !SOURCE_LINE.test(l)) ?? "") });
      }
    }
    // Meta lines: dates are ones resume.yaml has, names are not unconfirmed stories', boxes typed on the site have limits.
    if (b.meta.Dates) bp.push(...ctx.dateProblems(b.meta.Dates, where));
    bp.push(...ctx.mentionProblems(["Title", "Company", "School", "Degree"].map((k) => b.meta[k] ?? "").join("\n"), where));
    bp.push(...ctx.profileFieldProblems(name, b.meta, where));
    for (const [k, n] of Object.entries(spec.metaLimits ?? {}))
      if (b.meta[k] != null && [...b.meta[k]].length > n)
        bw.push({ where, message: `${k} 有 ${[...b.meta[k]].length} 字，超過上限 ${n} 字（網站實際顯示的數字為準）`, quote: excerpt(b.meta[k]) });
    // Length limits: the smaller of the table's and the file's own number.
    const lim = effectiveLimit(spec, b.meta.Limit);
    if (lim && !guide) {
      const over = lim.unit === "items" ? items > lim.n : chars > lim.n;
      if (over) {
        const message =
          lim.unit === "items"
            ? `有 ${items} 個項目，超過上限 ${lim.n} 個`
            : `有 ${chars.toLocaleString("en-US")} 字，超過上限 ${lim.n.toLocaleString("en-US")} 字${lim.level === "warn" ? "（網站實際顯示的數字為準）" : ""}`;
        (lim.level === "error" ? bp : bw).push({ where, message });
      }
    }
    blocks.push({
      name: b.title,
      text: t,
      chars,
      limit: lim?.unit === "chars" ? lim.n : null,
      pasted: spec.fill === "paste",
      note: spec.fill === "paste" ? "" : "這一區塊不用複製。",
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
  if (ctx.market.market !== "us") return [];
  const out: ProfileFile[] = [];
  for (const name of ctx.folder.list("profiles", "file").filter((n) => n.toLowerCase().endsWith(".md"))) {
    const file = `profiles/${name}`;
    let text: string | null = null;
    try {
      text = await ctx.folder.readText(file);
    } catch {}
    if (text == null) {
      out.push({ file, problems: [{ where: file, message: "讀不到這個個人檔案，沒辦法檢查" }], warnings: [], blocks: [] }); // never skip a file silently
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
    general = await check104File(ctx, GENERAL_104, "104 總履歷");
    if (general && ctx.resumeProblem) general.problems.unshift({ where: "履歷資料", message: ctx.resumeProblem, detail: ctx.resumeDetail });
  }
  const profiles = (opts.profiles ?? true) ? await checkProfiles(ctx) : [];
  const count =
    items.reduce((n, i) => n + i.problems.length, 0) + (general ? generalProblems(general).length : 0) + profiles.reduce((n, f) => n + f.problems.length, 0);
  return { checkedAt: localStamp(opts.now ?? new Date()), items, general, profiles, problems: count, ok: count === 0 };
}

export function generalProblems(f: File104): Problem[] {
  return dedupe([...f.problems, ...f.blocks.flatMap((b) => b.problems)]);
}

// ---------------------------------------------------------------- checks/<id>.md

function problemLines(ps: Problem[]): string[] {
  return ps.map((p, i) =>
    `${i + 1}. ${p.where}：${p.message}。${p.quote ? `原文：「${p.quote}」` : ""}${p.detail ? `（給 AI：${p.detail}）` : ""}`.replace(/。。/g, "。"),
  );
}

function blockLines(f: File104, us = false): string[] {
  return f.blocks.map((b) => {
    const size = b.pasted ? `${b.chars.toLocaleString("en-US")} 字／${b.limit != null ? `上限 ${b.limit.toLocaleString("en-US")} 字` : (us ? "上限以網站畫面為準" : "上限以 104 畫面為準")}` : "不用複製";
    return `- ${b.name}：${size}，${b.problems.length ? `沒通過（${b.problems.length} 個問題）` : "通過"}${b.warnings?.length ? `，提醒 ${b.warnings.length} 個` : ""}`;
  });
}

export function sectionText(when: string, checked: string[], problems: Problem[], files104: File104[], warnings: Problem[] = [], us = false): string {
  const lines = [
    us ? SECTION_EN : SECTION,
    "",
    `- 檢查時間：${when}`,
    "- 檢查者：jobhunt 程式（不是 AI）。這一節只有程式會寫，AI 不能改。",
    `- 檢查了：${checked.length ? checked.join("；") : "沒有可以檢查的檔案"}`,
    "- 對照的資料：resume.yaml（確認過的事實）、me/stories/ 的確認狀態",
    `- 結果：${problems.length ? `沒通過，有 ${problems.length} 個問題` : "通過"}`,
    `- 程式查的是數字、AI 腔用詞、括號和分號、句子長度、身分證字號、佔位字、來源行和${us ? "" : " 104 "}字數。意思、動詞和職稱有沒有升級，程式不會查，還是要照「手動檢查」。`,
  ];
  for (const f of files104) if (f.blocks.length) lines.push("", `### ${f.label}：每一欄`, ...blockLines(f, us));
  if (problems.length) lines.push("", "### 要處理的問題", ...problemLines(problems));
  if (warnings.length) lines.push("", "### 提醒（不算沒通過）", ...problemLines(warnings));
  return lines.join("\n") + "\n";
}

export async function writeResults(folder: Folder, report: Report): Promise<string[]> {
  const written: string[] = [];
  const us = (await readMarket(folder)).market === "us"; // the English kit gets the English heading and first line
  for (const item of report.items) {
    const rel = `checks/${item.id}.md`;
    const doc = await folder.readText(rel);
    const intro = item.company || item.role ? [`職缺：${item.company}${item.role}（代號 ${item.id}）`] : [];
    const files = item.apply ? [item.apply] : [];
    await folder.writeText(rel, replaceSection(doc, sectionText(report.checkedAt, item.checked, item.problems, files, [], us), intro, us));
    written.push(rel);
  }
  if (report.general) {
    const g = report.general;
    const doc = await folder.readText(GENERAL_CHECKS);
    const checked = [`104 總履歷 ${g.file}（${g.blocks.length} 欄）`];
    await folder.writeText(GENERAL_CHECKS, replaceSection(doc, sectionText(report.checkedAt, checked, generalProblems(g), [g], [], us), [], us));
    written.push(GENERAL_CHECKS);
  }
  if (report.profiles.length) {
    const doc = await folder.readText(PROFILES_CHECKS);
    const checked = report.profiles.map((f) => `個人檔案 ${f.file}`);
    const problems = dedupe(report.profiles.flatMap((f) => f.problems));
    const files = report.profiles.map((f): File104 => ({ file: f.file, label: f.file, blocks: f.blocks, problems: [] }));
    const warnings = dedupe(report.profiles.flatMap((f) => f.warnings));
    await folder.writeText(PROFILES_CHECKS, replaceSection(doc, sectionText(report.checkedAt, checked, problems, files, warnings, us), [], us));
    written.push(PROFILES_CHECKS);
  }
  return written;
}

// ---------------------------------------------------------------- command line

const MAX_PRINTED = 12;

export function summaryText(report: Report, written: string[], us = false): string {
  const out = [`程式檢查（${report.checkedAt}）`];
  const block = (title: string, ps: Problem[]) => {
    out.push("", `${title}：${ps.length ? `沒通過，${ps.length} 個問題` : "通過"}`);
    for (const l of problemLines(ps.slice(0, MAX_PRINTED))) out.push(`  ${l}`);
    if (ps.length > MAX_PRINTED) out.push(`  還有 ${ps.length - MAX_PRINTED} 個，完整的寫在檢查結果檔裡。`);
  };
  for (const i of report.items) block(`${[i.company, i.role].filter(Boolean).join(" ") || "（沒寫公司）"}（代號 ${i.id}）`, i.problems);
  if (report.general) block("104 總履歷", generalProblems(report.general));
  for (const f of report.profiles) {
    block(f.file, f.problems);
    if (f.warnings.length) {
      out.push(`  提醒（不算沒通過）：`);
      for (const l of problemLines(f.warnings.slice(0, MAX_PRINTED))) out.push(`    ${l}`);
    }
  }
  if (!report.items.length && !report.general && !report.profiles.length) out.push("", "資料夾裡還沒有可以檢查的履歷或 104 文字。");
  out.push("", report.ok ? "全部通過。" : `沒通過：共 ${report.problems} 個問題。改好之後再檢查一次。`);
  if (written.length) out.push(`結果寫進 ${written.join("、")} 的「${(us ? SECTION_EN : SECTION).replace(/^## /, "")}」一節。`);
  out.push("程式不檢查意思、動詞和職稱有沒有升級，這部分還是要人看。");
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
  if (args.unknown.length) {
    print(`不認得「${args.unknown.join(" ")}」。用法：check [職缺代號 ...] [--104] [--profiles] [--all]`);
    return 2;
  }
  if (!dir || !looksLikeJobhuntFolder(dir)) {
    print("這個資料夾看起來不是求職資料夾，沒有檢查。請把程式放進求職資料夾（有 AGENTS.md 的那個）再執行。");
    if (dir) print(`程式現在在：${dir}`);
    return 2;
  }
  const folder = new Folder(dir);
  if (args.profiles && (await readMarket(folder)).market !== "us") {
    print("這是台灣版資料夾，沒有個人檔案（profiles）可以檢查。--profiles 只用在美國版資料夾。");
    return 2;
  }
  const known = allIds(folder);
  const missing = args.ids.filter((id) => !known.includes(id));
  if (missing.length) {
    print(`找不到這些職缺代號：${missing.join("、")}。`);
    print(known.length ? `資料夾裡有：${known.join("、")}。` : "資料夾裡還沒有客製履歷、履歷檔或 104 應徵信。");
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
    print("找不到 104 總履歷（104/履歷欄位.md）。");
    return 2;
  }
  if (args.profiles && !everything && !report.profiles.length) {
    print("找不到個人檔案（profiles/ 裡沒有 .md 檔）。");
    return 2;
  }
  let written: string[] = [];
  try {
    written = await writeResults(folder, report);
  } catch (e) {
    print(
      e instanceof FolderError
        ? "檢查做完了，但結果檔寫不進去：checks 資料夾指到求職資料夾外面，為了安全沒有寫入。"
        : "檢查做完了，但結果檔寫不進去：checks 資料夾或裡面的檔案可能被別的程式打開了，或不是一般的資料夾。關掉別的程式再試一次。",
    );
    print(summaryText(report, [], usFolder));
    return 2;
  }
  print(summaryText(report, written, usFolder));
  return report.ok ? 0 : 1;
}
