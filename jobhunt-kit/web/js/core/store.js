// Everything the person enters lives in their own browser (localStorage) — no server. backup.json carries it
// between browsers, and into the CLI / MCP server (`jobhunt web-import backup.json`).

export const FORMAT = "jobhunt-backup";
export const KEY = "jobhunt.v1";

export const STATUSES = ["todo", "applied", "oa", "interview", "offer", "rejected", "ghosted", "withdrawn"];
export const ACTIVE = ["applied", "oa", "interview"];
export const RESPONDED = ["oa", "interview", "offer", "rejected"];

export function emptyState(lang = "en") {
  return {
    format: FORMAT, version: 1,
    settings: { lang, employment: "intern", term: "Summer 2027", needsSponsorship: false, tracks: [],
                exclude: { companies: [], titles: [] }, followup: { nudge_days: 10, ghost_days: 28 } },
    resume: null, targets: {}, applications: [], versions: [], seen: [], saved: {}, known: {}, jd: {},
    setupDone: false, updated: "",
  };
}

/** Fill gaps in an older or partial state so the app never crashes on missing keys. */
export function migrate(s) {
  const base = emptyState(s?.settings?.lang);
  if (!s || s.format !== FORMAT) return base;
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}),
    exclude: { ...base.settings.exclude, ...(s.settings?.exclude || {}) },
    followup: { ...base.settings.followup, ...(s.settings?.followup || {}) } } };
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function save(state, storage = globalThis.localStorage) {
  state.updated = new Date().toISOString();
  try { storage && storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function parseBackup(text) {
  const s = JSON.parse(text);
  if (!s || s.format !== FORMAT) throw new Error("not a jobhunt backup file");
  return migrate(s);
}

/** Resume variants follow the person's job types (tracks): one version per track, major = its position. */
export function syncVariants(resume, tracks) {
  if (!resume) return resume;
  const old = resume.variants || {};
  const variants = {};
  tracks.forEach((t, i) => { variants[t.id] = { ...(old[t.id] || {}), title: t.label, major: i + 1 }; });
  if (!tracks.length) variants.main = { title: "Main", major: 1 };
  const valid = new Set(Object.keys(variants));
  const prune = (node) => { if (node && Array.isArray(node.variants)) { node.variants = node.variants.filter((v) => valid.has(v)); if (!node.variants.length) delete node.variants; } };
  for (const sec of ["education", "experience", "projects", "skills"])
    for (const item of resume[sec] || []) { prune(item); for (const b of item.bullets || []) prune(b); }
  return { ...resume, variants };
}

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function targetIdFor(job, existing = {}) {
  const base = slug(`${job.company} ${job.title}`.replace(/\b(intern(ship)?|summer|20\d\d|new grad(uate)?)\b/gi, "")) || "job";
  let id = base, n = 2;
  while (existing[id] && existing[id].job_id !== job.id) id = `${base}-${n++}`;
  return id;
}

// ---------------------------------------------------------------- versions (same idea as resume/versioning.py)

export async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Version for this text of this resume: same text → same number; changed text → next minor. Registers it. */
export async function assignVersion(state, resumeKey, major, text, today = new Date().toISOString().slice(0, 10)) {
  const hash = await sha(text);
  const rows = state.versions.filter((r) => r.resume === resumeKey && r.version.startsWith(`V${major}.`));
  const hit = rows.find((r) => r.hash === hash);
  if (hit) return hit.version;
  const minor = rows.reduce((m, r) => Math.max(m, Number(r.version.split(".")[1])), 0) + 1;
  const version = `V${major}.${minor}.0`;
  state.versions.push({ resume: resumeKey, version, hash, registered: today });
  return version;
}

// ---------------------------------------------------------------- follow-ups (tracker/followup.py)

const day = (s) => { const d = s ? new Date(`${s}T00:00:00Z`) : null; return d && !isNaN(d) ? d : null; };

export function followups(state, today = new Date()) {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const { nudge_days, ghost_days } = state.settings.followup;
  const todo = [], ghost = [];
  for (const a of state.applications) {
    if (!ACTIVE.includes(a.status)) continue;
    const next = day(a.next_action_date), last = day(a.last_update) || day(a.applied_date);
    if (next && next.getTime() <= t0) { todo.push({ app: a, kind: "due" }); continue; }
    if (a.status === "applied" && last) {
      const days = Math.round((t0 - last.getTime()) / 864e5);
      if (days >= ghost_days) ghost.push({ app: a, days });
      else if (days >= nudge_days && a.contact) todo.push({ app: a, kind: "nudge", days });
    }
  }
  return { todo, ghost };
}

export function stats(state) {
  const by = {};
  for (const a of state.applications) by[a.status] = (by[a.status] || 0) + 1;
  const sent = state.applications.filter((a) => !["todo", "withdrawn"].includes(a.status)).length;
  const replied = state.applications.filter((a) => RESPONDED.includes(a.status)).length;
  return { by, sent, replied, rate: sent ? replied / sent : null };
}
