// The US kit's profile text files (profiles/linkedin.md, profiles/handshake.md): which "## " blocks exist, how each is
// filled, and the length limits. The format is written in playbooks/linkedin-profile.md and handshake-profile.md (§1);
// the block parsing and source-line logic are the 104 ones in blocks104.ts, run in English mode.
//
// Official limits (LinkedIn help) are errors; limits that come from third-party guides are warnings only.
import { textFor } from "./check.text.ts";
import type { Language } from "./market.ts";

export type ProfileKind = "linkedin" | "handshake";
export type Fill = "paste" | "pick" | "guide";
export type Level = "error" | "warn";
export type Limit = { n: number; unit: "chars" | "items"; level: Level };

export type BlockSpec = {
  name: string;
  repeat: boolean;
  fill: Fill;
  limit?: Limit;
  /** meta values typed into a box on the site (Title, Company, Location ...) and their limits */
  metaLimits?: Record<string, number>;
  /** "• " lines are not resume.yaml bullets (skills, course names, interests) */
  list?: boolean;
};

const warn = (n: number): Limit => ({ n, unit: "chars", level: "warn" });

export const PROFILE_SPECS: Record<ProfileKind, BlockSpec[]> = {
  linkedin: [
    { name: "Headline", repeat: false, fill: "paste", limit: warn(220) },
    { name: "About", repeat: false, fill: "paste", limit: warn(2600) },
    { name: "Experience", repeat: true, fill: "paste", limit: warn(2000), metaLimits: { Title: 100, Company: 100, Location: 100 } },
    { name: "Projects", repeat: true, fill: "paste" },
    { name: "Education", repeat: true, fill: "paste" },
    { name: "Skills", repeat: false, fill: "paste", limit: { n: 100, unit: "items", level: "error" }, list: true },
    { name: "Custom URL", repeat: false, fill: "guide" },
    { name: "Open to Work", repeat: false, fill: "guide" },
  ],
  handshake: [
    { name: "My Journey", repeat: false, fill: "paste", limit: warn(300) },
    { name: "Education", repeat: true, fill: "paste" },
    { name: "Work Experience", repeat: true, fill: "paste" },
    { name: "Organizations", repeat: true, fill: "paste" },
    { name: "Projects", repeat: true, fill: "paste" },
    { name: "Courses", repeat: false, fill: "paste", list: true },
    { name: "Skills", repeat: false, fill: "paste", list: true },
    { name: "Career Interests", repeat: false, fill: "pick", list: true },
    { name: "Privacy and Documents", repeat: false, fill: "guide" },
  ],
};

export const PROFILE_HEADER: Record<ProfileKind, RegExp> = {
  linkedin: /^# LinkedIn profile text(?: \(draft\))?$/,
  handshake: /^# Handshake profile text(?: \(draft\))?$/,
};

/** Which profile format a file is, by its name (case-insensitive); null = some other profiles/*.md file. */
export function profileKind(rel: string): ProfileKind | null {
  const n = rel.replace(/\\/g, "/").split("/").pop()!.toLowerCase();
  return n === "linkedin.md" ? "linkedin" : n === "handshake.md" ? "handshake" : null;
}

/** "Experience: Sales Associate at X" -> name "Experience", label "Sales Associate at X". */
export function splitHeading(title: string): { name: string; label: string } {
  const i = title.indexOf(":");
  return i < 0 ? { name: title.trim(), label: "" } : { name: title.slice(0, i).trim(), label: title.slice(i + 1).trim() };
}

/** The limit that applies: the smaller of the table's and the file's own "- Limit: N characters" (a bigger number in the
 * file never lets longer text through). A limit only the file has is a warning: the program cannot see the site's counter. */
export function effectiveLimit(spec: BlockSpec, metaLimit: string | undefined): Limit | null {
  const m = metaLimit ? /([0-9][0-9,]*)\s*([A-Za-z]*)/.exec(metaLimit.normalize("NFKC")) : null;
  const fileN = m ? Number(m[1].replace(/,/g, "")) : null;
  const fileUnit: Limit["unit"] | null = m ? (/^item/i.test(m[2]) ? "items" : "chars") : null;
  const table = spec.limit ?? null;
  if (fileN != null && fileUnit && (!table || (table.unit === fileUnit && fileN < table.n))) return { n: fileN, unit: fileUnit, level: table?.level ?? "warn" };
  return table;
}

// ---------------------------------------------------------------- what resume.yaml allows on a profile

const norm = (s: unknown) => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

/** Source codes as compared between a profile and resume.yaml: the Chinese words are the same as the English ones. */
export function canonSource(c: string): string {
  const x = norm(c);
  return x === "學歷" ? "Education" : x === "求職方向" ? "Job goals" : x.toUpperCase().startsWith("S-") ? x.toUpperCase() : x;
}

export type ResumeIndex = {
  /** "• " sentence (normalised) -> source codes it needs on the Source line (resume bullets, education details) */
  bullets: Map<string, string[]>;
  /** skills item (normalised) -> source codes of its skills line */
  skills: Map<string, string[]>;
  /** every confirmed bullet: the text that can name a tool, with its codes */
  bulletList: { text: string; codes: string[] }[];
};

const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function resumeIndex(resume: any, splitSources: (s: string) => string[]): ResumeIndex {
  const codesOf = (o: any): string[] => {
    const src = o?.sources ?? o?.source;
    const raw = Array.isArray(src) ? src.map(String) : src ? splitSources(String(src)) : [];
    return [...new Set(raw.map(canonSource).filter(Boolean))];
  };
  const bullets = new Map<string, string[]>();
  const bulletList: ResumeIndex["bulletList"] = [];
  const add = (text: unknown, codes: string[]) => {
    const t = norm(text);
    if (!t) return;
    bullets.set(t, [...new Set([...(bullets.get(t) ?? []), ...codes])]);
    bulletList.push({ text: t, codes });
  };
  for (const sec of ["experience", "projects"])
    for (const item of listOf(resume?.[sec])) for (const b of listOf(item?.bullets)) add(b?.text, codesOf(b));
  for (const e of listOf(resume?.education)) for (const d of listOf(e?.details)) add(typeof d === "string" ? d : d?.text, codesOf(e));
  const skills = new Map<string, string[]>();
  for (const l of listOf(resume?.skills))
    for (const it of listOf(l?.items)) {
      const k = norm(it);
      if (k) skills.set(k, [...new Set([...(skills.get(k) ?? []), ...codesOf(l)])]);
    }
  return { bullets, skills, bulletList };
}

/** The codes a "• Skill" line needs: its resume.yaml skills line. A tool named inside a bullet is not enough: the skill
 * itself needs a card and a skills entry (playbooks dig-cards.md). null = not a skills item. */
export function skillCodes(item: string, idx: ResumeIndex): string[] | null {
  return idx.skills.get(norm(item)) ?? null;
}

// ---------------------------------------------------------------- things banned anywhere in a profile file

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE = /(?<![0-9])(?:\+?1[\s.-]?)?\(?[0-9]{3}\)?[\s.-][0-9]{3}[\s.-][0-9]{4}(?![0-9])|(?<![0-9+])\+[0-9]{1,3}[\s.-]?[0-9][0-9\s.-]{7,}[0-9]|(?<![0-9])[0-9]{10}(?![0-9])/g;
const ADDRESS =
  /\b[0-9]{1,6}\s+(?:[A-Z][A-Za-z0-9.]*\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)\b\.?|\bP\.?\s?O\.?\s?Box\s+[0-9]+|\b(?:Apt|Suite|Unit)\.?\s+#?[0-9A-Za-z-]+\b/g;

/** Phone numbers, email addresses and street addresses in one line: what kind and the matched text. */
export function contactMatches(line: string): { kind: "email" | "phone" | "address"; text: string }[] {
  const out: { kind: "email" | "phone" | "address"; text: string }[] = [];
  for (const [kind, re] of [["email", EMAIL], ["phone", PHONE], ["address", ADDRESS]] as const)
    for (const m of line.normalize("NFKC").matchAll(re)) out.push({ kind, text: m[0] });
  return out;
}

const EMOJI = /\p{Emoji_Presentation}|[\u{1F000}-\u{1FAFF}☀-➿️]/u;

/** Plain-text rules for a body line of a pasted block: no "- " bullets, bold, links or emoji. null = fine. */
export function bodyLineProblem(line: string, lang: Language = "zh-TW"): string | null {
  const T = textFor(lang);
  if (/^\s*[-*+]\s/.test(line)) return T.bodyDash;
  if (/^\s*#/.test(line)) return T.bodyHash;
  if (/\*\*|__|`/.test(line)) return T.bodyBold;
  if (/https?:\/\/|\bwww\./i.test(line) || /\]\(/.test(line)) return T.bodyLink;
  if (EMOJI.test(line)) return T.bodyEmoji;
  return null;
}

/** LinkedIn custom URL (official, linkedin.com/help/linkedin/answer/a542685): 3 to 100 letters and digits, no "linkedin". */
export function customUrlProblem(v: string, lang: Language = "zh-TW"): string | null {
  const T = textFor(lang);
  const s = v.trim();
  if (!/^[A-Za-z0-9]+$/.test(s)) return T.urlChars;
  if (s.length < 3 || s.length > 100) return T.urlLength;
  if (/linkedin/i.test(s)) return T.urlLinkedin;
  return null;
}
