// The words a reader actually sees on a resume file: no comments, scripts, styles, <title>, or the yellow
// screen-only print tip. One entry per block element (a sentence check over the whole page would glue the
// name, phone and headings into one "sentence").
//
// Rule of thumb: when in doubt, a piece of text counts as visible. Anything skipped here is never checked, so
// only what truly never reaches paper is skipped; markup the template doesn't use is reported by oddMarkup().

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "br", "dd", "div", "dl", "dt", "figcaption", "figure",
  "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "html", "li", "main", "nav", "ol", "p", "pre",
  "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "button", "textarea", "svg", "text",
]);
const SKIP = new Set(["template"]); // never rendered
const RAW = new Set(["script", "style", "textarea", "title"]); // content is text, not tags
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** Tags the resume templates never use: their text may print while hiding from a checker, or they load things. */
const FOREIGN = new Set([
  "button", "svg", "math", "input", "textarea", "select", "option", "iframe", "frame", "frameset", "object", "embed",
  "applet", "video", "audio", "canvas", "marquee", "form", "link", "base", "noscript", "portal", "picture", "source",
]);

export type Line = { text: string; skills: boolean };

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", middot: "·", ndash: "–", mdash: "—", hellip: "…" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(n);
      } catch {
        return m;
      }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function attr(attrs: string, name: string): string {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
}

function hasClass(attrs: string, cls: string): boolean {
  return attr(attrs, "class").split(/\s+/).includes(cls);
}

/** Comments removed the way a browser ends them: "<!-->" and "<!--->" end at once, "--!>" ends one too, and an
 * unclosed comment hides the rest of the file. */
export function stripComments(html: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const s = html.indexOf("<!--", i);
    if (s < 0) return out + html.slice(i);
    out += html.slice(i, s);
    const j = s + 4;
    if (html.startsWith(">", j)) {
      i = j + 1;
      continue;
    }
    if (html.startsWith("->", j)) {
      i = j + 2;
      continue;
    }
    const a = html.indexOf("-->", j);
    const b = html.indexOf("--!>", j);
    const end = Math.min(a < 0 ? Infinity : a + 3, b < 0 ? Infinity : b + 4);
    if (end === Infinity) return out;
    i = end;
  }
}

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;

/** Visible text of an HTML page, one line per block element; `skills` = inside an element whose class has "skills". */
export function visibleLines(html: string): Line[] {
  const src = stripComments(html);
  const lower = src.toLowerCase();
  const out: Line[] = [];
  const stack: { tag: string; skip: boolean; skills: boolean }[] = [];
  const top = () => stack[stack.length - 1] ?? { tag: "", skip: false, skills: false };
  let buf = "";
  const flush = () => {
    const t = buf.replace(/\s+/g, " ").trim();
    if (t && !top().skip) out.push({ text: t, skills: top().skills });
    buf = "";
  };

  const re = new RegExp(TAG.source, "g");
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!top().skip) buf += decodeEntities(src.slice(pos, m.index));
    pos = re.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    if (!closing && RAW.has(tag)) {
      // script/style/title/textarea: read up to the matching close tag without looking for tags inside
      const end = lower.indexOf(`</${tag}`, pos);
      const close = end < 0 ? src.length : src.indexOf(">", end);
      if (tag === "textarea") {
        flush();
        buf = decodeEntities(src.slice(pos, end < 0 ? src.length : end));
        flush();
      }
      pos = re.lastIndex = close < 0 ? src.length : close + 1;
      continue;
    }
    if (closing) {
      if (BLOCK.has(tag)) flush();
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    if (VOID.has(tag) || /\/\s*$/.test(attrs)) {
      if (BLOCK.has(tag)) flush();
      continue;
    }
    if (BLOCK.has(tag)) flush();
    stack.push({
      tag,
      // the template's yellow tip: `.print-tip { display: none !important }` when printing
      skip: top().skip || SKIP.has(tag) || hasClass(attrs, "print-tip"),
      skills: top().skills || /\bskills\b/.test(attr(attrs, "class")),
    });
  }
  if (!top().skip) buf += decodeEntities(src.slice(pos));
  stack.length = 0;
  flush();
  return out;
}

/** Leftover template slots ({{name}}) anywhere outside comments, including attributes. */
export function leftoverSlots(html: string): string[] {
  return [...stripComments(html).matchAll(/\{\{[^{}\n]{0,40}\}?\}?/g)].map((m) => m[0]);
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Contents of every <script> (whitespace squashed), for comparing with the templates' own scripts. */
export function scriptsOf(html: string): string[] {
  const src = stripComments(html);
  return [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => squash(m[1]));
}

/** Contents of every <style> (whitespace squashed): which template a resume file was made from. */
export function stylesOf(html: string): string[] {
  const src = stripComments(html);
  return [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => squash(m[1]));
}

/** Words the templates print around the slots ({{…}}): headings like 「學歷」, labels like 「手機」「希望職稱：」. */
export function templateWords(html: string): string[] {
  const out = new Set<string>();
  for (const l of visibleLines(html))
    for (const piece of l.text.split(/\{\{[^{}]*\}\}/)) {
      const p = piece.trim();
      if (p) out.add(p);
    }
  return [...out];
}

/** Markup the resume templates never use and that can print text a checker doesn't see (or load things).
 * `allowedScripts`: the templates' own scripts (squashed). `allowPhoto`: the Chinese templates may show photo.jpg;
 * the US kit has no photo, so there every <img> is an error. Plain-Chinese descriptions, one per kind. */
export function oddMarkup(html: string, allowedScripts: Set<string>, allowPhoto = true): string[] {
  const out = new Set<string>();
  if (/<!--->?|--!>/.test(html)) out.add("註解的寫法不正常（<!--> 或 --!>），瀏覽器和檢查程式看到的內容會不一樣");
  const src = stripComments(html);
  const re = new RegExp(TAG.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) continue;
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    if (FOREIGN.has(tag)) out.add(`有範本沒有的 <${tag}>`);
    if (tag === "img" && !allowPhoto) out.add("有範本沒有的圖片（美國版履歷不放任何圖片，也不放照片）");
    else if (tag === "img" && attr(attrs, "src").trim() !== "photo.jpg") out.add("有範本沒有的圖片（範本只有大頭照 photo.jpg）");
    if (tag === "meta" && /\shttp-equiv\s*=/i.test(` ${attrs}`)) out.add("有範本沒有的 <meta http-equiv>");
    if (/\sstyle\s*=\s*["'][^"']*(?:url\(|(?<![-\w])content\s*:)/i.test(` ${attrs}`)) out.add("樣式裡放了圖片或文字");
    if (tag === "script" && /\ssrc\s*=/i.test(` ${attrs}`)) out.add("有範本沒有的程式（<script src>）");
  }
  for (const css of [...src.matchAll(/<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi)].map((x) => x[1])) {
    for (const c of css.matchAll(/(?<![-\w])content\s*:\s*(?:"([^"]*)"|'([^']*)'|([^;}]*))/gi)) {
      const v = (c[1] ?? c[2] ?? c[3] ?? "").trim();
      if (c[3] != null && /^(?:none|normal|initial|inherit|unset|"")?$/i.test(v)) continue;
      if (/[\p{L}\p{N}]/u.test(v.replace(/\\[0-9a-f]{1,6}\s?/gi, "x"))) out.add("樣式裡藏了文字（content）");
    }
    if (/url\(|@import/i.test(css)) out.add("樣式裡放了圖片或外部檔案（url / @import）");
  }
  for (const s of scriptsOf(html)) if (s && !allowedScripts.has(s)) out.add("有範本沒有的程式（<script>）");
  return [...out];
}
