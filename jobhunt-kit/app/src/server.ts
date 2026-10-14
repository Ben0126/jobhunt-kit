// 本機小伺服器：只聽 127.0.0.1，每次啟動一組隨機通行碼（token），只認自己的 Host。
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import indexHtml from "../ui/index.html" with { type: "text" };
import indexEnHtml from "../ui/index-en.html" with { type: "text" };
import appJs from "../ui/app.js" with { type: "text" };
import styleCss from "../ui/style.css" with { type: "text" };
import styleEnCss from "../ui/style-en.css" with { type: "text" };
import { Applications, UserError } from "./applications.ts";
import { runChecks } from "./check.ts";
import { Folder } from "./folder.ts";
import { readMarket } from "./market.ts";
import { cleanMarkets, readMode, withLanguage, writeMode } from "./mode.ts";
import { serverText } from "./server.text.ts";
import { textFor } from "./check.text.ts";
import { stripComments } from "./htmltext.ts";
import * as R from "../../web/js/core/rules.js";
import { templatesFor } from "./check.ts";
import { renderResume, type TemplateKind } from "./render.ts";
import { versionFor } from "./resumever.ts";
import { closedLinks, feedConfig, queryFeed, readCache, refreshFeed, writeCache, type Http as FeedHttp } from "./feed.ts";
import { lookup as h1bLookup, type Fetcher as H1BFetcher } from "./h1b.ts";
import { resumeToDocx } from "./wordfile.ts";
import { dataDir, dataUrl, deletePhoto, loadPhoto, photoFile, photoFromDataUrl, PhotoError, savePhoto } from "./photo.ts";
import { createUpdateChecker, type UpdateChecker } from "./update.ts";
import { applyUpdate, failureText, planView, prepareUpdate, testServerFromEnv, UpdateFailure, type Prepared } from "./selfupdate.ts";
import { updateTextFor } from "./selfupdate.text.ts";
import { VERSION } from "./version.ts";

export const APP_ID = "jobhunt";
export { VERSION };

// The start page depends on the folder's `language` (jobhunt.yaml): index.html for zh-TW (unchanged), index-en.html for en.
const PAGES = new Set(["/", "/index.html"]);
const ASSETS: Record<string, { body: string; type: string }> = {
  "/app.js": { body: appJs, type: "text/javascript; charset=utf-8" },
  "/style.css": { body: styleCss, type: "text/css; charset=utf-8" },
  "/style-en.css": { body: styleEnCss, type: "text/css; charset=utf-8" },
};

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  // A tab one of our pages opened (the print tab) loses its link back to us as soon as it lands on another site.
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Resume files are written by the AI: shown as-is but nothing in them may run, call home or load from elsewhere.
 * Only the one print script the app adds (with a fresh nonce) runs. Framing is allowed for the app's own preview. */
function viewHeaders(nonce: string): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    "Content-Security-Policy":
      `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; script-src 'nonce-${nonce}'; ` +
      "base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Type": "text/html; charset=utf-8",
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A resume file with nothing left that could run, redirect or call out. The CSP blocks scripts too; removing them
 * keeps the console quiet and makes sure the app's own print script is the only one. */
export function cleanResume(html: string): string {
  // Comments first, ended the way a browser ends them: the template's notes to the AI mention "<script>" in plain text.
  html = stripComments(html);
  // Until nothing changes: after one pass, <scr<script>ipt> has become a new <script>.
  for (let prev = ""; prev !== html; ) {
    prev = html;
    html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<script\b[^>]*>/gi, "");
  }
  html = html.replace(/<script\b[^>]*$/i, ""); // unclosed at the very end: it would swallow the print script
  // <meta http-equiv="refresh"> can send the print tab to another site, and a CSP can't stop that.
  html = html.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "");
  // on…= handlers, one tag at a time (a single regex over the whole file got slow on files with many tags).
  return html.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
    for (let prev = ""; prev !== tag; ) {
      prev = tag;
      tag = tag.replace(/[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    }
    return tag;
  });
}

function viewPage(title: string, msg: string, htmlLang: string): string {
  return `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8"><title>${esc(title)}</title></head>` +
    `<body style="font-family:sans-serif;padding:24px;line-height:1.7"><h1 style="font-size:20px">${esc(title)}</h1><p>${esc(msg)}</p></body></html>`;
}

function cookieValue(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// ---------------------------------------------------------------- 履歷頁的補充資料（只讀）

export const GENERAL = "_general";

export type VersionsInfo = {
  variants: { name: string; title: string }[];
  templates: { kind: string; name: string }[];
  submitted: { file: string; id: string; date: string }[];
};

/** What the resume page can show besides each job's resume file: the general versions, templates, saved copies. */
export async function versionsInfo(folder: Folder, market: "tw" | "us"): Promise<VersionsInfo> {
  let variants: VersionsInfo["variants"] = [];
  try {
    const r: any = await folder.readYaml("resume.yaml");
    variants = Object.entries(r?.variants ?? {}).map(([name, v]: [string, any]) => ({ name, title: String(v?.title ?? name) }));
  } catch {}
  const names = textFor(market === "us" ? "en" : "zh-TW").templateNames as Record<string, string>;
  const submitted: VersionsInfo["submitted"] = [];
  for (const f of folder.list("submitted", "file")) {
    const m = /^(\d{4}-\d{2}-\d{2})_(.+)\.html$/.exec(f);
    if (m) submitted.push({ file: f, id: m[2], date: m[1] });
  }
  submitted.sort((a, b) => (a.file < b.file ? 1 : -1));
  return { variants, templates: templatesFor(market).map((kind) => ({ kind, name: names[kind] ?? kind })), submitted };
}

export type DiffPart = { t: "same" | "add" | "del"; s: string };

/** Character-level diff (longest common subsequence over code points). Chinese has no spaces to split words on,
 * so one character at a time is the unit. Long inputs fall back to "all removed, all added". */
export function charDiff(before: string, after: string, max = 1500): DiffPart[] {
  return diffTokens(Array.from(before), Array.from(after), before, after, max);
}

/** Same diff, one word at a time (each word keeps the space after it). English is read in words, not letters. */
export function wordDiff(before: string, after: string, max = 1500): DiffPart[] {
  const words = (s: string) => s.match(/\S+\s*/g) ?? [];
  return diffTokens(words(before), words(after), before, after, max);
}

function diffTokens(a: string[], b: string[], before: string, after: string, max: number): DiffPart[] {
  const out: DiffPart[] = [];
  const push = (t: DiffPart["t"], s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s;
    else out.push({ t, s });
  };
  if (a.length > max || b.length > max) {
    push("del", before);
    push("add", after);
    return out;
  }
  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const w = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  push("del", a.slice(i).join(""));
  push("add", b.slice(j).join(""));
  return out;
}

const squash = (s: unknown) => String(s ?? "").split(/\s+/).filter(Boolean).join(" ");

function frontMatter(text: string): any {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  try {
    return Bun.YAML.parse(m[1]);
  } catch {
    // A broken header still says what it is.
    const st = /^status:\s*["']?(\w+)/m.exec(m[1]);
    const ti = /^title:\s*["']?([^"'\r\n]*)/m.exec(m[1]);
    return st ? { status: st[1], title: ti ? ti[1] : "" } : null;
  }
}

export type Rewrite = { bullet: string; before: string | null; after: string; parts: DiffPart[] };
export type ResumeInfo = {
  drafts: { id: string; title: string }[];
  items: Record<string, { confirm: number; rewrites: Rewrite[]; saved: string[]; rev: { version: string; isNew: boolean } | null }>;
};

/** For the resume page: experiences still waiting to be confirmed (me/stories, status: draft), questions not yet
 * asked (targets/<id>.yaml confirm), and each reworded bullet next to the confirmed sentence in resume.yaml. */
export async function resumeInfo(folder: Folder): Promise<ResumeInfo> {
  const drafts: ResumeInfo["drafts"] = [];
  for (const name of folder.list("me/stories", "file")) {
    if (!/\.md$/i.test(name)) continue;
    let text: string | null = null;
    try {
      text = await folder.readText(`me/stories/${name}`);
    } catch {}
    const fm = text ? frontMatter(text) : null;
    if (fm && String(fm.status ?? "").trim() === "draft")
      drafts.push({ id: String(fm.id ?? name.replace(/\.md$/i, "")), title: String(fm.title ?? "").trim() });
  }

  const diff = (await readMarket(folder)).language === "en" ? wordDiff : charDiff;
  const confirmed = new Map<string, string>();
  try {
    const r: any = await folder.readYaml("resume.yaml");
    if (r && typeof r === "object")
      for (const sec of Object.values(r))
        if (Array.isArray(sec))
          for (const it of sec)
            if (it && Array.isArray(it.bullets))
              for (const b of it.bullets) if (b && b.id != null && b.text != null) confirmed.set(String(b.id), squash(b.text));
  } catch {}

  const saved = folder.list("submitted", "file");
  const items: ResumeInfo["items"] = {};
  for (const name of folder.list("targets", "file")) {
    const m = /^(.+)\.ya?ml$/i.exec(name);
    if (!m) continue;
    let t: any = null;
    try {
      t = await folder.readYaml(`targets/${name}`);
    } catch {}
    if (!t || typeof t !== "object") continue;
    const id = m[1];
    const rewrites: Rewrite[] = [];
    const ov = t.bullet_overrides;
    if (ov && typeof ov === "object" && !Array.isArray(ov))
      for (const [bullet, text] of Object.entries(ov)) {
        const after = squash(text);
        const before = confirmed.get(bullet) ?? null;
        rewrites.push({ bullet, before, after, parts: before == null ? [{ t: "add", s: after }] : diff(before, after) });
      }
    // The version number this resume file has (registered when it was sent) or would get (shown as a draft).
    let rev: { version: string; isNew: boolean } | null = null;
    try {
      const html = await folder.readText(`resumes/${id}.html`);
      const v = html ? await versionFor(folder, id, html) : null;
      if (v) rev = { version: v.version, isNew: v.isNew };
    } catch {}
    items[id] = {
      confirm: Array.isArray(t.confirm) ? t.confirm.length : 0,
      rewrites,
      saved: saved.filter((n) => n.endsWith(`_${id}.html`) && /^\d{4}-\d{2}-\d{2}_/.test(n)),
      rev,
    };
  }
  return { drafts, items };
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

function sameToken(given: string | null, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

export type Running = { port: number; token: string; url: string; stop: () => void };

/** One-click update (selfupdate.ts); tests pass their own. */
export type SelfUpdate = { prepare: () => Promise<Prepared>; apply: (p: Prepared) => void };

export function startServer(opts: {
  folder: Folder;
  apps?: Applications;
  token?: string;
  port?: number;
  update?: UpdateChecker;
  selfUpdate?: SelfUpdate;
  /** Called shortly after an update was applied: the app closes, so the next double-click starts the new program. */
  onUpdated?: () => void;
  /** Where the resume photo is kept (tests pass a temp folder). Default: the program's own data folder, outside the job folder. */
  dataDir?: string;
  /** Tests: stand-ins for the network (the job list sources, the H-1B index download). */
  feedHttp?: FeedHttp;
  h1bGet?: H1BFetcher;
}): Running {
  const folder = opts.folder;
  const updater = opts.update ?? createUpdateChecker({ folder });
  const selfUpdate: SelfUpdate = opts.selfUpdate ?? {
    prepare: () => prepareUpdate({ dir: folder.root, version: VERSION, server: testServerFromEnv() }),
    apply: (p) => applyUpdate(folder.root, p),
  };
  let prepared: Prepared | null = null;
  let updating = false;
  const apps = opts.apps ?? new Applications(folder);
  const token = opts.token ?? newToken();
  // The preview cookie is a random value of its own, not the API token: cookies on 127.0.0.1 are sent to every
  // port, so if it leaks it only shows resume previews and can't change the applications file.
  const viewToken = newToken();
  let port = 0;
  const photoPath = () => photoFile(opts.dataDir ?? dataDir(), folder.root);
  const h1bDir = () => join(opts.dataDir ?? dataDir(), "h1b");

  // ---- the job list (US kit): refresh runs one at a time; closed postings are marked on tracked jobs
  let feedRunning: Promise<unknown> | null = null;
  const NEW_STALE_MS = 24 * 60 * 60 * 1000;
  async function feedAnswer(url: URL, lang: "en" | "zh-TW") {
    const cfg = feedConfig(await folder.readYaml("jobhunt.yaml").catch(() => null));
    const cache = readCache(folder.feedPath);
    const q = url.searchParams;
    const list = (k: string) => (q.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);
    const res = queryFeed(cache, { fields: list("fields"), kinds: list("kinds"), q: q.get("q") ?? "", newOnly: q.get("new") === "1", h1bRecent: q.get("h1b") === "1", showCitizen: q.get("citizen") === "1", limit: Number(q.get("limit")) || 200 }, cfg, today, lang === "en" ? "en" : "zh-TW");
    const errors = Object.entries(cache.sources).filter(([, s]) => s.error).map(([k, s]) => `${k.replace(/^board:/, "")}: ${s.error}`);
    const at = Date.parse(cache.fetchedAt);
    return {
      ...res,
      fetchedAt: cache.fetchedAt,
      stale: !Number.isFinite(at) || Date.now() - at > NEW_STALE_MS,
      refreshing: !!feedRunning,
      autoRefresh: cfg.autoRefresh,
      shownFields: cfg.fields,
      kinds: cfg.kinds,
      errors,
      h1bVersion: cache.h1b.version,
      h1bError: cache.h1b.error ?? "",
    };
  }
  /** A tracker row whose posting was seen closed in the job list gets `_closed`. */
  function markClosed<T extends { rows?: any[]; board?: any }>(b: T): T {
    const set = closedLinks(readCache(folder.feedPath));
    if (!set.size) return b;
    const mark = (board: any) => {
      for (const r of board?.rows ?? []) r._closed = !!r.link && set.has(String(r.link));
    };
    if (b.rows) mark(b);
    if (b.board) mark(b.board);
    return b;
  }

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  // The resume preview (iframe) and the print tab are plain page loads that can't send the token header, so a
  // successful API call leaves an HttpOnly cookie that only the viewer accepts. Named per port: two folders open
  // at once each keep their own.
  const cookieName = () => `jh${port}`;
  const withCookie = (r: Response) => {
    r.headers.append("Set-Cookie", `${cookieName()}=${viewToken}; HttpOnly; SameSite=Strict; Path=/view`);
    return r;
  };

  /** 姓名_履歷_公司 (en: Name_Resume_Company): the print dialog offers the page title as the PDF's file name. */
  async function pdfName(id: string, word: string): Promise<string> {
    let person = "";
    let company = "";
    try {
      const r: any = await folder.readYaml("resume.yaml");
      person = String(r?.basics?.name ?? "");
    } catch {}
    for (const ext of ["yaml", "yml"]) {
      try {
        const t: any = await folder.readYaml(`targets/${id}.${ext}`);
        if (t && typeof t === "object") {
          company = String(t.company ?? "");
          break;
        }
      } catch {}
    }
    return [person, word, company]
      .map((x) => x.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").trim())
      .filter(Boolean)
      .join("_");
  }

  /** The page for the "general version" (id _general: resume.yaml as it is, no job) or for a job's content in a chosen template. */
  async function drawVersion(id: string, template: TemplateKind | null, variant: string | null, us: boolean): Promise<string> {
    const resume: any = await folder.readYaml("resume.yaml");
    let doc: any;
    let photo = true;
    let kind: TemplateKind | null = template;
    if (id === GENERAL) {
      const names = Object.keys(resume?.variants ?? {});
      const v = variant && names.includes(variant) ? variant : names[0];
      doc = R.resolve(resume, v);
      kind ??= us ? "us" : v === "en" ? "en" : "tw";
    } else {
      let target: any = null;
      for (const ext of ["yaml", "yml"]) {
        try {
          target = await folder.readYaml(`targets/${id}.${ext}`);
          break;
        } catch {}
      }
      if (!target || typeof target !== "object") throw new Error("no target");
      doc = R.resolve(R.tailor(resume, target), target.base_variant);
      photo = target.photo === true;
    }
    return renderResume(kind!, doc, { photo });
  }

  async function view(req: Request, url: URL): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") return text("Method Not Allowed", 405);
    const nonce = randomBytes(16).toString("base64");
    const M = await readMarket(folder);
    const T = serverText(M.language);
    const page = (status: number, title: string, msg: string) => new Response(viewPage(title, msg, T.htmlLang), { status, headers: viewHeaders(nonce) });
    if (!sameToken(cookieValue(req, cookieName()), viewToken)) return page(401, T.reopenTitle, T.reopenMsg);
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return page(403, T.forbiddenTitle, T.forbiddenMsg);
    let id = "";
    try {
      id = decodeURIComponent(url.pathname.slice("/view/".length));
    } catch {}
    if (!/^[^/\\:*?"<>|]+$/.test(id) || id.startsWith(".")) return page(404, T.notFoundTitle, "");
    let html: string | null = null;
    const q = url.searchParams;
    const submitted = q.get("submitted");
    const wanted = q.get("template");
    const known = templatesFor(M.market);
    if (wanted && !known.includes(wanted as TemplateKind)) return page(404, T.notFoundTitle, "");
    if (submitted != null) {
      // a frozen copy saved by "I applied, save a copy": shown exactly as it was saved
      if (!/^[^/\:*?"<>|]+\.html$/.test(submitted) || submitted.startsWith(".")) return page(404, T.notFoundTitle, "");
      try {
        html = await folder.readText(`submitted/${submitted}`);
      } catch {}
    } else if (id === GENERAL || wanted) {
      // drawn by the program from resume.yaml (+ the job's targets file): the general version, or the same words in another template
      try {
        html = await drawVersion(id, wanted as TemplateKind | null, q.get("variant"), M.market === "us");
      } catch (e: any) {
        return page(422, T.versionFailTitle, T.versionFailMsg);
      }
    } else {
      try {
        html = await folder.readText(`resumes/${id}.html`);
      } catch {}
    }
    if (html == null) return page(404, T.noResumeTitle, T.noResumeMsg);
    html = cleanResume(html);
    const name = await pdfName(id, T.pdfWord);
    if (url.searchParams.get("format") === "docx") {
      const file = name || id;
      // a resume file's own number goes into the Word file's properties (Subject: not visible on the page)
      const rv = id !== GENERAL && !wanted && submitted == null ? await versionFor(folder, id, html).catch(() => null) : null;
      const bytes = resumeToDocx(html, { version: rv ? rv.version + (rv.isNew ? "-draft" : "") : "", photo: loadPhoto(photoPath()), paper: M.paper === "letter" ? "letter" : "a4", title: file, lang: M.language === "en" ? "en" : "zh-TW" });
      return new Response(bytes, {
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          // plain ASCII name for old clients, the real (Chinese) name for the rest
          "Content-Disposition": `attachment; filename="resume.docx"; filename*=UTF-8''${encodeURIComponent(file)}.docx`,
        },
      });
    }
    if (name)
      html = html
        .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/i, "")
        .replace(/<head\b[^>]*>/i, (head) => `${head}<title>${esc(name)}</title>`);
    // The photo is never in the folder (the template's onerror handler that hides the empty frame can't run here).
    // The template's yellow tip says "press Ctrl+P"; the app shows its own steps next to its PDF button instead.
    // With a photo saved in the program, the template's photo.jpg becomes that picture (inline, so the print tab needs no
    // second request); without one the empty frame stays hidden.
    const photo = loadPhoto(photoPath());
    let extra = "<style>" + (photo ? "" : "#photo-slot{display:none !important}") + ".print-tip{display:none !important}</style>";
    if (photo) html = html.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["']?)photo\.jpg\2/gi, `$1"${dataUrl(photo)}"`);
    // Letter folders: the print dialog gets Letter even if the AI used a template that says A4. A4 folders add nothing.
    if (M.paper === "letter") extra += "<style>@page{size:letter}</style>";
    if (url.searchParams.get("print") === "1")
      extra += `<script nonce="${nonce}">addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>`;
    const at = html.toLowerCase().lastIndexOf("</body>");
    html = at >= 0 ? html.slice(0, at) + extra + html.slice(at) : html + extra;
    return new Response(html, { headers: viewHeaders(nonce) });
  }

  async function api(req: Request, path: string): Promise<Response> {
    const M = await readMarket(folder);
    const T = serverText(M.language);
    if (!sameToken(req.headers.get("x-jobhunt-token"), token)) return json({ error: T.staleTab }, 401);
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigins().has(origin)) return json({ error: T.badRequest }, 403);
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return json({ error: T.badRequest }, 403);

    let body: any = {};
    if (req.method === "POST") {
      if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: T.badRequest }, 415);
      // The transport allows 4 MB for the photo; everything else stays at the old 64 KB.
      const raw = await req.text().catch(() => "");
      if (raw.length > (path === "/api/photo" ? 4 * 1024 * 1024 : 64 * 1024)) return json({ error: T.badRequest }, 413);
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: T.badRequest }, 400);
      }
      if (!body || typeof body !== "object") return json({ error: T.badRequest }, 400);
    }

    const route = `${req.method} ${path}`;
    try {
      switch (route) {
        case "GET /api/ping":
          return json({ ok: true, app: APP_ID, version: VERSION });
        case "GET /api/info": {
          const mode = await readMode(folder);
          return withCookie(json({ folder: folder.root, version: VERSION, market: M.market, language: M.language, paper: M.paper, markets: mode.markets, modeSet: mode.set }));
        }
        case "POST /api/mode": {
          // the start screen and the language switch: where they look for work (me/mode.yaml) and the page language
          // (only the `language:` line of jobhunt.yaml)
          if (body.markets !== undefined) {
            const markets = cleanMarkets(body.markets);
            if (!markets.length) return json({ error: T.badRequest }, 400);
            await writeMode(folder, markets);
          }
          if (body.language !== undefined) {
            if (body.language !== "en" && body.language !== "zh-TW") return json({ error: T.badRequest }, 400);
            const text = (await folder.readText("jobhunt.yaml")) ?? "";
            await folder.writeText("jobhunt.yaml", withLanguage(text, body.language));
          }
          const mode = await readMode(folder);
          const M2 = await readMarket(folder);
          return json({ markets: mode.markets, modeSet: mode.set, language: M2.language, market: M2.market, paper: M2.paper });
        }
        case "GET /api/update": {
          // The "newer version" reminder: the page asks after it has loaded. Never part of check/read output.
          const u = await updater.get();
          return json(u ? { available: true, ...u } : { available: false });
        }
        case "POST /api/update/prepare":
        case "POST /api/update/apply": {
          // One-click update: "prepare" downloads and lists what would change (writes nothing); "apply" replaces
          // exactly that list, then the app closes so the next double-click runs the new program.
          const UT = updateTextFor(M.language);
          if (updating) return json({ error: UT.busy }, 409);
          updating = true;
          try {
            if (route === "POST /api/update/prepare") {
              prepared = null;
              prepared = await selfUpdate.prepare();
              const v = planView(prepared);
              // The page shows these lines as they are (same wording as `jobhunt update` on the command line).
              const text = {
                title: UT.previewTitle(v.from, v.to),
                willReplace: UT.willReplace(v.files.length),
                newFile: UT.newFile,
                settings: v.settingsAdded.length ? UT.settingsAdded(v.settingsAdded) : null,
                keep: UT.keep(M.market),
                backup: UT.backupNote,
                nothing: v.files.length || v.settingsAdded.length ? null : UT.nothingChanged(v.to),
              };
              return json({ ...v, text });
            }
            if (!prepared || typeof body.to !== "string" || body.to !== prepared.to) return json({ error: UT.noPreview }, 409);
            const p = prepared;
            prepared = null;
            selfUpdate.apply(p);
            if (opts.onUpdated) setTimeout(opts.onUpdated, 800);
            return json({ ok: true, to: p.to });
          } catch (e) {
            if (e instanceof UpdateFailure) return json({ error: failureText(e, UT), code: e.code }, 409);
            throw e;
          } finally {
            updating = false;
          }
        }
        case "GET /api/check":
          // Read-only: the checks/<id>.md files are written by the command-line check only (the AI may be
          // editing them at the same moment).
          return withCookie(json(await runChecks(folder)));
        case "GET /api/applications":
          return json(markClosed(await apps.board()));
        case "POST /api/applications/add":
          return json(markClosed(await apps.add(body)));
        case "POST /api/applications/update":
          return json(markClosed(await apps.update(body)));
        case "POST /api/applications/delete":
          return json(markClosed(await apps.remove(body)));
        case "GET /api/feed":
          if (!(await readMode(folder)).markets.includes("us")) return json({ error: T.badRequest }, 404);
          return json(await feedAnswer(new URL(req.url), M.language));
        case "POST /api/feed/refresh": {
          if (!(await readMode(folder)).markets.includes("us")) return json({ error: T.badRequest }, 404);
          // set at once (before any await), so a second press while one is running joins it
          feedRunning ??= (async () => {
            const cfg = feedConfig(await folder.readYaml("jobhunt.yaml").catch(() => null));
            const r = await refreshFeed(readCache(folder.feedPath), { config: cfg, http: opts.feedHttp, get: opts.h1bGet, h1bDir: h1bDir() });
            writeCache(folder.feedPath, r.cache);
          })().finally(() => {
            feedRunning = null;
          });
          await feedRunning?.catch(() => null);
          return json(await feedAnswer(new URL(req.url), M.language));
        }
        case "GET /api/h1b": {
          // what one employer filed, from the index when it is already on this computer (never downloads it here)
          const name = String(new URL(req.url).searchParams.get("company") ?? "").slice(0, 200);
          const idx = join(h1bDir(), "index.ndjson.gz");
          if (!name || !existsSync(idx)) return json({ available: false, facts: null });
          return json({ available: true, facts: h1bLookup(idx, [name])[name] ?? null });
        }
        case "GET /api/resume-info":
          return json(await resumeInfo(folder));
        case "GET /api/versions":
          return json(await versionsInfo(folder, M.market));
        case "GET /api/photo": {
          const p = loadPhoto(photoPath());
          return json({ has: !!p, dataUrl: p ? dataUrl(p) : null });
        }
        case "POST /api/photo": {
          let p;
          try {
            p = photoFromDataUrl(body.image);
          } catch (e) {
            if (e instanceof PhotoError) return json({ error: e.kind === "big" ? T.photoBig : T.photoFormat }, 400);
            throw e;
          }
          savePhoto(photoPath(), p);
          return json({ has: true, dataUrl: dataUrl(p) });
        }
        case "POST /api/photo/delete":
          deletePhoto(photoPath());
          return json({ has: false, dataUrl: null });
        case "POST /api/archive/preview":
          return json(await apps.archivePreview(body));
        case "POST /api/archive":
          return json(markClosed(await apps.archive(body)));
        default:
          return json({ error: T.badRequest }, 404);
      }
    } catch (e: any) {
      if (e instanceof UserError) {
        const extra = e.status === 409 ? { board: await apps.board().catch(() => null) } : {};
        return json({ error: e.message, ...extra }, e.status);
      }
      console.error(e);
      return json({ error: T.serverError }, 500);
    }
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    maxRequestBodySize: 4 * 1024 * 1024, // the resume photo (2 MB as a JPEG, a third more as base64) is the only big request
    async fetch(req) {
      const host = req.headers.get("host") || "";
      if (!allowedHosts().has(host)) return text("Forbidden", 403);
      const url = new URL(req.url);
      const path = url.pathname;
      if (path.startsWith("/api/")) return api(req, path);
      if (path.startsWith("/view/")) return view(req, url);
      if (req.method !== "GET" && req.method !== "HEAD") return text("Method Not Allowed", 405);
      if (PAGES.has(path)) {
        const en = (await readMarket(folder)).language === "en";
        return new Response(en ? indexEnHtml : indexHtml, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
      }
      const asset = ASSETS[path];
      if (!asset) return text("Not Found", 404);
      return new Response(asset.body, { headers: { ...SECURITY_HEADERS, "Content-Type": asset.type } });
    },
    error(e) {
      console.error(e);
      return text("Internal Error", 500);
    },
  });
  port = server.port!;
  return {
    port,
    token,
    url: `http://127.0.0.1:${port}/?t=${token}`,
    stop: () => server.stop(true),
  };
}
