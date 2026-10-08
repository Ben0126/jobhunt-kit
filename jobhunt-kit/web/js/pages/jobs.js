// Today's postings, filtered by the person's job types and visa needs.

import { loadFeed } from "../core/feed.js";
import { filterJobs, isSeen, jobIds } from "../core/jobs.js";
import { t } from "../i18n.js";
import { esc, safeUrl } from "../ui/dom.js";

const PAGE = 60;
let feed = null, loading = null, failed = "", sessionSeen = null;

function ui(app) {
  return (app.ui.jobs ||= { query: "", track: "", newOnly: false, sponsorOk: false, h1bOnly: false, limit: PAGE });
}

export function ensureFeed(app) {
  if (feed || loading) return loading;
  loading = loadFeed(app.state.settings).then((f) => {
    feed = f;
    const all = new Set(app.state.seen);
    for (const j of f.jobs) for (const id of jobIds(j)) all.add(id);
    // "new" = not seen before this visit; the very first visit is the baseline (nothing is new)
    sessionSeen = app.state.seen.length ? new Set(app.state.seen) : new Set(all);
    app.state.seen = [...all].slice(-20000);
    app.save();
  }).catch((e) => { failed = e.message; }).finally(() => { loading = null; if (app.route.page === "jobs") app.render(); });
  return loading;
}

export function findJob(app, id) {
  return (feed && feed.jobs.find((j) => jobIds(j).includes(id))) || app.state.saved[id] || app.state.known[id] || null;
}

export function resetFeed() { feed = null; failed = ""; }

export function render(app) {
  const u = ui(app), s = app.state.settings;
  if (!feed) {
    ensureFeed(app);
    return `<h1>${t("jobs_title")}</h1><p class="muted">${failed ? esc(t("jobs_failed", { e: failed })) : t("jobs_loading")}</p>`;
  }
  const { jobs, excluded } = filterJobs(feed.jobs, s, { query: u.query, track: u.track, newOnly: u.newOnly,
    seen: sessionSeen, sponsorOk: u.sponsorOk, h1bOnly: u.h1bOnly });
  const label = Object.fromEntries(s.tracks.map((x) => [x.id, x.label]));
  const rows = jobs.slice(0, u.limit).map((j) => {
    const fresh = !isSeen(j, sessionSeen), link = safeUrl(j.link), saved = !!app.state.saved[j.id];
    const badges = [fresh ? `<span class="badge new">${t("badge_new")}</span>` : "", `<span class="badge">${esc(label[j.track] || j.track)}</span>`,
      j.tier === "1" || j.tier === 1 ? `<span class="badge">T1</span>` : "",
      j.sponsor ? `<span class="badge ${j.sponsor === "yes" ? "ok" : "warn"}">${t("sponsor_" + j.sponsor)}</span>` : "",
      j.h1b ? `<span class="badge ${["strong", "moderate"].includes(j.h1b) ? "ok" : ""}">${t("h1b", { lv: t("h1b_" + j.h1b) })}</span>` : ""].join("");
    return `<li class="job"><div class="job-main"><div class="job-title">${esc(j.title)}</div>
      <div class="job-meta">${esc(j.company)} · ${esc(j.locations || "")} · ${esc(j.posted || "")}</div><div>${badges}</div></div>
      <div class="job-actions">${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${t("open")} ↗</a>` : ""}
        <button data-action="save" data-id="${esc(j.id)}">${saved ? "★ " + t("saved") : "☆ " + t("save")}</button>
        <button class="primary" data-action="tailor" data-id="${esc(j.id)}">${t("tailor")}</button></div></li>`;
  }).join("");
  return `<h1>${t("jobs_title")}</h1>
    <p class="muted">${esc(t("jobs_updated", { d: (feed.generated || "").slice(0, 16).replace("T", " ") }))} ·
      ${esc(t("jobs_count", { n: jobs.length, x: excluded }))}</p>
    <div class="filters">
      <input type="search" placeholder="${t("search")}" data-bind="ui.jobs.query" value="${esc(u.query)}">
      <select data-bind="ui.jobs.track"><option value="">${t("all_types")}</option>
        ${s.tracks.map((x) => `<option value="${esc(x.id)}" ${u.track === x.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
      <label><input type="checkbox" data-bind="ui.jobs.newOnly" ${u.newOnly ? "checked" : ""}> ${t("new_only")}</label>
      ${s.needsSponsorship ? `<label><input type="checkbox" data-bind="ui.jobs.sponsorOk" ${u.sponsorOk ? "checked" : ""}> ${t("hide_nosponsor")}</label>
        <label><input type="checkbox" data-bind="ui.jobs.h1bOnly" ${u.h1bOnly ? "checked" : ""}> ${t("h1b_only")}</label>` : ""}
    </div>
    <p><a href="#/tailor/new">${t("tailor_any")}</a></p>
    <ul class="jobs">${rows || `<li class="muted">${t("no_jobs")}</li>`}</ul>
    ${jobs.length > u.limit ? `<button data-action="more">${t("more")}</button>` : ""}`;
}

let timer;
export function onInput(app, el, path) {
  if (!path.startsWith("ui.jobs.")) return;
  ui(app).limit = PAGE;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const pos = el.selectionStart;
    app.render();
    const again = document.querySelector(`[data-bind="${path}"]`);
    if (again && again.type === "search") { again.focus(); again.setSelectionRange(pos, pos); }
  }, el.type === "search" ? 250 : 0);
}

export const actions = {
  more(app) { ui(app).limit += PAGE; app.render(); },
  save(app, el) {
    const j = findJob(app, el.dataset.id);
    if (app.state.saved[j.id]) delete app.state.saved[j.id]; else app.state.saved[j.id] = j;
    app.save(); app.render();
  },
  tailor(app, el) {
    const j = findJob(app, el.dataset.id);
    app.state.known[j.id] = j;                   // keep the posting even after it leaves the feed
    app.save(true);
    app.go(`#/tailor/${encodeURIComponent(j.id)}`);
  },
};
