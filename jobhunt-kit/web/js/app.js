// App shell: state, routing (#/jobs, #/resume, #/tailor/<id>, #/apps, #/settings, #/start), data binding.
// Pages are modules exporting render(app) → HTML string, and optional actions {name(app, el, event)} and mount(app).

import * as store from "./core/store.js";
import { getLang, guessLang, setLang, t } from "./i18n.js";
import { copy, getPath, setPath } from "./ui/dom.js";
import * as start from "./pages/start.js";
import * as jobs from "./pages/jobs.js";
import * as resume from "./pages/resume.js";
import * as tailor from "./pages/tailor.js";
import * as apps from "./pages/apps.js";
import * as settings from "./pages/settings.js";

const PAGES = { start, jobs, resume, tailor, apps, settings };

export const app = {
  state: null,
  route: { page: "jobs", arg: "" },
  ui: {},                       // per-page view state that isn't saved (filters, pasted answers…)
  saveTimer: null,

  save(now = false) {
    clearTimeout(this.saveTimer);
    const write = () => { store.save(this.state); const el = document.getElementById("saved"); if (el) { el.textContent = "✓ " + t("saved_ok"); setTimeout(() => (el.textContent = ""), 1200); } };
    if (now) write(); else this.saveTimer = setTimeout(write, 400);
  },

  go(hash) { if (location.hash === hash) this.render(); else location.hash = hash; },

  render() {
    const page = PAGES[this.route.page] || jobs;
    document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.page === this.route.page));
    const main = document.getElementById("main");
    main.innerHTML = page.render(this);
    page.mount?.(this);
  },

  renderShell() {
    setLang(this.state.settings.lang);
    document.getElementById("nav").innerHTML = ["jobs", "resume", "apps", "settings"]
      .map((p) => `<a href="#/${p}" data-page="${p}">${t("nav_" + p)}</a>`).join("");
    document.getElementById("privacy").textContent = t("privacy");
    document.getElementById("lang").value = getLang();
  },
};

function parseRoute() {
  const [, page = "", arg = ""] = location.hash.match(/^#\/([a-z]+)\/?(.*)$/) || [];
  if (!app.state.setupDone && page !== "settings") return { page: "start", arg: "" };
  return { page: PAGES[page] ? page : "jobs", arg: decodeURIComponent(arg) };
}

function onInput(e) {
  const el = e.target.closest("[data-bind]");
  if (!el) return;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.type === "lines") v = String(v).split("\n").map((s) => s.trim()).filter(Boolean);
  if (el.dataset.type === "csv") v = String(v).split(",").map((s) => s.trim()).filter(Boolean);
  if (el.dataset.type === "number") v = Number(v) || 0;
  const path = el.dataset.bind;
  if (path.startsWith("ui.")) setPath(app.ui, path.slice(3), v);
  else { setPath(app.state, path, v); app.save(); }
  const page = PAGES[app.route.page];
  page.onInput?.(app, el, path);
}

function onClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const page = PAGES[app.route.page];
  const fn = page.actions?.[el.dataset.action] || shared[el.dataset.action];
  if (fn) { if (!el.matches("input")) e.preventDefault(); fn(app, el, e); }
}

/** Actions any page can use. */
const shared = {
  copy(app, el) { copy(document.getElementById(el.dataset.from)?.value ?? el.dataset.text ?? "", el); },
  toggle(app, el) { const p = el.dataset.path; setPath(app.ui, p, !getPath(app.ui, p)); app.render(); },
};

export function boot() {
  app.state = store.load() || store.emptyState(guessLang());
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  app.renderShell();
  document.getElementById("lang").addEventListener("change", (e) => {
    app.state.settings.lang = e.target.value; app.save(true); app.renderShell(); app.render();
  });
  document.addEventListener("input", onInput);
  document.addEventListener("click", onClick);
  window.addEventListener("hashchange", () => { app.route = parseRoute(); app.render(); window.scrollTo(0, 0); });
  app.route = parseRoute();
  app.render();
}
