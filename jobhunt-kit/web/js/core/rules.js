// The guardrails, identical to the Python engine (jobhunt/resume/fact_check.py, voice_check.py, tailor.py,
// model.py). tests/parity/*.json holds shared cases that both test suites run, so the two can't drift apart.

// ---------------------------------------------------------------- numbers (fact_check.py)

const DATE = new RegExp(
  String.raw`\b(?:19|20)\d\d\s?[–—-]\s?(?:(?:19|20)\d\d|\d\d)\b(?![-/.]\d)|` +
  String.raw`\b(19|20)\d\d[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?\b|` +
  String.raw`\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d\d\b|` +
  String.raw`\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d\d\b`, "gi");
const NUM = new RegExp(String.raw`(?<![A-Za-z0-9.])(\d+(?:,\d{3})*(?:\.\d+)?)(\s?(?:%|percent\b|x\b|×|-fold\b))?(?![A-Za-z0-9])`, "gi");
const YEAR = /^(19[9]\d|20[0-3]\d)$/;

export const PRINTED = ["summary", "skills_order", "bullet_overrides"];

/** Numbers in text, without dates and years: "40%", "3x", "5.4", "1000". */
export function numbers(text) {
  const out = new Set();
  const clean = String(text).replace(DATE, " ");
  for (const m of clean.matchAll(NUM)) {
    const raw = m[1];
    let num = raw.replace(/,/g, "");
    if (num.includes(".")) num = num.replace(/0+$/, "").replace(/\.$/, "") || "0";
    if (YEAR.test(raw) && !m[2]) continue;
    const unit = (m[2] || "").trim().toLowerCase();
    out.add(num + (unit === "%" || unit === "percent" ? "%" : ["x", "×", "-fold"].includes(unit) ? "x" : ""));
  }
  return out;
}

export function strings(node) {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(strings);
  if (node && typeof node === "object") return Object.values(node).flatMap(strings);
  return [];
}

export function facts(resume) {
  return numbers(strings(resume).join("\n"));
}

export function fields(target, names) {
  const out = [];
  for (const name of names) {
    const val = target[name];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) if (v) out.push([`${name}.${k}`, String(v)]);
    } else if (Array.isArray(val)) {
      for (const v of val) if (v) out.push([name, String(v)]);
    } else if (val) out.push([name, String(val)]);
  }
  return out;
}

/** {field: [numbers not found in resume]}; empty object = all backed. */
export function unsupported(target, resume, names = PRINTED) {
  const known = facts(resume);
  const out = {};
  for (const [name, text] of fields(target, names)) {
    const missing = [...numbers(text)].filter((n) => !known.has(n)).sort();
    if (missing.length) out[name] = [...new Set([...(out[name] || []), ...missing])];
  }
  return out;
}

// ---------------------------------------------------------------- plain voice (voice_check.py)

export const MAX_WORDS = 35;
export const AI_WORDS = [
  "architect(?:ed|ing)", "engineered", "leverag(?:e|ed|es|ing)", "utiliz(?:e|ed|es|ing)", "robust(?:ly|ness)?",
  "proven", "extensive(?:ly)?", "expertise", "rigorous(?:ly)?", "spearhead(?:ed|ing)?", "cutting-edge",
  "state-of-the-art", "seamless(?:ly)?", "synerg(?:y|ies|istic)", "passionate", "successfully",
  "meticulous(?:ly)?", "showcas(?:e|ed|ing)", "delv(?:e|ed|ing)", "innovative", "holistic",
  "streamlin(?:e|ed|ing)", "pivotal", "transformative", "empower(?:ed|ing)?", "orchestrat(?:e|ed|ing)",
];
const ENUM = /\(\d+\)/g;
const SENT = /(?<=[.!?])\s+(?=[A-Z(])/;

export function sentences(text) {
  return String(text).split(/\s+/).filter(Boolean).join(" ").split(SENT).filter(Boolean);
}

export class Voice {
  constructor(extraWords = [], allowWords = []) {
    const allow = new Set(allowWords.map((w) => w.toLowerCase()));
    const words = [...AI_WORDS, ...extraWords].filter((w) => !allow.has(w.toLowerCase()));
    this.ai = words.length ? new RegExp(`\\b(${words.join("|")})\\b`, "gi") : null;
  }

  /** Problem codes with details: [{code: "ai_word", word} | {code: "parens", n, sentence} | {code: "semicolon"}]. */
  problems(text, skills = false) {
    const out = this.ai ? [...String(text).matchAll(this.ai)].map((m) => ({ code: "ai_word", word: m[0] })) : [];
    if (skills) return out;
    for (const s of sentences(text)) {
      const n = (s.match(/\(/g) || []).length - (s.match(ENUM) || []).length;
      if (n > 1) out.push({ code: "parens", n, sentence: s.slice(0, 60) });
    }
    if (String(text).includes(";")) out.push({ code: "semicolon" });
    return out;
  }

  check(target, names = PRINTED) {
    const out = {};
    for (const [name, text] of fields(target, names)) {
      const found = this.problems(text, name.startsWith("skills_order"));
      if (found.length) (out[name] ||= []).push(...found);
    }
    return out;
  }
}

export function longSentences(text) {
  return sentences(text).filter((s) => s.split(" ").length > MAX_WORDS).map((s) => s.slice(0, 60));
}

// ---------------------------------------------------------------- resume model (model.py)

export const SECTIONS = ["summary", "education", "experience", "projects", "skills"];
export const BULLET_SECTIONS = ["experience", "projects"];
export const TITLES = { summary: "Summary", education: "Education", experience: "Experience", projects: "Projects", skills: "Skills" };

export class RuleError extends Error {}

export function inVariant(node, variant) {
  const vs = node && node.variants;
  return !vs || !vs.length || vs.includes(variant);
}

/** List of problems with a resume object (empty = valid). */
export function validateResume(data) {
  const errs = [];
  if (!data || typeof data !== "object") return ["resume must be an object"];
  if (!(data.basics && data.basics.name)) errs.push("basics.name is required");
  const variants = data.variants || {};
  if (!Object.keys(variants).length) errs.push("define at least one variant");
  const seen = new Set();
  for (const sec of BULLET_SECTIONS) {
    (data[sec] || []).forEach((item, i) => {
      for (const b of item.bullets || []) {
        if (!b || typeof b !== "object" || !b.text) { errs.push(`${sec}[${i}] has a bullet without text`); continue; }
        if (b.id && seen.has(b.id)) errs.push(`bullet id '${b.id}' is used twice`);
        if (b.id) seen.add(b.id);
        for (const v of b.variants || []) if (!(v in variants)) errs.push(`bullet '${b.id || b.text.slice(0, 30)}' lists unknown variant '${v}'`);
      }
      for (const v of item.variants || []) if (!(v in variants)) errs.push(`${sec}[${i}] lists unknown variant '${v}'`);
    });
  }
  return errs;
}

export function variantSpec(data, variant) {
  const variants = data.variants || {};
  if (!(variant in variants)) throw new RuleError(`unknown variant '${variant}' (have ${Object.keys(variants).join(", ")})`);
  const spec = { ...(variants[variant] || {}) };
  spec.title ??= variant;
  spec.one_page ??= true;
  spec.major ??= Object.keys(variants).indexOf(variant) + 1;
  return spec;
}

export function bulletIndex(data) {
  const out = {};
  for (const sec of BULLET_SECTIONS)
    for (const item of data[sec] || [])
      for (const b of item.bullets || []) if (b.id) out[b.id] = [sec, item, b];
  return out;
}

const squash = (s) => String(s).split(/\s+/).filter(Boolean).join(" ");

/** resume + variant → the document a renderer draws (same shape as model.resolve). */
export function resolve(data, variant) {
  const spec = variantSpec(data, variant);
  const order = spec.sections || data.sections || SECTIONS;
  const titles = { ...TITLES, ...(data.section_titles || {}) };
  const out = { basics: structuredClone(data.basics), variant, title: spec.title, one_page: !!spec.one_page, sections: [] };
  for (const kind of order) {
    const sec = { kind, title: titles[kind] || kind };
    if (kind === "summary") {
      const s = data.summary || {};
      const text = typeof s === "object" ? (s[variant] ?? s.default) : s;
      if (!text) continue;
      sec.text = squash(text);
    } else if (kind === "education") {
      sec.items = (data.education || []).filter((e) => inVariant(e, variant)).map((e) => structuredClone(e));
    } else if (BULLET_SECTIONS.includes(kind)) {
      sec.items = (data[kind] || []).filter((it) => inVariant(it, variant)).map((it) => {
        const { bullets, variants, ...rest } = it;
        return { ...structuredClone(rest), bullets: (bullets || []).filter((b) => inVariant(b, variant)).map((b) => squash(b.text)) };
      });
    } else if (kind === "skills") {
      sec.lines = (data.skills || []).filter((l) => inVariant(l, variant)).map((l) => ({ label: l.label || "", items: [...(l.items || [])] }));
    }
    if ((sec.items && !sec.items.length) || (sec.lines && !sec.lines.length)) continue;
    out.sections.push(sec);
  }
  return out;
}

// ---------------------------------------------------------------- targets (tailor.py)

/** A copy of the resume with this target's choices applied. Throws RuleError. */
export function tailor(data, target) {
  const tid = target.id, variant = target.base_variant;
  if (!variant) throw new RuleError(`${tid}: base_variant is required`);
  variantSpec(data, variant);
  data = structuredClone(data);
  const index = bulletIndex(data);
  const order = Object.values(target.bullet_order || {}).flatMap((ids) => ids || []);
  const overrides = target.bullet_overrides || {};
  for (const bid of [...order, ...Object.keys(overrides)])
    if (!(bid in index)) throw new RuleError(`${tid}: unknown bullet id '${bid}' (known: ${Object.keys(index).sort().join(", ")})`);
  for (const bid of order) {
    const [, item, b] = index[bid];
    if (!(inVariant(item, variant) && inVariant(b, variant))) throw new RuleError(`${tid}: bullet '${bid}' is not in the '${variant}' variant`);
  }
  if (new Set(order).size !== order.length) throw new RuleError(`${tid}: a bullet id is listed twice in bullet_order`);
  for (const [bid, text] of Object.entries(overrides)) index[bid][2].text = squash(text);
  if (target.summary) {
    const s = data.summary;
    data.summary = { ...(s && typeof s === "object" ? s : { default: s }), [variant]: squash(target.summary) };
  }
  const listed = new Map(), projectOrder = [];
  for (const bid of order) {
    const [sec, item, b] = index[bid];
    if (!listed.has(item)) { listed.set(item, []); if (sec === "projects") projectOrder.push(item); }
    listed.get(item).push(b);
  }
  for (const item of data.experience || []) if (listed.has(item)) item.bullets = listed.get(item);
  if (projectOrder.length) { for (const item of projectOrder) item.bullets = listed.get(item); data.projects = projectOrder; }
  if (target.skills_order && target.skills_order.length) {
    data.skills = target.skills_order.map((line) => {
      const i = String(line).indexOf(":");
      const label = i < 0 ? "" : String(line).slice(0, i).trim(), items = i < 0 ? "" : String(line).slice(i + 1).trim();
      if (!label || !items) throw new RuleError(`${tid}: skills_order line needs 'Label: items': ${JSON.stringify(line)}`);
      return { label, items: [items.replace(/\.$/, "")] };
    });
  }
  return data;
}

/** Every reason a target can't be built — what `jobhunt check` / `build` would fail on. */
export function checkTarget(resume, target, voice = new Voice()) {
  const errs = [];
  if (!target || typeof target !== "object") return [{ code: "shape" }];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(target.id || ""))) errs.push({ code: "id", id: target.id });
  try { tailor(resume, target); } catch (e) { if (e instanceof RuleError) errs.push({ code: "tailor", message: e.message }); else throw e; }
  const missing = unsupported(target, resume);
  for (const [field, nums] of Object.entries(missing)) errs.push({ code: "numbers", field, numbers: nums });
  for (const [field, probs] of Object.entries(voice.check(target))) errs.push({ code: "voice", field, problems: probs });
  for (const key of ["gaps", "confirm"]) if (target[key] != null && !Array.isArray(target[key])) errs.push({ code: "list", field: key });
  return errs;
}

/** Bullet ids available in each variant (what a tailoring prompt may choose from). */
export function bulletMenu(data) {
  const index = bulletIndex(data), out = {};
  for (const v of Object.keys(data.variants || {}))
    out[v] = Object.entries(index).filter(([, [, item, b]]) => inVariant(item, v) && inVariant(b, v)).map(([id]) => id);
  return out;
}

/** Plain text of a resolved document, in reading order (what an ATS reads; hashed for version numbers). */
export function plainText(doc) {
  const b = doc.basics || {};
  const lines = [b.name, [b.location, b.phone, b.email, ...(b.links || []).map((l) => l.label || l.url)].filter(Boolean).join(" · ")];
  for (const s of doc.sections) {
    lines.push("", s.title.toUpperCase());
    if (s.kind === "summary") lines.push(s.text);
    for (const it of s.items || []) {
      const head = [it.school || it.org || it.name, it.role || it.degree].filter(Boolean).join(" — ");
      lines.push([head, it.location, it.dates].filter(Boolean).join(" | "));
      for (const d of it.details || []) lines.push(`• ${d}`);
      for (const t of it.bullets || []) lines.push(`• ${t}`);
    }
    for (const l of s.lines || []) lines.push(`${l.label}: ${l.items.join(", ")}`);
  }
  return lines.join("\n");
}
