// Reads the 104 text files the AI writes (format: playbooks/fill-104.md):
//   104/履歷欄位.md       — "## 欄位名稱", then "- 上限：…" / "- 字數：…" / "- 怎麼填：…" lines, a blank line, the text.
//   jobs/<id>/104-apply.md — "## 應徵信" the same way, and "## 應徵問答" with one "### 問：…" per question.
// Every paragraph of pasted text has a "來源：S-003、學歷" line under it; that line is never copied.

export type Paragraph = { lines: string[]; sources: string[] | null; unsourced: string | null };

export type RawBlock = {
  group: string; // the "## " heading when this block is a "### " under it, else ""
  title: string;
  meta: Record<string, string>;
  body: string[]; // lines after the meta lines, source lines included
};

/** 2023 limits published by 104 (fill-104.md table). A "- 上限：" line with a number in the file wins. */
const LIMITS: [RegExp, number][] = [
  [/英文自傳/, 8000],
  [/自傳/, 4000],
  [/個人簡介|簡介/, 1000],
  [/工作描述|工作經歷/, 2000],
  [/專長/, 1000],
  [/專案|成就/, 2000],
  [/自訂/, 2000],
];

const META_KEYS = new Set(["上限", "字數", "怎麼填", "沒寫的段落", "為什麼留空", "備註", "注意", "提醒", "說明"]);
const META_LINE = /^\s*[-*]\s*([^：:\s]{1,8})\s*[：:]\s*(.*)$/;
// The English profile files (profiles/linkedin.md, handshake.md): "- Fill: paste", keys spelled exactly (case-sensitive).
const META_KEYS_EN = new Set(["Fill", "Limit", "Length", "Title", "Company", "Location", "Dates", "School", "Degree", "GPA", "Suggested"]);
const META_LINE_EN = /^\s*[-*]\s*([A-Za-z]{1,12})\s*:\s*(.*)$/;
// "來源：S-003" or "Source: S-003" (any market): both are the source line, never copied, never checked as text.
export const SOURCE_LINE = /^\s*(?:來源|Source)\s*[：:]\s*(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const SUBTITLE = /^\s*【[^】]*】\s*$/; // 【我是誰】: a pasted sub-heading, sourced by the paragraph under it

export function parse104(text: string, english = false): RawBlock[] {
  const keys = english ? META_KEYS_EN : META_KEYS;
  const metaLine = english ? META_LINE_EN : META_LINE;
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const blocks: RawBlock[] = [];
  let h2: RawBlock | null = null;
  let cur: RawBlock | null = null;
  let inMeta = false;
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fence = !fence;
    const h = fence ? null : HEADING.exec(line);
    if (h && h[1].length === 2) {
      h2 = cur = { group: "", title: h[2], meta: {}, body: [] };
      blocks.push(cur);
      inMeta = true;
      continue;
    }
    if (h && h[1].length === 3 && h2) {
      cur = { group: h2.title, title: h[2], meta: {}, body: [] };
      blocks.push(cur);
      inMeta = true;
      continue;
    }
    if (h && h[1].length === 1) {
      h2 = cur = null; // a new "# " title: what follows is not a 104 field
      continue;
    }
    if (!cur) continue; // file header (更新日期、用到的經歷…)
    const mm = inMeta ? metaLine.exec(line) : null;
    if (mm && keys.has(mm[1])) {
      cur.meta[mm[1]] = mm[2].trim();
      continue;
    }
    inMeta = false;
    cur.body.push(line);
  }
  // A "### " block takes its parent's meta (上限、怎麼填) unless it has its own.
  const byTitle = new Map(blocks.filter((b) => !b.group).map((b) => [b.title, b]));
  for (const b of blocks) if (b.group) b.meta = { ...(byTitle.get(b.group)?.meta ?? {}), ...b.meta };
  // A "## " heading whose only content is its "### " children is not a card of its own.
  return blocks.filter((b) => b.group || b.body.some((l) => l.trim()) || !blocks.some((c) => c.group === b.title));
}

/** Paragraphs (split at blank lines) with the sources under them; `unsourced` = first line with no source after it. */
export function paragraphs(body: string[], english = false): Paragraph[] {
  const out: Paragraph[] = [];
  let cur: string[] = [];
  const done = () => {
    if (!cur.length) return;
    let sources: string[] | null = null;
    let pending: string | null = null;
    let unsourced: string | null = null;
    for (const l of cur) {
      const s = SOURCE_LINE.exec(l);
      if (s) {
        sources = [...(sources ?? []), ...splitSources(s[1], english)];
        pending = null;
      } else if (!SUBTITLE.test(l) && pending == null) pending = l.trim();
    }
    if (pending != null) unsourced = pending;
    out.push({ lines: cur, sources, unsourced });
    cur = [];
  };
  for (const l of body) {
    if (l.trim()) cur.push(l);
    else done();
  }
  done();
  // A sub-heading alone in its paragraph (【我是誰】 then a blank line) belongs to the next paragraph.
  return out.filter((p) => !(p.lines.every((l) => SUBTITLE.test(l))));
}

/** `english` (the US kit): sources are split at commas only, so "Job goals" stays one source; "S-001 S-002" still splits. */
export function splitSources(s: string, english = false): string[] {
  if (english)
    return s
      .split(/[,;，、/／]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .flatMap((x) => (/^S-[0-9]+(?:\s+S-[0-9]+)+$/i.test(x) ? x.split(/\s+/) : [x]));
  return s
    .split(/[、,，/／;；\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Text the user pastes into 104: no source lines, paragraphs kept, outer blank lines trimmed. */
export function copyText(body: string[]): string {
  return body
    .filter((l) => !SOURCE_LINE.test(l))
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The limit for a field: the smaller of the one written in the file (a screenshot can show a lower one) and 104's
 * published table — a bigger number in the file never lets longer text through. */
export function limitFor(b: RawBlock): { limit: number | null; from: "file" | "table" | null } {
  const name = `${b.group} ${b.title}`;
  const table = LIMITS.find(([re]) => re.test(name))?.[1] ?? null;
  const m = /([0-9][0-9,]*)\s*字/.exec((b.meta["上限"] ?? "").normalize("NFKC"));
  const file = m ? Number(m[1].replace(/,/g, "")) : null;
  if (file != null && (table == null || file <= table)) return { limit: file, from: "file" };
  if (table != null) return { limit: table, from: "table" };
  return { limit: null, from: null };
}

// 「怎麼填」 decides first: anything that says 貼上 is pasted ("直接貼上，這欄可以不填" is still pasted text).
const NOT_PASTED = /下拉|選單|用選的|留空|自己填|不用填|不要填|不填/;
const NOT_PASTED_TEXT = /^(?:建議選|請自己填|請你自己|建議留空|沒說過|你還沒決定)/;

/** Fields that are picked from a list, left empty or filled by the user: shown, never copied (still checked). */
export function isPasted(b: RawBlock, text: string): boolean {
  const how = (b.meta["怎麼填"] ?? "").trim();
  if (/貼上/.test(how)) return true;
  if (NOT_PASTED.test(how)) return false;
  if (NOT_PASTED_TEXT.test(text.replace(/^[-*]\s*/, ""))) return false;
  return true;
}
