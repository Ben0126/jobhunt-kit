// First visit: what are you looking for → import the old resume through any AI → done.

import { DEFENSE_COMPANIES, PRESETS, SPONSOR_EXCLUDE_TITLES, trackFromPreset } from "../core/jobs.js";
import { extractJson, importPrompt } from "../core/prompts.js";
import { validateResume } from "../core/rules.js";
import { emptyResume, SAMPLE_RESUME } from "../core/sample.js";
import { syncVariants } from "../core/store.js";
import { getLang, t } from "../i18n.js";
import { esc } from "../ui/dom.js";

function ui(app) {
  return (app.ui.start ||= { step: 1, answer: "", msg: "", err: "", picked: [] });
}

export function render(app) {
  const u = ui(app), s = app.state.settings;
  const head = `<h1>${t("start_title")}</h1><p class="muted">${t("app_tagline")}</p><p class="step">${t("step", { n: u.step })}</p>`;
  if (u.step === 1) {
    const picked = new Set(s.tracks.map((x) => x.id));
    return `${head}<section class="card"><h2>${t("s1_title")}</h2>
      <label class="field">${t("s1_kind")}
        <select data-bind="settings.employment">
          <option value="intern" ${s.employment === "intern" ? "selected" : ""}>${t("intern")}</option>
          <option value="fulltime" ${s.employment === "fulltime" ? "selected" : ""}>${t("fulltime")}</option>
        </select></label>
      <fieldset class="field"><legend>${t("s1_types")}</legend><div class="chips">
        ${PRESETS.map((p) => `<label class="chip"><input type="checkbox" data-action="pick" data-id="${p.id}" ${picked.has(p.id) ? "checked" : ""}>
          ${esc(p.label[getLang()] || p.label.en)}</label>`).join("")}</div></fieldset>
      <fieldset class="field"><legend>${t("s1_visa")}</legend>
        <label class="radio"><input type="radio" name="visa" data-action="visa" data-v="1" ${s.needsSponsorship ? "checked" : ""}> ${t("yes")}</label>
        <label class="radio"><input type="radio" name="visa" data-action="visa" data-v="0" ${!s.needsSponsorship ? "checked" : ""}> ${t("no")}</label>
      </fieldset>
      <div class="actions"><button class="primary" data-action="next" ${s.tracks.length ? "" : "disabled"}>${t("next")}</button></div></section>`;
  }
  if (u.step === 2) {
    const prompt = importPrompt({ lang: getLang(), tracks: s.tracks });
    return `${head}<section class="card"><h2>${t("s2_title")}</h2>
      <p>${t("s2_how")}</p><ol><li>${t("s2_1")}</li><li>${t("s2_2")}</li><li>${t("s2_3")}</li></ol>
      <textarea id="import-prompt" class="prompt" readonly rows="6">${esc(prompt)}</textarea>
      <button data-action="copy" data-from="import-prompt" data-copied="${t("copied")}">${t("copy_prompt")}</button>
      <label class="field">${t("paste_answer")}<textarea data-bind="ui.start.answer" rows="8">${esc(u.answer)}</textarea></label>
      ${u.err ? `<p class="bad">${esc(u.err)}</p>` : ""}${u.msg ? `<div class="good">${u.msg}</div>` : ""}
      <div class="actions"><button data-action="back">${t("back")}</button>
        <button class="primary" data-action="import">${t("import")}</button>
        <button data-action="example">${t("s2_example")}</button><button data-action="manual">${t("s2_manual")}</button>
        ${app.state.resume ? `<button class="primary" data-action="next">${t("next")}</button>` : ""}</div></section>`;
  }
  return `${head}<section class="card"><h2>${t("s3_title")}</h2><p>${t("s3_body")}</p>
    <div class="actions"><button class="primary" data-action="finish">${t("done")}</button></div></section>`;
}

export const actions = {
  pick(app, el) {
    const s = app.state.settings;
    const p = PRESETS.find((x) => x.id === el.dataset.id);
    if (el.checked && s.tracks.length < 3) s.tracks.push(trackFromPreset(p, getLang()));
    else s.tracks = s.tracks.filter((x) => x.id !== p.id);
    app.save(); app.render();
  },
  visa(app, el) {
    const s = app.state.settings;
    s.needsSponsorship = el.dataset.v === "1";
    s.exclude = s.needsSponsorship ? { companies: [...DEFENSE_COMPANIES], titles: [...SPONSOR_EXCLUDE_TITLES] } : { companies: [], titles: [] };
    app.save();
  },
  next(app) { ui(app).step++; app.render(); },
  back(app) { ui(app).step--; app.render(); },
  import(app) {
    const u = ui(app);
    u.err = u.msg = "";
    try {
      const got = extractJson(u.answer);
      const resume = syncVariants(got.resume || got, app.state.settings.tracks);
      const errs = validateResume(resume);
      if (errs.length) throw new Error(errs.join("; "));
      app.state.resume = resume;
      const qs = Array.isArray(got.questions) ? got.questions : [];
      u.msg = esc(t("import_ok", { n: (resume.experience || []).length, m: (resume.projects || []).length })) +
        (qs.length ? `<p>${t("s2_questions")}</p><ul>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : "");
      app.save(true);
    } catch (e) { u.err = `${t("error")}: ${e.message}`; }
    app.render();
  },
  example(app) {
    app.state.resume = syncVariants(structuredClone(SAMPLE_RESUME), app.state.settings.tracks);
    app.save(true); ui(app).step = 3; app.render();
  },
  manual(app) {
    app.state.resume = syncVariants(emptyResume(), app.state.settings.tracks);
    app.save(true); ui(app).step = 3; app.render();
  },
  finish(app) {
    app.state.setupDone = true; app.save(true);
    app.go(app.state.resume && app.state.resume.basics.name ? "#/jobs" : "#/resume");
  },
};
