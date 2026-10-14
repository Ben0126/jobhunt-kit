// A resume page drawn by the program: the resolved resume (R.resolve, the same data `check` compares a resume file
// against) in one of the kit's four templates. It is for LOOKING: the general version (no job yet), the same content in
// another template, and a Word file made from either. The resume file the AI writes (resumes/<id>.html) and its program
// check are not touched.
//
// The page is the template's own <style> plus the markup the template's comments describe (header, section.block, entry),
// so it looks like the template does and `check` finds only the template's own words in it.
import tplEn from "../../jobhunt/scaffold/workspace-general/templates/resume-en.html" with { type: "text" };
import tplTw from "../../jobhunt/scaffold/workspace-general/templates/resume-tw.html" with { type: "text" };
import tplTwClassic from "../../jobhunt/scaffold/workspace-general/templates/resume-tw-classic.html" with { type: "text" };
import tplUs from "../../jobhunt/scaffold/workspace-us/templates/resume-us.html" with { type: "text" };
import { stripComments } from "./htmltext.ts";

export type TemplateKind = "tw" | "tw-classic" | "en" | "us";

const SOURCE: Record<TemplateKind, string> = { tw: tplTw, "tw-classic": tplTwClassic, en: tplEn, us: tplUs };
const ZH = (k: TemplateKind) => k === "tw" || k === "tw-classic";

const TITLES_ZH: Record<string, string> = {
  summary: "自我介紹", education: "學歷", experience: "工作與社團經歷", projects: "專題與活動", skills: "專長、證照與語言",
};
const TITLES_EN: Record<string, string> = {
  summary: "Summary", education: "Education", experience: "Experience", projects: "Projects & Activities", skills: "Skills & Certifications",
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const line = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** The templates' own <style>, whitespace kept as written. */
function styleOf(kind: TemplateKind): string {
  const m = /<style\b[^>]*>[\s\S]*?<\/style\s*>/i.exec(stripComments(SOURCE[kind]));
  return m ? m[0] : "";
}

function entry(title: string, role: string, dates: string, sub: string, bullets: string[]): string {
  const head =
    `<div class="entry-head"><div class="entry-title">${esc(title)}${role ? `<span class="role">${esc(role)}</span>` : ""}</div>` +
    `${dates ? `<div class="entry-date">${esc(dates)}</div>` : ""}</div>`;
  const ul = bullets.length ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
  return `<div class="entry">${head}${sub ? `<div class="entry-sub">${esc(sub)}</div>` : ""}${ul}</div>`;
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(line).filter(Boolean) : v ? [line(v)] : []);

function section(kind: TemplateKind, sec: any): string {
  const zh = ZH(kind);
  const title = (zh ? TITLES_ZH : TITLES_EN)[sec.kind] ?? sec.title ?? sec.kind;
  let body = "";
  if (sec.kind === "summary") body = `<p class="summary">${esc(line(sec.text))}</p>`;
  else if (sec.kind === "education")
    body = (sec.items || []).map((e: any) => entry(line(e.school), line(e.degree), line(e.dates), "", strs(e.details))).join("");
  else if (sec.kind === "experience")
    body = (sec.items || []).map((e: any) => entry(line(e.org), line(e.role), line(e.dates), line(e.location), strs(e.bullets))).join("");
  else if (sec.kind === "projects")
    body = (sec.items || []).map((e: any) => entry(line(e.name), "", line(e.dates), "", strs(e.bullets))).join("");
  else if (sec.kind === "skills") {
    const join = zh ? "、" : ", ";
    const items = (sec.lines || []).map((l: any) => {
      const label = line(l.label);
      const text = strs(l.items).join(join);
      // 中文範本：類別後面接全形「：」，項目直接接；英文範本：「Label:」後面一個空白
      return label
        ? `<li><span class="label">${esc(label)}${zh ? "：" : ":"}</span>${zh ? "" : " "}${esc(text)}</li>`
        : `<li>${esc(text)}</li>`;
    });
    body = `<ul class="skills">${items.join("")}</ul>`;
  } else return "";
  return `<section class="block"><h2>${esc(title)}</h2>${body}</section>`;
}

function header(kind: TemplateKind, b: any, photo: boolean): string {
  const name = `<h1 class="name">${esc(line(b?.name))}</h1>`;
  if (ZH(kind)) {
    const li = [b?.phone ? `手機 ${line(b.phone)}` : "", line(b?.email), line(b?.location)].filter(Boolean);
    const contact = li.length ? `<ul class="contact">${li.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    const slot = photo ? `<div class="photo" id="photo-slot"><img src="photo.jpg" alt="大頭照"></div>` : "";
    return `<header class="top"><div class="who">${name}${contact}</div>${slot}</header>`;
  }
  const linkedin = (Array.isArray(b?.links) ? b.links : []).map((l: any) => line(l?.url)).find((u: string) => /linkedin\./i.test(u));
  const li = [line(b?.location), line(b?.phone), line(b?.email), linkedin ? linkedin.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : ""].filter(Boolean);
  return `<header class="top">${name}${li.length ? `<ul class="contact">${li.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</header>`;
}

/** `doc` is R.resolve(...)'s result. `photo`: draw the template's photo frame (the viewer fills it in, or hides it). */
export function renderResume(kind: TemplateKind, doc: any, opts: { photo?: boolean } = {}): string {
  const name = line(doc?.basics?.name);
  const body = (doc?.sections || []).map((s: any) => section(kind, s)).join("");
  return (
    `<!DOCTYPE html><html lang="${ZH(kind) ? "zh-Hant-TW" : "en"}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title>${styleOf(kind)}</head>` +
    `<body><main class="page" id="page">${header(kind, doc?.basics, !!opts.photo && ZH(kind))}${body}</main></body></html>`
  );
}
