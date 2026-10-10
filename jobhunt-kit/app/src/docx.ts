// 讀 Word（.docx）舊履歷的文字，只印在畫面上給 AI 讀，不存檔。
//   jobhunt read <檔案>   （Windows：.\jobhunt.exe read inbox\舊履歷.docx；Mac：./jobhunt-mac-arm64 read inbox/舊履歷.docx）
// 檔案一定要在求職資料夾裡面（建議放 inbox/）。成功結束碼 0；檔案不對、讀不了、不在資料夾裡都是 2。
// 不用外部套件：自己讀 ZIP 目錄、用 node:zlib 解壓，加上大小和壓縮比限制（防 zip bomb）。
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";
import * as R from "../../web/js/core/rules.js";
import { looksLikeJobhuntFolder } from "./folder.ts";
import { replaceExtraIds } from "./ids.ts";

// ---------------------------------------------------------------- limits

export const LIMITS = {
  file: 50 * 1024 * 1024, // the .docx itself (pictures make resumes big; text never is)
  entries: 5000, // ZIP entries (a real .docx has a few dozen)
  entry: 20 * 1024 * 1024, // one unpacked part
  total: 40 * 1024 * 1024, // all unpacked parts we read, together
  ratio: 200, // unpacked / packed, checked once a part is over 1 MB
  ratioFloor: 1024 * 1024,
  depth: 400, // XML nesting
};

export type DocxErrorKind = "corrupt" | "encrypted" | "too-big";

export class DocxError extends Error {
  constructor(readonly kind: DocxErrorKind, detail: string) {
    super(detail);
  }
}

// ---------------------------------------------------------------- ZIP (central directory + raw deflate)

type ZipEntry = { name: string; method: number; flags: number; crc: number; packed: number; size: number; offset: number };

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000;

export function zipEntries(b: Uint8Array): ZipEntry[] {
  // End of central directory: last 22 bytes + up to 64 KB of comment.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError("corrupt", "no end of central directory");
  const count = u16(b, eocd + 10);
  const cdSize = u32(b, eocd + 12);
  const cdOffset = u32(b, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new DocxError("corrupt", "zip64 not supported");
  if (count > LIMITS.entries) throw new DocxError("too-big", `${count} entries`);
  if (cdOffset + cdSize > eocd) throw new DocxError("corrupt", "central directory out of range");

  const out: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || u32(b, p) !== 0x02014b50) throw new DocxError("corrupt", `bad central directory entry ${n}`);
    const flags = u16(b, p + 8);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    if (p + 46 + nameLen > eocd) throw new DocxError("corrupt", "entry name out of range");
    const nameBytes = b.subarray(p + 46, p + 46 + nameLen);
    const name = flags & 0x800 ? new TextDecoder().decode(nameBytes) : String.fromCharCode(...nameBytes);
    out.push({
      name: name.replace(/\\/g, "/"),
      flags,
      method: u16(b, p + 10),
      crc: u32(b, p + 16),
      packed: u32(b, p + 20),
      size: u32(b, p + 24),
      offset: u32(b, p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Unpacks one entry, never more than the limits allow (declared sizes are checked first, the real output too). */
export function unzipEntry(b: Uint8Array, e: ZipEntry, budget: { left: number }): Uint8Array {
  if (e.flags & 0x1) throw new DocxError("encrypted", `${e.name} is encrypted`);
  if (e.size > LIMITS.entry || e.size > budget.left) throw new DocxError("too-big", `${e.name}: ${e.size} bytes`);
  if (e.size > LIMITS.ratioFloor && e.size > e.packed * LIMITS.ratio) throw new DocxError("too-big", `${e.name}: ratio ${Math.round(e.size / Math.max(1, e.packed))}`);
  const h = e.offset;
  if (h + 30 > b.length || u32(b, h) !== 0x04034b50) throw new DocxError("corrupt", `${e.name}: bad local header`);
  const start = h + 30 + u16(b, h + 26) + u16(b, h + 28);
  if (start + e.packed > b.length) throw new DocxError("corrupt", `${e.name}: data out of range`);
  const packed = b.subarray(start, start + e.packed);
  let data: Uint8Array;
  if (e.method === 0) {
    if (e.packed !== e.size) throw new DocxError("corrupt", `${e.name}: stored size mismatch`);
    data = packed;
  } else if (e.method === 8) {
    try {
      // One byte over the declared size: a part that lies about its size fails here instead of filling memory.
      data = inflateRawSync(packed, { maxOutputLength: Math.min(LIMITS.entry, budget.left, e.size + 1) || 1 });
    } catch (err: any) {
      if (err?.code === "ERR_BUFFER_TOO_LARGE" || /larger than/i.test(String(err?.message))) throw new DocxError("too-big", `${e.name}: inflates past its declared size`);
      throw new DocxError("corrupt", `${e.name}: ${err?.message ?? err}`);
    }
  } else {
    throw new DocxError("corrupt", `${e.name}: compression method ${e.method}`);
  }
  if (data.length !== e.size) throw new DocxError("corrupt", `${e.name}: size ${data.length} != ${e.size}`);
  if (Bun.hash.crc32(data) !== e.crc) throw new DocxError("corrupt", `${e.name}: crc mismatch`);
  budget.left -= data.length;
  return data;
}

// ---------------------------------------------------------------- tiny namespace-aware XML parser

type El = { ns: string; name: string; attrs: Record<string, string>; kids: (El | string)[] };

const W_NS = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const REL_NS = new Set(["http://schemas.openxmlformats.org/package/2006/relationships"]);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return ENTITIES[e] ?? m;
  });
}

export function parseXml(src: string): El {
  const root: El = { ns: "", name: "#root", attrs: {}, kids: [] };
  const stack: { el: El; qname: string; scope: Record<string, string> }[] = [{ el: root, qname: "", scope: { xml: "http://www.w3.org/XML/1998/namespace" } }];
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i && stack.length > 1) stack[stack.length - 1].el.kids.push(decodeEntities(src.slice(i, textEnd)));
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      if (e < 0) throw new DocxError("corrupt", "unterminated comment");
      i = e + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      if (e < 0) throw new DocxError("corrupt", "unterminated CDATA");
      if (stack.length > 1) stack[stack.length - 1].el.kids.push(src.slice(lt + 9, e));
      i = e + 3;
    } else if (src.startsWith("<?", lt)) {
      const e = src.indexOf("?>", lt + 2);
      if (e < 0) throw new DocxError("corrupt", "unterminated processing instruction");
      i = e + 2;
    } else if (src.startsWith("<!", lt)) {
      // DOCTYPE (never in a real .docx): skipped, its entities are never expanded. Look for "[" only up to the first
      // ">": searching the rest of the file for every declaration took quadratic time (a file of "<!x>" hung the exe).
      const gt = src.indexOf(">", lt);
      if (gt < 0) throw new DocxError("corrupt", "unterminated declaration");
      let bracket = -1;
      for (let k = lt + 2; k < gt; k++) {
        if (src.charCodeAt(k) === 0x5b) {
          bracket = k;
          break;
        }
      }
      const e = bracket >= 0 ? src.indexOf("]>", bracket) + 1 : gt;
      if (e <= 0) throw new DocxError("corrupt", "unterminated declaration");
      i = e + 1;
    } else if (src[lt + 1] === "/") {
      const gt = src.indexOf(">", lt);
      if (gt < 0) throw new DocxError("corrupt", "unterminated end tag");
      const qname = src.slice(lt + 2, gt).trim();
      let k = stack.length - 1;
      while (k > 0 && stack[k].qname !== qname) k--;
      if (k > 0) stack.length = k; // tolerant: closes anything left open inside it
      i = gt + 1;
    } else {
      // Start tag: find its end outside quoted attribute values.
      let j = lt + 1;
      let quote = "";
      for (; j < n; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      if (j >= n) throw new DocxError("corrupt", "unterminated start tag");
      let body = src.slice(lt + 1, j);
      const selfClose = body.endsWith("/");
      if (selfClose) body = body.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(body);
      if (!m) throw new DocxError("corrupt", "bad tag");
      const qname = m[1];
      const parent = stack[stack.length - 1];
      let scope = parent.scope;
      const attrs: Record<string, string> = {};
      for (const a of body.slice(qname.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        const key = a[1];
        const value = decodeEntities(a[2] ?? a[3] ?? "");
        if (key === "xmlns" || key.startsWith("xmlns:")) {
          if (scope === parent.scope) scope = { ...parent.scope };
          scope[key === "xmlns" ? "" : key.slice(6)] = value;
        } else {
          attrs[key.includes(":") ? key.slice(key.indexOf(":") + 1) : key] = value;
        }
      }
      const colon = qname.indexOf(":");
      const prefix = colon >= 0 ? qname.slice(0, colon) : "";
      const el: El = { ns: scope[prefix] ?? "", name: colon >= 0 ? qname.slice(colon + 1) : qname, attrs, kids: [] };
      parent.el.kids.push(el);
      if (!selfClose) {
        if (stack.length > LIMITS.depth) throw new DocxError("corrupt", "XML nested too deep");
        stack.push({ el, qname, scope });
      }
      i = j + 1;
    }
  }
  const top = root.kids.find((k): k is El => typeof k !== "string");
  if (!top) throw new DocxError("corrupt", "empty XML");
  return top;
}

const isW = (k: El | string, name: string): k is El => typeof k !== "string" && W_NS.has(k.ns) && k.name === name;
const isMC = (k: El | string, name: string): k is El => typeof k !== "string" && k.ns === MC_NS && k.name === name;
const child = (el: El | undefined, name: string) => el?.kids.find((k): k is El => isW(k, name));
const elements = (el: El) => el.kids.filter((k): k is El => typeof k !== "string");

// ---------------------------------------------------------------- WordprocessingML → lines

/** Elements whose content is never visible text: properties, deleted and moved-away text. */
const SKIP = new Set(["del", "moveFrom", "delText", "instrText", "delInstrText", "pPr", "rPr", "sectPr", "tblPr", "tblGrid", "trPr", "tcPr", "sdtPr", "sdtEndPr", "footnoteReference", "endnoteReference", "commentReference"]);

/** A run formatted as hidden text (w:rPr/w:vanish, unless explicitly switched off with val 0/false/off). */
function isHidden(r: El): boolean {
  const v = child(child(r, "rPr"), "vanish");
  if (!v) return false;
  const val = (v.attrs.val ?? "").toLowerCase();
  return !["0", "false", "off"].includes(val);
}

/** mc:AlternateContent shows one of its versions: the first Choice (what Word shows), never the Fallback copy. */
function alternate(el: El): El[] {
  const choice = el.kids.find((k): k is El => isMC(k, "Choice"));
  const fallback = el.kids.find((k): k is El => isMC(k, "Fallback"));
  const pick = choice ?? fallback;
  return pick ? elements(pick) : [];
}

class Reader {
  /** styleId → numbered? (paragraph styles with a list numbering, following basedOn) */
  private styleNum = new Map<string, { numId?: string; basedOn?: string }>();

  constructor(styles: El | null) {
    if (!styles) return;
    for (const s of elements(styles)) {
      if (!isW(s, "style") || !s.attrs.styleId) continue;
      const numId = child(child(child(s, "pPr"), "numPr"), "numId")?.attrs.val;
      this.styleNum.set(s.attrs.styleId, { numId, basedOn: child(s, "basedOn")?.attrs.val });
    }
  }

  private styleNumbered(id: string | undefined): boolean {
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const s = this.styleNum.get(id);
      if (!s) return false;
      if (s.numId !== undefined) return s.numId !== "0";
      id = s.basedOn;
    }
    return false;
  }

  private numbered(p: El): boolean {
    const pPr = child(p, "pPr");
    const numId = child(child(pPr, "numPr"), "numId")?.attrs.val;
    if (numId !== undefined) return numId !== "0";
    return this.styleNumbered(child(pPr, "pStyle")?.attrs.val);
  }

  /** Block content (body, cell, header, text box): paragraphs and tables in order. */
  blocks(el: El): string[] {
    const out: string[] = [];
    for (const k of elements(el)) {
      if (isW(k, "p")) out.push(...this.paragraph(k));
      else if (isW(k, "tbl")) out.push(...this.table(k));
      else if (isMC(k, "AlternateContent")) out.push(...this.blocks({ ...k, kids: alternate(k) }));
      else if (W_NS.has(k.ns) && SKIP.has(k.name)) continue;
      else out.push(...this.blocks(k)); // sdt, sdtContent, customXml, ins, moveTo, body…
    }
    return out;
  }

  paragraph(p: El): string[] {
    const st = { text: "", boxes: [] as string[] };
    this.inline(p, st);
    if (!st.text.trim() && st.boxes.length) return st.boxes; // a paragraph that only anchors a text box
    const lines = st.text.split("\n");
    if (this.numbered(p) && lines.some((l) => l.trim())) lines[0] = "• " + lines[0];
    return [...lines, ...st.boxes];
  }

  private inline(el: El, st: { text: string; boxes: string[] }) {
    for (const k of el.kids) {
      if (typeof k === "string") continue; // only w:t holds text; the rest is layout whitespace
      if (W_NS.has(k.ns)) {
        switch (k.name) {
          case "t":
            st.text += k.kids.filter((x): x is string => typeof x === "string").join("");
            continue;
          case "tab":
          case "ptab":
            st.text += "\t";
            continue;
          case "br":
          case "cr":
            st.text += "\n";
            continue;
          case "noBreakHyphen":
            st.text += "-";
            continue;
          case "txbxContent":
            st.boxes.push(...this.blocks(k));
            continue;
          case "p":
            st.boxes.push(...this.paragraph(k));
            continue;
          case "tbl":
            st.boxes.push(...this.table(k));
            continue;
        }
        if (SKIP.has(k.name)) continue;
        // Text the person hid in Word (w:vanish) is not printed: they chose not to show it (owner decision 2026-10-09).
        if (k.name === "r" && isHidden(k)) continue;
      } else if (isMC(k, "AlternateContent")) {
        this.inline({ ...k, kids: alternate(k) }, st);
        continue;
      }
      this.inline(k, st); // r, hyperlink, ins, moveTo, fldSimple, smartTag, drawing/pict (for text boxes)…
    }
  }

  private rows(el: El, out: El[] = []): El[] {
    for (const k of elements(el)) {
      if (isW(k, "tr")) {
        if (!child(child(k, "trPr"), "del")) out.push(k); // a row deleted with tracked changes on
      } else if (isMC(k, "AlternateContent")) this.rows({ ...k, kids: alternate(k) }, out);
      else if (!(W_NS.has(k.ns) && SKIP.has(k.name))) this.rows(k, out);
    }
    return out;
  }

  private cells(el: El, out: El[] = []): El[] {
    for (const k of elements(el)) {
      if (isW(k, "tc")) out.push(k);
      else if (isMC(k, "AlternateContent")) this.cells({ ...k, kids: alternate(k) }, out);
      else if (!(W_NS.has(k.ns) && SKIP.has(k.name))) this.cells(k, out);
    }
    return out;
  }

  /** A data row (學歷 ｜ 範例大學) is one line, cells joined by「 ｜ 」, a cell's paragraphs joined by a space; empty
   * cells (layout, merged) left out. A layout row — a cell holding 3+ paragraphs, or a list plus anything else, like the
   * two-column resume templates that put the whole page in one row — prints each cell as its own block of lines with a
   * blank line between cells, so its headings and bullets stay on their own lines. */
  table(tbl: El): string[] {
    const out: string[] = [];
    for (const tr of this.rows(tbl)) {
      const cells = this.cells(tr)
        .map((tc) => tidy(this.blocks(tc)))
        .filter((lines) => lines.length);
      if (!cells.length) continue;
      const filled = (lines: string[]) => lines.filter((l) => l.trim());
      const layout = cells.some((c) => filled(c).length >= 3 || (filled(c).length >= 2 && c.some((l) => l.startsWith("• "))));
      if (layout) out.push("", ...cells.flatMap((c) => [...c, ""]));
      else out.push(cells.map((c) => filled(c).map((l) => l.replace(/\s+/g, " ").trim()).join(" ")).join(" ｜ "));
    }
    return out;
  }
}

function tidy(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(/[ 　\t]+$/, "");
    if (!l.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
    } else out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** Plain text of a .docx (headers, body, footers), no ID masking. Throws DocxError. */
export function docxText(bytes: Uint8Array): string {
  const entries = zipEntries(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const budget = { left: LIMITS.total };
  const xml = (name: string): El | null => {
    const e = byName.get(name);
    if (!e) return null;
    return parseXml(new TextDecoder("utf-8").decode(unzipEntry(bytes, e, budget)));
  };

  // The main part is wherever the package's officeDocument relationship points (word/document.xml in practice).
  let main = "word/document.xml";
  const rels = xml("_rels/.rels");
  if (rels && REL_NS.has(rels.ns)) {
    const r = elements(rels).find((k) => /\/officeDocument$/.test(k.attrs.Type ?? ""));
    if (r?.attrs.Target) main = r.attrs.Target.replace(/^\/+/, "");
  }
  const doc = xml(main);
  if (!doc || !isW(doc, "document")) throw new DocxError("corrupt", `no Word document part (${main})`);
  const dir = main.includes("/") ? main.slice(0, main.lastIndexOf("/") + 1) : "";
  const styles = xml(`${dir}styles.xml`);
  const reader = new Reader(styles && isW(styles, "styles") ? styles : null);

  const parts = (kind: "header" | "footer") => {
    const re = new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${kind}(\\d*)\\.xml$`, "i");
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of entries
      .map((e) => ({ e, m: re.exec(e.name) }))
      .filter((x) => x.m)
      .sort((a, b) => Number(a.m![1] || 0) - Number(b.m![1] || 0))) {
      const el = xml(e.e.name);
      if (!el) continue;
      const text = tidy(reader.blocks(el)).join("\n");
      if (text && !seen.has(text)) {
        seen.add(text); // first-page / even-page headers often repeat the same words
        out.push(text);
      }
    }
    return out;
  };

  const headers = parts("header");
  const body = tidy(reader.blocks(doc)).join("\n");
  const footers = parts("footer");
  return [...headers, body, ...footers].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------- ID numbers

const INVISIBLE = /[­​-‏⁠-⁤﻿]/g;
// Same shapes as rules.js idNumbers (new: letter + 1/2/8/9 + 8 digits; old: two capitals + 8 digits), matched on the
// original text, full-width letters and digits too.
const ID_NEW = /(?<![A-Za-z0-9Ａ-Ｚａ-ｚ０-９])[A-Za-zＡ-Ｚａ-ｚ][1289１２８９][0-9０-９]{8}(?![0-9０-９])/g;
const ID_OLD = /(?<![A-Za-z0-9Ａ-Ｚａ-ｚ０-９])[A-ZＡ-Ｚ]{2}[0-9０-９]{8}(?![0-9０-９])/g;
export const ID_MASK = "[已遮住身分證字號]";

export function maskIdNumbers(text: string): { text: string; count: number } {
  let t = text.replace(INVISIBLE, "");
  let count = 0;
  const mask = () => {
    count++;
    return ID_MASK;
  };
  t = t.replace(ID_NEW, mask).replace(ID_OLD, mask);
  t = replaceExtraIds(t, mask); // SSN, SEVIS, A-number, China ID (src/ids.ts)
  // Anything rules.js still sees (other look-alike characters, e.g. ①) is masked on that line, normalized; the other
  // lines keep their full-width punctuation.
  if (R.idNumbers(t).length) {
    t = t
      .split("\n")
      .map((line) => (R.idNumbers(line).length ? line.normalize("NFKC").replace(ID_NEW, mask).replace(ID_OLD, mask) : line))
      .join("\n");
  }
  return { text: t, count };
}

// ---------------------------------------------------------------- command line

const USAGE_WIN = ".\\jobhunt.exe read inbox\\舊履歷.docx";
const USAGE_MAC = "./jobhunt-mac-arm64 read inbox/舊履歷.docx";

export const MESSAGES = {
  usage: `用法：jobhunt read <檔案>，例如 ${USAGE_WIN}（Mac：${USAGE_MAC}）。一次讀一個檔案，檔名有空白要加引號。`,
  notFolder: "這個資料夾看起來不是求職資料夾，沒有讀。請把程式放進求職資料夾（有 AGENTS.md 的那個）再執行。",
  notFound: (p: string) => `找不到「${maskIdNumbers(p).text}」。請確認檔案放在求職資料夾的 inbox 裡，檔名打對（含 .docx）。`,
  outside: "只能讀求職資料夾裡面的檔案（建議放在 inbox）。這個檔案在資料夾外面，沒有讀。",
  isDir: (p: string) => `「${p}」是資料夾，不是檔案。`,
  doc: "這是舊版 Word 檔（.doc），程式讀不了。請用 Word 打開它，按「檔案」→「另存新檔」，存成 .docx（或 PDF），放進 inbox 再試一次。",
  pdf: "這是 PDF 檔，不用這個程式：AI 可以直接讀 PDF 檔案。",
  pages: "這是 Mac 的 Pages 檔，程式讀不了。請在 Pages 按「檔案」→「輸出至」→「Word」存成 .docx，放進 inbox 再試一次。",
  other: "這個程式只讀 Word 的 .docx 檔。PDF、文字檔請 AI 直接讀檔案；其他格式請用原本的程式另存成 .docx。",
  encrypted: "這個 Word 檔有密碼保護，程式讀不了。請用 Word 打開它（輸入密碼），把密碼拿掉，或另存一份沒有密碼的 .docx，再試一次。",
  cfbDocx: "這個 Word 檔有密碼保護，或其實是舊版 Word 格式，程式讀不了。請用 Word 打開它，按「檔案」→「另存新檔」，存成一份沒有密碼的 .docx，再試一次。",
  cannotOpen: "這個檔案現在打不開：可能正被別的程式用著（例如 OneDrive 正在同步、防毒軟體正在檢查、還沒下載完），或沒有權限讀。請等一下再試；還是不行，就把 Word 關掉，或在 Word 裡另存一份到 inbox 再讀那一份。",
  corrupt: "這個 Word 檔打不開，可能壞了或沒有存完整。請用 Word 打開它，按「檔案」→「另存新檔」存成新的 .docx 再試一次；還是不行，就把文字複製貼給 AI。",
  tooBig: "這個檔案太大或內容不正常，程式不讀。請用 Word 打開它，按「檔案」→「另存新檔」存成新的 .docx 再試一次；還是不行，就把文字複製貼給 AI。",
  empty: "（這個檔案裡沒有讀到文字，可能整份是圖片。請把文字複製貼給 AI，或把原本的檔案另存成 PDF 給 AI 讀。）",
  header: (name: string) => `＝＝ ${name} 的文字（只給 AI 讀，沒有存成檔案）＝＝`,
  masked: (n: number) => `（有 ${n} 個身分證字號已經遮住。）`,
};

function isCfb(b: Uint8Array) {
  return b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;
}

function hasUtf16(b: Uint8Array, word: string) {
  return Buffer.from(b.buffer, b.byteOffset, b.byteLength).includes(Buffer.from(word, "utf16le"));
}

function isPdf(b: Uint8Array) {
  return Buffer.from(b.buffer, b.byteOffset, Math.min(b.byteLength, 1024)).includes("%PDF-");
}

function isZip(b: Uint8Array) {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06);
}

/** Positionals after "read" (the --dir value and the word "read" itself left out); unknown flags reported. */
function readArgs(argv: string[]): { paths: string[]; unknown: string[] } {
  const paths: string[] = [];
  const unknown: string[] = [];
  let seenRead = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "--folder") {
      i++;
      continue;
    }
    if (/^--(?:dir|folder)=/.test(a)) continue;
    if (a.startsWith("-") && a.length > 1) {
      unknown.push(a);
      continue;
    }
    if (!seenRead && a === "read") {
      seenRead = true;
      continue;
    }
    paths.push(a);
  }
  return { paths, unknown };
}

function inside(root: string, p: string): boolean {
  const r = root.endsWith(sep) ? root : root + sep;
  return process.platform === "win32" ? p.toLowerCase().startsWith(r.toLowerCase()) : p.startsWith(r);
}

/** File-system calls runRead uses (tests replace them to simulate a locked file). */
export type ReadIo = { realpathSync: (p: string) => string; statSync: typeof statSync; readFileSync: (p: string) => Uint8Array };
const REAL_IO: ReadIo = { realpathSync: (p) => realpathSync(p), statSync, readFileSync: (p) => readFileSync(p) };

/** The file (or a folder on its path) is not there — as opposed to one that exists but can't be opened right now
 * (locked by OneDrive, antivirus or a download still being written, or no permission): that gets MESSAGES.cannotOpen. */
const isMissing = (err: unknown) => ["ENOENT", "ENOTDIR"].includes((err as any)?.code);

/** `jobhunt read <file>`: prints the text (UTF-8) to stdout. 0 = printed; 2 = wrong file, can't read, outside folder. */
export function runRead(argv: string[], dir: string | null, print: (s: string) => void = (s) => console.log(s), ioOverride: Partial<ReadIo> = {}): number {
  const io = { ...REAL_IO, ...ioOverride };
  const { paths, unknown } = readArgs(argv);
  if (unknown.length || paths.length !== 1) {
    if (unknown.length) print(`不認得「${unknown.join(" ")}」。`);
    print(MESSAGES.usage);
    return 2;
  }
  if (!dir || !looksLikeJobhuntFolder(dir)) {
    print(MESSAGES.notFolder);
    if (dir) print(`程式現在在：${dir}`);
    return 2;
  }
  const given = paths[0];
  const abs = isAbsolute(given) ? resolve(given) : resolve(dir, given);
  let real: string;
  let realRoot: string;
  try {
    realRoot = io.realpathSync(dir);
    real = io.realpathSync(abs);
  } catch (err) {
    // Missing file: say so only if it would have been inside the folder anyway.
    print(!inside(resolve(dir), abs) ? MESSAGES.outside : isMissing(err) ? MESSAGES.notFound(given) : MESSAGES.cannotOpen);
    return 2;
  }
  // The real location (symlinks and junctions followed) must be inside the folder too.
  if (!inside(realRoot, real) || !inside(resolve(dir), abs)) {
    print(MESSAGES.outside);
    return 2;
  }
  let st: ReturnType<typeof statSync>;
  try {
    st = io.statSync(real);
  } catch (err) {
    print(isMissing(err) ? MESSAGES.notFound(given) : MESSAGES.cannotOpen);
    return 2;
  }
  if (st.isDirectory()) {
    print(MESSAGES.isDir(given));
    return 2;
  }
  if (!st.isFile()) {
    print(MESSAGES.other);
    return 2;
  }
  const ext = extname(real).toLowerCase();
  if (ext === ".pdf") return (print(MESSAGES.pdf), 2);
  if (ext === ".pages") return (print(MESSAGES.pages), 2);
  if (![".docx", ".docm", ".doc", ".dotx"].includes(ext)) return (print(MESSAGES.other), 2);
  if (st.size > LIMITS.file) return (print(MESSAGES.tooBig), 2);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(io.readFileSync(real));
  } catch (err) {
    // EBUSY (opened by another program with no sharing), EPERM/EACCES, EIO…: a plain message, never a crash dump.
    print(isMissing(err) ? MESSAGES.notFound(given) : MESSAGES.cannotOpen);
    return 2;
  }
  if (isPdf(bytes)) return (print(MESSAGES.pdf), 2);
  if (isCfb(bytes)) {
    if (ext === ".doc") print(MESSAGES.doc);
    else print(hasUtf16(bytes, "EncryptedPackage") ? MESSAGES.encrypted : MESSAGES.cfbDocx);
    return 2;
  }
  if (ext === ".doc" && !isZip(bytes)) return (print(MESSAGES.doc), 2); // a .doc that is really a .docx is read below
  let text: string;
  try {
    if (!isZip(bytes)) throw new DocxError("corrupt", "not a zip file");
    text = docxText(bytes);
  } catch (e) {
    if (!(e instanceof DocxError)) throw e;
    print(e.kind === "encrypted" ? MESSAGES.encrypted : e.kind === "too-big" ? MESSAGES.tooBig : MESSAGES.corrupt);
    return 2;
  }

  const masked = maskIdNumbers(text);
  const name = maskIdNumbers(basename(real)).text;
  const out = [MESSAGES.header(name), masked.text.trim() ? masked.text : MESSAGES.empty];
  if (masked.count) out.push("", MESSAGES.masked(masked.count));
  print(out.join("\n"));
  return 0;
}
