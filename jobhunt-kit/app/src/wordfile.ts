// The resume file (resumes/<id>.html) as an editable Word file (.docx), for people who want to change a line by
// hand or whose posting asks for Word. Input is the same cleaned HTML the PDF is printed from, so the words are the
// ones the program already checked; what the person types in Word afterwards is not checked by anything.
//
// No packages: the page is read with a small tag parser (the four resume templates share one structure: header with
// name / contact, then <section class="block"> with <h2> and entries), written as WordprocessingML, and zipped by hand.
import { deflateRawSync } from "node:zlib";
import { decodeEntities, stripComments } from "./htmltext.ts";

export type WordOptions = { paper: "a4" | "letter"; title: string; lang: "zh-TW" | "en" };

// ---------------------------------------------------------------- a tiny HTML tree

type El = { tag: string; cls: string[]; kids: (El | string)[] };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
const INLINE = new Set(["a", "abbr", "b", "cite", "code", "em", "font", "i", "label", "mark", "small", "span", "strong", "sub", "sup", "time", "u"]);
const SKIPPED = new Set(["script", "style", "template", "head", "title", "svg", "img", "button", "textarea", "select", "input", "iframe", "object", "noscript"]);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;

function classes(attrs: string): string[] {
  const m = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  return (m ? (m[1] ?? m[2] ?? m[3] ?? "") : "").split(/\s+/).filter(Boolean);
}

function parse(html: string): El {
  // <!DOCTYPE …> is not a tag the pattern below knows: left in, it would print as text
  const src = stripComments(html).replace(/<![^>]*>/g, "");
  const lower = src.toLowerCase();
  const root: El = { tag: "#root", cls: [], kids: [] };
  const stack: El[] = [root];
  const top = () => stack[stack.length - 1];
  const re = new RegExp(TAG.source, "g");
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > pos) top().kids.push(decodeEntities(src.slice(pos, m.index)));
    pos = re.lastIndex;
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--)
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      continue;
    }
    if (RAW.has(tag)) {
      const end = lower.indexOf(`</${tag}`, pos);
      const close = end < 0 ? -1 : src.indexOf(">", end);
      pos = re.lastIndex = close < 0 ? src.length : close + 1;
      continue;
    }
    const el: El = { tag, cls: classes(attrs), kids: [] };
    top().kids.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(el);
  }
  if (pos < src.length) top().kids.push(decodeEntities(src.slice(pos)));
  return root;
}

// ---------------------------------------------------------------- paragraphs

type Run = { t?: string; bold?: boolean; color?: string; tab?: boolean; br?: boolean };
type Para = { style: string; runs: Run[] };

// XML 1.0 can't carry most control characters at all, not even escaped
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");

const MUTED = "61666E";

function inlineRuns(node: El | string, bold: boolean, color: string | undefined, out: Run[]): void {
  if (typeof node === "string") {
    const t = clean(node).replace(/\s+/g, " ");
    if (t) out.push({ t, bold, color });
    return;
  }
  if (SKIPPED.has(node.tag) || node.cls.includes("print-tip")) return;
  if (node.tag === "br") {
    out.push({ br: true });
    return;
  }
  if (node.cls.includes("role")) {
    // the template draws a thin vertical rule between the school / company and the role
    out.push({ t: " | ", color: MUTED });
    for (const k of node.kids) inlineRuns(k, false, color, out);
    return;
  }
  const strong = bold || node.tag === "b" || node.tag === "strong" || node.cls.includes("label");
  for (const k of node.kids) inlineRuns(k, strong, color, out);
}

/** Runs ready to print: no space at the ends, no double spaces across run boundaries, no empty runs. */
function tidy(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (r.t != null) {
      let t = r.t;
      const prev = out[out.length - 1];
      if (!prev || prev.br || prev.tab || (prev.t ?? "").endsWith(" ")) t = t.replace(/^ /, "");
      if (!t) continue;
      out.push({ ...r, t });
    } else out.push(r);
  }
  while (out.length && out[out.length - 1].t != null && /^ *$/.test(out[out.length - 1].t!)) out.pop();
  const last = out[out.length - 1];
  if (last?.t != null) last.t = last.t.replace(/ +$/, "");
  return out;
}

const hasText = (runs: Run[]) => runs.some((r) => r.t != null && r.t.trim() !== "");

function paragraphs(root: El): Para[] {
  const paras: Para[] = [];
  const push = (style: string, runs: Run[]) => {
    const r = tidy(runs);
    if (hasText(r)) paras.push({ style, runs: r });
  };
  const inlineOf = (el: El, color?: string): Run[] => {
    const out: Run[] = [];
    for (const k of el.kids) inlineRuns(k, false, color, out);
    return out;
  };

  function walkKids(el: El): void {
    let buf: Run[] = [];
    const flush = () => {
      push("Normal", buf);
      buf = [];
    };
    for (const k of el.kids) {
      if (typeof k === "string" || INLINE.has(k.tag) || k.tag === "br") inlineRuns(k, false, undefined, buf);
      else {
        flush();
        walk(k);
      }
    }
    flush();
  }

  function walk(el: El): void {
    if (SKIPPED.has(el.tag) || el.cls.includes("print-tip")) return;
    const { tag, cls } = el;
    if (tag === "h1") return push("Name", inlineOf(el));
    if (tag === "h2" || tag === "h3") return push("Heading1", inlineOf(el));
    if (cls.includes("want")) return push("Want", inlineOf(el));
    if (cls.includes("entry-sub")) return push("EntrySub", inlineOf(el));
    if (cls.includes("entry-head")) {
      const runs: Run[] = [];
      for (const k of el.kids) {
        if (typeof k === "string") {
          inlineRuns(k, false, undefined, runs);
          continue;
        }
        if (k.cls.includes("entry-date")) {
          const d = inlineOf(k, MUTED);
          if (hasText(d)) runs.push({ tab: true }, ...d);
        } else if (k.cls.includes("entry-title")) {
          const t: Run[] = [];
          for (const x of k.kids) inlineRuns(x, true, undefined, t);
          runs.push(...t);
        } else runs.push(...inlineOf(k));
      }
      return push("EntryHead", runs);
    }
    if (tag === "ul" || tag === "ol") {
      const items = el.kids.filter((k): k is El => typeof k !== "string" && k.tag === "li");
      if (cls.includes("contact")) {
        const runs: Run[] = [];
        for (const li of items) {
          const part = tidy(inlineOf(li));
          if (!hasText(part)) continue;
          if (runs.length) runs.push({ t: "  ·  ", color: MUTED });
          runs.push(...part);
        }
        return push("Contact", runs);
      }
      const style = cls.includes("skills") ? "Skill" : "Bullet";
      for (const li of items) push(style, inlineOf(li));
      return;
    }
    if (tag === "li") return push("Bullet", inlineOf(el));
    if (tag === "p") return push(cls.includes("summary") ? "Summary" : "Normal", inlineOf(el));
    walkKids(el);
  }

  walkKids(root);
  return paras;
}

// ---------------------------------------------------------------- WordprocessingML

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const xe = (s: string) => clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runXml(r: Run): string {
  if (r.tab) return "<w:r><w:tab/></w:r>";
  if (r.br) return "<w:r><w:br/></w:r>";
  const props = (r.bold ? "<w:b/><w:bCs/>" : "") + (r.color ? `<w:color w:val="${r.color}"/>` : "");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xe(r.t ?? "")}</w:t></w:r>`;
}

const paraXml = (p: Para) => `<w:p><w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>${p.runs.map(runXml).join("")}</w:p>`;


type Look = { latin: string; size: number; nameSize: number; accent: string };

function cssValue(css: string, selector: RegExp, prop: RegExp): string | null {
  const block = selector.exec(css);
  if (!block) return null;
  const m = prop.exec(block[1]);
  return m ? m[1] : null;
}

/** Font, sizes and accent colour from the template's own <style>, so each template keeps its look. */
function lookOf(html: string, lang: "zh-TW" | "en"): Look {
  const css = [...stripComments(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]).join("\n");
  const accent = /--accent\s*:\s*#([0-9a-f]{6})\b/i.exec(css)?.[1]?.toUpperCase() ?? "1E3D63";
  const body = cssValue(css, /(?:^|[}\s])body\s*\{([^}]*)\}/i, /font-size\s*:\s*([\d.]+)pt/i);
  const name = cssValue(css, /\.name\s*\{([^}]*)\}/i, /font-size\s*:\s*([\d.]+)pt/i);
  const fam = cssValue(css, /(?:^|[}\s])body\s*\{([^}]*)\}/i, /font-family\s*:\s*([^;]+)/i);
  const first = fam?.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  const safe = first && /^[\w .-]+$/.test(first) && !/^(sans-serif|serif|system-ui)$/i.test(first) ? first : "";
  return {
    latin: safe || (lang === "en" ? "Calibri" : "Microsoft JhengHei"),
    size: clampPt(body, 10.5),
    nameSize: clampPt(name, 24, 14, 40),
    accent,
  };
}

function clampPt(v: string | null, dflt: number, lo = 8, hi = 14): number {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
}

function stylesXml(look: Look, lang: "zh-TW" | "en", textWidth: number): string {
  const font = `<w:rFonts w:ascii="${xe(look.latin)}" w:hAnsi="${xe(look.latin)}" w:eastAsia="Microsoft JhengHei" w:cs="${xe(look.latin)}"/>`;
  const sz = (pt: number) => `<w:sz w:val="${Math.round(pt * 2)}"/><w:szCs w:val="${Math.round(pt * 2)}"/>`;
  const style = (id: string, name: string, ppr: string, rpr = "", extra = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${id === "Normal" ? "" : '<w:basedOn w:val="Normal"/>'}${extra}<w:qFormat/>` +
    `${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
  const rule = (color: string, size: number) => `<w:pBdr><w:bottom w:val="single" w:sz="${size}" w:space="4" w:color="${color}"/></w:pBdr>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:color w:val="1B1D21"/>${sz(look.size)}` +
    `<w:lang w:val="${lang === "en" ? "en-US" : "zh-TW"}" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    style("Normal", "Normal", "") +
    style("Name", "Title", "<w:keepNext/><w:spacing w:before=\"0\" w:after=\"40\" w:line=\"240\" w:lineRule=\"auto\"/>", `<w:b/><w:bCs/><w:color w:val="${look.accent}"/>${sz(look.nameSize)}`) +
    style("Want", "Subtitle", "<w:keepNext/><w:spacing w:after=\"40\"/>", `<w:b/><w:bCs/><w:color w:val="${look.accent}"/>${sz(11)}`) +
    style("Contact", "Contact", `${rule("B9BEC6", 6)}<w:spacing w:after="120"/>`, `<w:color w:val="${MUTED}"/>${sz(Math.max(look.size - 1, 8))}`) +
    style("Heading1", "heading 1", `<w:keepNext/>${rule("D9DDE3", 6)}<w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="0"/>`, `<w:b/><w:bCs/><w:color w:val="${look.accent}"/>${sz(12)}`) +
    style("Summary", "Summary", "<w:jc w:val=\"both\"/>", "<w:color w:val=\"3A3E45\"/>") +
    style("EntryHead", "Entry heading", `<w:keepNext/><w:tabs><w:tab w:val="right" w:pos="${textWidth}"/></w:tabs><w:spacing w:before="100"/>`, sz(11)) +
    style("EntrySub", "Entry detail", "<w:keepNext/>", `<w:color w:val="${MUTED}"/>${sz(Math.max(look.size - 1, 8))}`) +
    style("Bullet", "List Bullet", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="20" w:after="20"/><w:ind w:left="360" w:hanging="240"/>', "<w:color w:val=\"3A3E45\"/>") +
    style("Skill", "Skill line", '<w:spacing w:before="20" w:after="20"/>', "<w:color w:val=\"3A3E45\"/>") +
    `</w:styles>`
  );
}

const NUMBERING =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>` +
  `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>` +
  `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr></w:lvl>` +
  `</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;

// ---------------------------------------------------------------- zip

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with every part deflated. Part names are plain ASCII. */
export function zip(parts: [string, string][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = (Math.max(d.getFullYear() - 1980, 0) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const [name, text] of parts) {
    const raw = new TextEncoder().encode(text);
    const data = new Uint8Array(deflateRawSync(raw));
    const nm = new TextEncoder().encode(name);
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 8, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nm.length, true);
    chunks.push(new Uint8Array(local.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, 8, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nm.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const size = central.reduce((n, x) => n + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, parts.length, true);
  end.setUint16(10, parts.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of all) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

// ---------------------------------------------------------------- entry point

/** `html` must already be cleaned (scripts gone). The photo is left out, as in the PDF the app prints. */
export function resumeToDocx(html: string, opts: WordOptions): Uint8Array {
  const paras = paragraphs(parse(html));
  const [w, h] = opts.paper === "letter" ? [12240, 15840] : [11906, 16838];
  const margin = opts.paper === "letter" ? 864 : 850; // 0.6 in / 15 mm, as in the templates
  const look = lookOf(html, opts.lang);
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${paras.map(paraXml).join("")}` +
    `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xe(opts.title)}</dc:title></cp:coreProperties>`;
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["word/document.xml", doc],
    ["word/_rels/document.xml.rels", DOC_RELS],
    ["word/styles.xml", stylesXml(look, opts.lang, w - 2 * margin)],
    ["word/numbering.xml", NUMBERING],
    ["docProps/core.xml", core],
  ]);
}
