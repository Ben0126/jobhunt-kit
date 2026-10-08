// Applications: status, dates, follow-ups (with an email-draft prompt), and the exact resume that was sent.

import { followupPrompt } from "../core/prompts.js";
import { followups, stats, STATUSES } from "../core/store.js";
import { getLang, t } from "../i18n.js";
import { copy, esc, safeUrl, today } from "../ui/dom.js";
import { printResume } from "../ui/render.js";

export function render(app) {
  const st = app.state, f = followups(st), s = stats(st);
  const out = [`<h1>${t("apps_title")}</h1>`];
  if (st.applications.length)
    out.push(`<p class="muted">${esc(t("stats", { s: s.sent, r: s.replied, p: s.rate == null ? "—" : Math.round(s.rate * 100) + "%" }))}</p>`);
  if (f.todo.length || f.ghost.length) {
    const item = (x, text) => {
      const i = st.applications.indexOf(x.app);
      return `<li>${esc(x.app.company)} — ${esc(x.app.role)}: ${esc(text)}
        <button class="small" data-action="followup" data-i="${i}" data-days="${x.days || 0}">${t("followup_prompt")}</button></li>`;
    };
    out.push(`<section class="card">${f.todo.length ? `<h2>${t("todo_title")}</h2><ul>${f.todo.map((x) =>
      item(x, x.kind === "due" ? t("due", { a: x.app.next_action || "" }) : t("nudge", { d: x.days, c: x.app.contact }))).join("")}</ul>` : ""}
      ${f.ghost.length ? `<h2>${t("ghost_title")}</h2><ul>${f.ghost.map((x) => item(x, t("ghost", { d: x.days }))).join("")}</ul>` : ""}</section>`);
  }
  if (!st.applications.length) out.push(`<p>${t("apps_none")}</p>`);
  out.push(`<div class="apps">${st.applications.map((a, i) => {
    const link = safeUrl(a.link);
    return `<section class="card app"><div class="app-head"><b>${esc(a.company)}</b> — ${esc(a.role)}
        ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}</div>
      <div class="grid3">
        <label class="field">${t("status")}<select data-bind="applications.${i}.status">${STATUSES.map((x) =>
          `<option value="${x}" ${a.status === x ? "selected" : ""}>${t("st_" + x)}</option>`).join("")}</select></label>
        <label class="field">${t("applied_date")}<input type="date" data-bind="applications.${i}.applied_date" value="${esc(a.applied_date || "")}"></label>
        <label class="field">${t("contact")}<input data-bind="applications.${i}.contact" value="${esc(a.contact || "")}"></label>
        <label class="field">${t("next_action")}<input data-bind="applications.${i}.next_action" value="${esc(a.next_action || "")}"></label>
        <label class="field">${t("next_date")}<input type="date" data-bind="applications.${i}.next_action_date" value="${esc(a.next_action_date || "")}"></label>
        <label class="field">${t("notes")}<input data-bind="applications.${i}.notes" value="${esc(a.notes || "")}"></label>
      </div>
      ${a.snapshot ? `<p class="muted">${t("sent_version")}: ${esc(a.resume_rev || "")} (${esc(a.resume_version || "")})
        <button class="small" data-action="redownload" data-i="${i}">${t("redownload")}</button></p>` : ""}
      <button class="small danger" data-action="remove" data-i="${i}">${t("remove")}</button></section>`;
  }).join("")}</div>
  <button data-action="add">${t("add_app")}</button>`);
  return out.join("");
}

export function onInput(app, el, path) {
  const m = path.match(/^applications\.(\d+)\.(status|applied_date|next_action|next_action_date|contact|notes)$/);
  if (!m) return;
  app.state.applications[Number(m[1])].last_update = today();
  app.save();
  if (m[2] === "status") app.render();
}

export const actions = {
  add(app) {
    app.state.applications.unshift({ job_id: `manual-${Date.now()}`, company: "?", role: "?", status: "todo", last_update: today() });
    app.save(); app.render();
    const first = document.querySelector('[data-bind="applications.0.contact"]');
    if (first) first.focus();
  },
  remove(app, el) {
    if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = t("remove") + "?"; return; }
    app.state.applications.splice(Number(el.dataset.i), 1); app.save(); app.render();
  },
  redownload(app, el) {
    const a = app.state.applications[Number(el.dataset.i)];
    printResume(a.snapshot, `${(a.snapshot.basics.name || "resume").replace(/\s+/g, "_")}_${a.resume_version.split("/").pop()}_${a.resume_rev}.pdf`);
  },
  followup(app, el) {
    const a = app.state.applications[Number(el.dataset.i)];
    el.dataset.copied = t("copied");
    copy(followupPrompt({ app: a, lang: getLang(), days: Number(el.dataset.days) }), el);
  },
};
