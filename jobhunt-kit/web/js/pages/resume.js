// The one place facts live. Plain form fields — no YAML. Each bullet can be limited to some job types.

import { longSentences, resolve, validateResume, Voice } from "../core/rules.js";
import { emptyResume } from "../core/sample.js";
import { slug, syncVariants } from "../core/store.js";
import { t } from "../i18n.js";
import { esc, getPath, setPath } from "../ui/dom.js";
import { fitPage, printResume } from "../ui/render.js";

const voice = new Voice();

function input(path, value, label, attrs = "") {
  return `<label class="field">${esc(label)}<input data-bind="${path}" value="${esc(value ?? "")}" ${attrs}></label>`;
}
function area(path, value, label, rows = 2, type = "") {
  const v = Array.isArray(value) ? value.join("\n") : value ?? "";
  return `<label class="field">${esc(label)}<textarea data-bind="${path}" rows="${rows}" ${type ? `data-type="${type}"` : ""}>${esc(v)}</textarea></label>`;
}
function tools(path, i) {
  return `<span class="tools"><button class="small" data-action="up" data-path="${path}" data-i="${i}" title="${t("up")}">↑</button>
    <button class="small danger" data-action="del" data-path="${path}" data-i="${i}">${t("remove")}</button></span>`;
}

function variantPicker(app, path, node) {
  const tracks = app.state.settings.tracks;
  if (tracks.length < 2) return "";
  const on = new Set(node.variants || []);
  return `<div class="variants">${t("shows_in")} ${tracks.map((tr) => `<label class="mini"><input type="checkbox" data-action="variant"
    data-path="${path}" data-v="${esc(tr.id)}" ${!on.size || on.has(tr.id) ? "checked" : ""}> ${esc(tr.label)}</label>`).join("")}</div>`;
}

function warnings(text, path) {
  return `<span class="warn-slot" data-for="${path}">${warnText(text)}</span>`;
}

function warnText(text) {
  const p = voice.problems(text || "").map((x) => x.code === "ai_word" ? `“${x.word}”` : x.code === "parens" ? "( ) ×" + x.n : ";");
  const long = longSentences(text || "").length ? ["35+ words"] : [];
  const all = [...p, ...long];
  return all.length ? `<span class="warn-inline">⚠ ${esc(all.join(" · "))}</span>` : "";
}

function bullets(app, base, item) {
  return `<div class="bullets">${(item.bullets || []).map((b, j) => `<div class="bullet">
      <textarea data-bind="${base}.bullets.${j}.text" rows="2">${esc(b.text)}</textarea>
      <div class="bullet-foot"><code>${esc(b.id || "")}</code> ${warnings(b.text, `${base}.bullets.${j}.text`)} ${variantPicker(app, `${base}.bullets.${j}`, b)} ${tools(`${base}.bullets`, j)}</div>
    </div>`).join("")}
    <button class="small" data-action="addBullet" data-path="${base}">${t("add")}</button></div>`;
}

export function render(app) {
  const r = app.state.resume;
  if (!r) return `<h1>${t("resume_title")}</h1><p>${t("resume_none")}</p><button class="primary" data-action="create">${t("add")}</button>`;
  const tracks = app.state.settings.tracks;
  const errs = validateResume(r);
  const out = [`<h1>${t("resume_title")}</h1>`];
  if (errs.length) out.push(`<p class="bad">${esc(errs.join(" · "))}</p>`);
  // preview buttons
  out.push(`<div class="actions">${Object.entries(r.variants || {}).map(([v, spec]) =>
    `<button data-action="preview" data-v="${esc(v)}">${t("preview")} — ${esc(t("version_of", { v: spec.title || v }))}</button>`).join("")}</div>`);
  // basics
  const b = r.basics || {};
  out.push(`<section class="card"><h2>${t("basics")}</h2><div class="grid2">
    ${input("resume.basics.name", b.name, t("name"))}${input("resume.basics.email", b.email, t("email"), 'type="email"')}
    ${input("resume.basics.phone", b.phone, t("phone"))}${input("resume.basics.location", b.location, t("location"))}</div>
    <h3>${t("links")}</h3>${(b.links || []).map((l, i) => `<div class="grid2 row-tools">${input(`resume.basics.links.${i}.label`, l.label, t("label"))}
      ${input(`resume.basics.links.${i}.url`, l.url, t("url"))}${tools("resume.basics.links", i)}</div>`).join("")}
    <button class="small" data-action="add" data-path="resume.basics.links" data-kind="link">${t("add")}</button></section>`);
  // summary
  const sm = r.summary && typeof r.summary === "object" ? r.summary : { default: r.summary || "" };
  out.push(`<section class="card"><h2>${t("summary")}</h2>
    ${area("resume.summary.default", sm.default, t("summary_default"), 3)}${warnings(sm.default, "resume.summary.default")}
    ${tracks.map((tr) => area(`resume.summary.${tr.id}`, sm[tr.id], tr.label, 2) + warnings(sm[tr.id], `resume.summary.${tr.id}`)).join("")}</section>`);
  // education
  out.push(`<section class="card"><h2>${t("education")}</h2>${(r.education || []).map((e, i) => `<div class="entry-edit">
      <div class="grid2">${input(`resume.education.${i}.school`, e.school, t("school"))}${input(`resume.education.${i}.degree`, e.degree, t("degree"))}
      ${input(`resume.education.${i}.dates`, e.dates, t("dates"))}${input(`resume.education.${i}.location`, e.location, t("location"))}</div>
      ${area(`resume.education.${i}.details`, e.details, t("details"), 2, "lines")}${tools("resume.education", i)}</div>`).join("")}
    <button class="small" data-action="add" data-path="resume.education" data-kind="edu">${t("add")}</button></section>`);
  // experience & projects
  for (const sec of ["experience", "projects"]) {
    out.push(`<section class="card"><h2>${t(sec)}</h2>${(r[sec] || []).map((e, i) => {
      const base = `resume.${sec}.${i}`;
      const fieldsHtml = sec === "experience"
        ? `${input(`${base}.org`, e.org, t("org"))}${input(`${base}.role`, e.role, t("role"))}${input(`${base}.dates`, e.dates, t("dates"))}${input(`${base}.location`, e.location, t("location"))}`
        : `${input(`${base}.name`, e.name, t("project_name"))}${input(`${base}.link`, e.link, t("link"))}${input(`${base}.dates`, e.dates, t("dates"))}`;
      return `<div class="entry-edit"><div class="grid2">${fieldsHtml}</div>${variantPicker(app, base, e)}
        <h4>${t("bullets")}</h4>${bullets(app, base, e)}${tools(`resume.${sec}`, i)}</div>`;
    }).join("")}<button class="small" data-action="add" data-path="resume.${sec}" data-kind="${sec}">${t("add")}</button></section>`);
  }
  // skills
  out.push(`<section class="card"><h2>${t("skills")}</h2>${(r.skills || []).map((l, i) => `<div class="grid2 row-tools">
      ${input(`resume.skills.${i}.label`, l.label, t("skill_label"))}
      <label class="field">${t("skill_items")}<input data-bind="resume.skills.${i}.items" data-type="csv" value="${esc((l.items || []).join(", "))}"></label>
      ${variantPicker(app, `resume.skills.${i}`, l)}${tools("resume.skills", i)}</div>`).join("")}
    <button class="small" data-action="add" data-path="resume.skills" data-kind="skill">${t("add")}</button></section>`);
  out.push(`<div id="preview" class="preview-wrap"></div>`);
  return out.join("");
}

const NEW = {
  link: () => ({ label: "", url: "" }),
  edu: () => ({ school: "", degree: "", dates: "", location: "", details: [] }),
  experience: () => ({ id: "", org: "", role: "", dates: "", location: "", bullets: [] }),
  projects: () => ({ id: "", name: "", link: "", dates: "", bullets: [] }),
  skill: () => ({ label: "", items: [] }),
};

/** Stable ids: entries from their name, bullets from the entry id + a counter. Ids must never change once used. */
function ensureIds(r) {
  const used = new Set();
  for (const sec of ["experience", "projects"]) for (const e of r[sec] || []) for (const b of e.bullets || []) if (b.id) used.add(b.id);
  for (const sec of ["experience", "projects"]) {
    for (const e of r[sec] || []) {
      if (!e.id) e.id = slug(e.org || e.name || sec).split("-").slice(0, 2).join("_") || sec;
      let n = 1;
      for (const b of e.bullets || []) {
        if (b.id) continue;
        while (used.has(`${e.id}_${n}`)) n++;
        b.id = `${e.id}_${n}`; used.add(b.id);
      }
    }
  }
}

export function onInput(app, el, path) {
  if (!path.startsWith("resume.")) return;
  if (/\.(org|name)$/.test(path)) ensureIds(app.state.resume);
  const slot = document.querySelector(`.warn-slot[data-for="${path}"]`);
  if (slot) slot.innerHTML = warnText(el.value);
}

export const actions = {
  create(app) { app.state.resume = syncVariants(emptyResume(), app.state.settings.tracks); app.save(true); app.render(); },
  add(app, el) {
    let list = getPath(app.state, el.dataset.path);
    if (!Array.isArray(list)) { list = []; setPath(app.state, el.dataset.path, list); }
    list.push(NEW[el.dataset.kind]());
    app.save(); app.render();
  },
  addBullet(app, el) {
    const item = getPath(app.state, el.dataset.path);
    (item.bullets ||= []).push({ text: "" });
    ensureIds(app.state.resume); app.save(); app.render();
  },
  del(app, el) {
    getPath(app.state, el.dataset.path).splice(Number(el.dataset.i), 1);
    app.save(); app.render();
  },
  up(app, el) {
    const list = getPath(app.state, el.dataset.path), i = Number(el.dataset.i);
    if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    app.save(); app.render();
  },
  variant(app, el) {
    const node = getPath(app.state, el.dataset.path);
    const all = app.state.settings.tracks.map((x) => x.id);
    let on = new Set(node.variants && node.variants.length ? node.variants : all);
    if (el.checked) on.add(el.dataset.v); else on.delete(el.dataset.v);
    if (on.size === all.length || on.size === 0) delete node.variants; else node.variants = all.filter((v) => on.has(v));
    app.save();
  },
  preview(app, el) {
    ensureIds(app.state.resume);
    const doc = resolve(app.state.resume, el.dataset.v);
    const wrap = document.getElementById("preview");
    wrap.innerHTML = `<div class="page"><div class="page-inner"></div></div>
      <div class="actions"><button class="primary" data-action="print" data-v="${esc(el.dataset.v)}">${t("download")}</button></div>`;
    const res = fitPage(wrap.querySelector(".page-inner"), doc);
    if (!res.fits) wrap.insertAdjacentHTML("afterbegin", `<p class="bad">2+ pages</p>`);
    wrap.scrollIntoView({ behavior: "smooth" });
  },
  print(app, el) {
    const doc = resolve(app.state.resume, el.dataset.v);
    printResume(doc, `${(app.state.resume.basics.name || "resume").replace(/\s+/g, "_")}_${el.dataset.v}.pdf`);
  },
};
