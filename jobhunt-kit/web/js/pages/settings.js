// Settings: job types, exclusions, follow-up timing, backup / restore, and how to connect an AI.

import { PRESETS, trackFromPreset } from "../core/jobs.js";
import { emptyState, parseBackup, save, syncVariants } from "../core/store.js";
import { getLang, t } from "../i18n.js";
import { download, esc, today } from "../ui/dom.js";
import { resetFeed } from "./jobs.js";

export function render(app) {
  const s = app.state.settings;
  const unused = PRESETS.filter((p) => !s.tracks.some((x) => x.id === p.id));
  return `<h1>${t("settings_title")}</h1>
  <section class="card"><h2>${t("s1_title")}</h2>
    <label class="field">${t("s1_kind")}<select data-bind="settings.employment">
      <option value="intern" ${s.employment === "intern" ? "selected" : ""}>${t("intern")}</option>
      <option value="fulltime" ${s.employment === "fulltime" ? "selected" : ""}>${t("fulltime")}</option></select></label>
    <label class="field"><input type="checkbox" data-bind="settings.needsSponsorship" ${s.needsSponsorship ? "checked" : ""}> ${t("s1_visa")}</label>
    <h3>${t("types_edit")}</h3>
    ${s.tracks.map((tr, i) => `<div class="grid2 row-tools">
      <label class="field">${t("label")}<input data-bind="settings.tracks.${i}.label" value="${esc(tr.label)}"></label>
      <label class="field">${t("search")}<input data-bind="settings.tracks.${i}.titles" data-type="csv" value="${esc(tr.titles.join(", "))}"></label>
      <button class="small danger" data-action="dropTrack" data-i="${i}">${t("remove")}</button></div>`).join("")}
    ${unused.length ? `<div class="chips">${unused.map((p) => `<button class="small" data-action="addTrack" data-id="${p.id}">＋ ${esc(p.label[getLang()] || p.label.en)}</button>`).join("")}</div>` : ""}
  </section>
  <section class="card"><h2>${t("exclude")}</h2>
    <label class="field">${t("exclude_companies")}<textarea data-bind="settings.exclude.companies" data-type="lines" rows="4">${esc(s.exclude.companies.join("\n"))}</textarea></label>
    <label class="field">${t("exclude_titles")}<textarea data-bind="settings.exclude.titles" data-type="lines" rows="3">${esc(s.exclude.titles.join("\n"))}</textarea></label>
  </section>
  <section class="card"><h2>${t("followup_days")}</h2><div class="grid2">
    <label class="field">${t("nudge_days")}<input type="number" min="1" data-type="number" data-bind="settings.followup.nudge_days" value="${s.followup.nudge_days}"></label>
    <label class="field">${t("ghost_days")}<input type="number" min="1" data-type="number" data-bind="settings.followup.ghost_days" value="${s.followup.ghost_days}"></label></div>
  </section>
  <section class="card"><h2>${t("ai_title")}</h2><p>${t("ai_body")}</p></section>
  <section class="card"><h2>${t("backup")}</h2><p class="muted">${t("privacy")} ${t("backup_note")}</p>
    <div class="actions"><button class="primary" data-action="export">${t("export")}</button>
      <label class="btn">${t("import_backup")}<input type="file" accept=".json,application/json" data-action="importFile" hidden></label>
      <button class="danger" data-action="reset">${t("reset")}</button></div>
    ${app.ui.backupMsg ? `<p class="good">${esc(app.ui.backupMsg)}</p>` : ""}</section>`;
}

export function onInput(app, el, path) {
  if (path === "settings.employment") resetFeed();
  if (path.startsWith("settings.tracks")) { app.state.resume = syncVariants(app.state.resume, app.state.settings.tracks); app.save(); }
}

export const actions = {
  addTrack(app, el) {
    app.state.settings.tracks.push(trackFromPreset(PRESETS.find((p) => p.id === el.dataset.id), getLang()));
    app.state.resume = syncVariants(app.state.resume, app.state.settings.tracks);
    app.save(); app.render();
  },
  dropTrack(app, el) {
    app.state.settings.tracks.splice(Number(el.dataset.i), 1);
    app.state.resume = syncVariants(app.state.resume, app.state.settings.tracks);
    app.save(); app.render();
  },
  export(app) {
    save(app.state);
    download(`jobhunt-backup-${today()}.json`, JSON.stringify(app.state, null, 1));
  },
  importFile(app, el) {
    el.onchange = async () => {
      const file = el.files[0];
      if (!file) return;
      try {
        app.state = parseBackup(await file.text());
        save(app.state); resetFeed();
        app.ui = { backupMsg: t("backup_ok") };
        app.renderShell(); app.render();
      } catch (e) { app.ui.backupMsg = `${t("error")}: ${e.message}`; app.render(); }
    };
  },
  reset(app, el) {
    if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = t("reset_confirm"); return; }
    app.state = emptyState(getLang()); save(app.state); resetFeed(); app.ui = {};
    app.go("#/start");
  },
};
