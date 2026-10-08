// Tailor the resume to one job through any AI: copy prompt → paste answer → machine check → confirm → PDF → applied.

import { checkTarget, resolve, tailor as applyTarget, Voice } from "../core/rules.js";
import { extractJson, fixPrompt, reviewPrompt, tailorPrompt } from "../core/prompts.js";
import { assignVersion, slug, targetIdFor } from "../core/store.js";
import { getLang, t } from "../i18n.js";
import { esc, safeUrl, today } from "../ui/dom.js";
import { fitPage, printResume } from "../ui/render.js";
import { findJob } from "./jobs.js";

const voice = new Voice();

function ui(app, id) {
  app.ui.tailor ||= {};
  return (app.ui.tailor[id] ||= { answer: "", errs: null, base: "", msg: "" });
}

function targetFor(app, job) {
  return Object.values(app.state.targets).find((x) => x.job_id === job.id) || null;
}

function baseVariant(app, job, u, target) {
  const variants = Object.keys(app.state.resume.variants || {});
  return u.base || target?.base_variant || (variants.includes(job.track) ? job.track : variants[0]);
}

function newJobForm(app) {
  const n = (app.ui.newJob ||= { company: "", title: "", link: "" });
  return `<h1>${t("tailor_title")}</h1><section class="card"><div class="grid2">
    <label class="field">${t("job_company")}<input data-bind="ui.newJob.company" value="${esc(n.company)}"></label>
    <label class="field">${t("job_title")}<input data-bind="ui.newJob.title" value="${esc(n.title)}"></label></div>
    <label class="field">${t("job_link")}<input data-bind="ui.newJob.link" type="url" value="${esc(n.link)}"></label>
    <div class="actions"><button class="primary" data-action="createJob">${t("start_tailor")}</button></div></section>`;
}

export function render(app) {
  if (!app.state.resume) return `<p>${t("need_resume")}</p>`;
  if (app.route.arg === "new") return newJobForm(app);
  const job = findJob(app, app.route.arg);
  if (!job) return `<p class="bad">?</p>`;
  const u = ui(app, job.id), r = app.state.resume;
  app.ui.cur = u;                                     // inputs bind to ui.cur.* (job ids may contain dots)
  u.jd ??= app.state.jd[job.id] || "";
  const target = targetFor(app, job);
  const base = baseVariant(app, job, u, target);
  const tid = target?.id || targetIdFor(job, app.state.targets);
  const jd = u.jd;
  const prompt = tailorPrompt({ resume: r, target: { id: tid, base_variant: base }, job, jd, lang: getLang() });
  const link = safeUrl(job.link);
  const out = [`<h1>${t("tailor_title")}</h1>
    <p class="job-head"><b>${esc(job.title)}</b> · ${esc(job.company)} ${link ? `· <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${t("open")} ↗</a>` : ""}</p>`];
  // step 1
  out.push(`<section class="card"><h2>${t("t_step1")}</h2>
    <label class="field">${t("base_version")}<select data-bind="ui.cur.base">${Object.entries(r.variants || {}).map(([v, s]) =>
      `<option value="${esc(v)}" ${v === base ? "selected" : ""}>${esc(s.title || v)}</option>`).join("")}</select></label>
    <label class="field">${t("jd_label")}<textarea data-bind="ui.cur.jd" rows="4">${esc(jd)}</textarea></label>
    <textarea id="tailor-prompt" class="prompt" readonly rows="5">${esc(prompt)}</textarea>
    <button class="primary" data-action="copy" data-from="tailor-prompt" data-copied="${t("copied")}">${t("copy_prompt")}</button></section>`);
  // step 2
  let checkHtml = "";
  if (u.errs && u.errs.length) {
    checkHtml = `<div class="bad"><p>${t("check_bad")}</p><textarea id="fix-prompt" class="prompt" readonly rows="5">${esc(fixPrompt(u.errs))}</textarea>
      <button data-action="copy" data-from="fix-prompt" data-copied="${t("copied")}">${t("copy_fix")}</button></div>`;
  } else if (u.errs) checkHtml = `<p class="good">✓ ${t("check_ok")}</p>`;
  out.push(`<section class="card"><h2>${t("t_step2")}</h2>
    <label class="field">${t("paste_answer")}<textarea data-bind="ui.cur.answer" rows="7">${esc(u.answer)}</textarea></label>
    <button class="primary" data-action="check" data-id="${esc(job.id)}">${t("check")}</button>${checkHtml}</section>`);
  // step 3
  if (target) {
    const open = (target.confirm || []).filter((q) => !(target.confirmed || []).includes(q));
    out.push(`<section class="card"><h2>${t("t_step3")}</h2>
      ${target.fit ? `<p><b>${t("fit")}:</b> ${esc(target.fit)}</p>` : ""}
      ${(target.confirm || []).length ? `<h3>${t("confirm_title")}</h3><ul class="checklist">${target.confirm.map((q, i) =>
        `<li><label><input type="checkbox" data-action="confirm" data-id="${esc(job.id)}" data-i="${i}" ${(target.confirmed || []).includes(q) ? "checked" : ""}> ${esc(q)}</label></li>`).join("")}</ul>
        ${open.length ? `<p class="warn">${esc(t("unconfirmed_warn", { n: open.length }))}</p>` : `<p class="good">${t("all_confirmed")}</p>`}` : ""}
      ${(target.gaps || []).length ? `<h3>${t("gaps")}</h3><ul>${target.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
      <div class="page"><div class="page-inner" id="tailor-page"></div></div>
      <div class="actions"><button class="primary" data-action="print" data-id="${esc(job.id)}">${t("download")}</button>
        <button data-action="review" data-id="${esc(job.id)}">${t("review_prompt")}</button>
        <button data-action="applied" data-id="${esc(job.id)}">${t("mark_applied")}</button></div>
      <textarea id="review-prompt" class="hidden"></textarea>${u.msg ? `<p class="good">${esc(u.msg)}</p>` : ""}</section>`);
  }
  return out.join("");
}

export function mount(app) {
  const el = document.getElementById("tailor-page");
  if (!el) return;
  const job = findJob(app, app.route.arg), target = targetFor(app, job);
  const res = fitPage(el, resolve(applyTarget(app.state.resume, target), target.base_variant));
  if (!res.fits) el.closest(".page").insertAdjacentHTML("beforebegin", `<p class="bad">2+ pages</p>`);
}

export function onInput(app, el, path) {
  if (path === "ui.cur.base") app.render();
  if (path === "ui.cur.jd") {
    const job = findJob(app, app.route.arg);
    if (job) { app.state.jd[job.id] = app.ui.cur.jd; app.save(); refreshPrompt(app, job); }
  }
}

function refreshPrompt(app, job) {
  const el = document.getElementById("tailor-prompt");
  if (!el) return;
  const u = ui(app, job.id), target = targetFor(app, job);
  const base = baseVariant(app, job, u, target);
  el.value = tailorPrompt({ resume: app.state.resume, target: { id: target?.id || targetIdFor(job, app.state.targets), base_variant: base },
    job, jd: u.jd, lang: getLang() });
}

export const actions = {
  createJob(app) {
    const n = app.ui.newJob || {};
    if (!n.company || !n.title) return;
    const job = { id: `manual-${slug(n.company + " " + n.title)}`, company: n.company, title: n.title, link: n.link || "", source: "manual" };
    app.state.known[job.id] = job; app.save(true);
    app.ui.newJob = null;
    app.go(`#/tailor/${encodeURIComponent(job.id)}`);
  },
  check(app, el) {
    const job = findJob(app, el.dataset.id), u = ui(app, job.id);
    u.msg = "";
    let target;
    try { target = extractJson(u.answer); } catch (e) { u.errs = [{ code: "json", message: e.message }]; app.render(); return; }
    const existing = targetFor(app, job);
    target.id = existing?.id || target.id || targetIdFor(job, app.state.targets);
    u.errs = checkTarget(app.state.resume, target, voice);
    if (!u.errs.length) {
      if (existing && existing.id !== target.id) delete app.state.targets[existing.id];
      app.state.targets[target.id] = { ...target, job_id: job.id, company: target.company || job.company,
        role: target.role || job.title, url: target.url || job.link || "", confirmed: [] };
      app.save(true);
    }
    app.render();
  },
  confirm(app, el) {
    const job = findJob(app, el.dataset.id), target = targetFor(app, job);
    const q = target.confirm[Number(el.dataset.i)];
    const set = new Set(target.confirmed || []);
    if (el.checked) set.add(q); else set.delete(q);
    target.confirmed = [...set];
    app.save(); app.render();
  },
  print(app, el) {
    const job = findJob(app, el.dataset.id), target = targetFor(app, job);
    const open = (target.confirm || []).filter((q) => !(target.confirmed || []).includes(q));
    const u = ui(app, job.id);
    if (open.length && !u.printAnyway) { u.printAnyway = true; el.textContent = "⚠ " + t("download") + "?"; return; }
    u.printAnyway = false;
    const doc = resolve(applyTarget(app.state.resume, target), target.base_variant);
    printResume(doc, `${(app.state.resume.basics.name || "resume").replace(/\s+/g, "_")}_${target.id}.pdf`);
  },
  review(app, el) {
    const job = findJob(app, el.dataset.id), target = targetFor(app, job);
    const ta = document.getElementById("review-prompt");
    ta.value = reviewPrompt({ resume: app.state.resume, target, job, jd: app.state.jd[job.id] || "", lang: getLang() });
    el.dataset.from = "review-prompt"; el.dataset.copied = t("copied");
    import("../ui/dom.js").then((m) => m.copy(ta.value, el));
  },
  async applied(app, el) {
    const job = findJob(app, el.dataset.id), target = targetFor(app, job);
    const doc = resolve(applyTarget(app.state.resume, target), target.base_variant);
    const major = Number(app.state.resume.variants[target.base_variant]?.major) || 1;
    const { plainText } = await import("../core/rules.js");
    const version = await assignVersion(app.state, `targets/${target.id}`, major, plainText(doc));
    let a = app.state.applications.find((x) => x.job_id === job.id);
    if (!a) { a = { job_id: job.id, company: job.company, role: job.title, track: job.track || "", link: job.link || "", source: job.source || "", contact: "", notes: "" }; app.state.applications.push(a); }
    Object.assign(a, { status: "applied", applied_date: a.applied_date || today(), last_update: today(),
      resume_version: `targets/${target.id}`, resume_rev: version, snapshot: doc });
    app.save(true);
    ui(app, job.id).msg = t("applied_ok", { v: version });
    app.render();
  },
};
