// Job types (tracks), classification and filtering of the public feed — same semantics as jobhunt/jobs/classify.py.

/** Starting points people pick from; each becomes a track (and a resume version) they can edit. */
export const PRESETS = [
  { id: "swe", label: { en: "Software engineering", "zh-TW": "軟體工程" },
    titles: ["software", "developer", "\\bswe\\b", "back[- ]?end", "front[- ]?end", "full[- ]?stack", "\\bweb\\b", "mobile",
             "\\bios\\b", "android", "platform", "infrastructure", "devops", "site reliability", "\\bsre\\b", "cloud", "security engineer"] },
  { id: "data", label: { en: "Data / ML / AI", "zh-TW": "資料／ML／AI" },
    titles: ["data scien", "data engineer", "data analy", "machine learning", "\\bml\\b", "\\bai\\b", "deep learning",
             "computer vision", "\\bnlp\\b", "research scien", "applied scien", "analytics", "\\bllm\\b"] },
  { id: "robotics", label: { en: "Robotics / Embedded", "zh-TW": "機器人／嵌入式" },
    titles: ["robot", "autonom", "perception", "\\bslam\\b", "controls?\\b", "embedded", "firmware", "drone", "\\buav",
             "motion planning", "mechatron", "\\brtos\\b", "self-driving"] },
  { id: "hardware", label: { en: "Hardware / Electrical", "zh-TW": "硬體／電機" },
    titles: ["hardware", "electrical", "\\basic\\b", "\\bfpga\\b", "vlsi", "circuit", "\\brf\\b", "analog", "silicon",
             "design verification", "semiconductor", "power electronics", "test engineer"] },
  { id: "quant", label: { en: "Quant / Trading", "zh-TW": "量化／交易" },
    titles: ["quant", "trading", "trader", "quantitative"] },
  { id: "product", label: { en: "Product / Design", "zh-TW": "產品／設計" },
    titles: ["product manag", "product design", "\\bux\\b", "\\bui\\b", "user experience", "designer"] },
  { id: "business", label: { en: "Business / Analyst", "zh-TW": "商業／分析" },
    titles: ["business analy", "consult", "operations", "strategy", "finance", "marketing", "supply chain"] },
];

/** Exclusions offered to people who need visa sponsorship (editable in settings). */
export const SPONSOR_EXCLUDE_TITLES = ["clearance", "citizen", "ts/sci", "\\bsecret\\b", "us person", "u\\.s\\. person"];
export const DEFENSE_COMPANIES = ["raytheon", "\\brtx\\b", "lockheed", "northrop", "general dynamics", "l3harris", "anduril",
  "spacex", "blue origin", "palantir", "leidos", "booz allen", "\\bsaic\\b", "bae systems", "huntington ingalls", "shield ai"];

export function alternation(words) {
  const w = (words || []).map(String).filter((x) => x.trim());
  if (!w.length) return null;
  try { return new RegExp(w.map((x) => `(?:${x})`).join("|"), "i"); }
  catch { return new RegExp(w.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i"); }
}

export function trackFromPreset(p, lang = "en") {
  return { id: p.id, label: p.label[lang] || p.label.en, titles: [...p.titles], companies: [] };
}

export class Classifier {
  constructor(settings) {
    this.tracks = (settings.tracks || []).map((t) => ({ ...t, title: alternation(t.titles), company: alternation(t.companies) }));
    const ex = settings.exclude || {};
    this.badCompany = alternation(ex.companies);
    this.badTitle = alternation(ex.titles);
    this.dropCitizen = !!settings.needsSponsorship;
  }

  /** → track id, "excluded", or null (matches none of your job types). */
  classify(job) {
    if ((this.badCompany && this.badCompany.test(job.company)) || (this.badTitle && this.badTitle.test(job.title))
        || (this.dropCitizen && job.sponsor === "citizen")) return "excluded";
    for (const t of this.tracks)
      if ((t.title && t.title.test(job.title)) || (t.company && t.company.test(job.company))) return t.id;
    return null;
  }
}

/** Feed jobs → [{...job, track}] matching the person's tracks and filters, newest first. */
export function filterJobs(jobs, settings, { query = "", track = "", newOnly = false, seen = new Set(), sponsorOk = false, h1bOnly = false } = {}) {
  const c = new Classifier(settings);
  const q = query.trim().toLowerCase();
  const out = [];
  let excluded = 0;
  for (const j of jobs) {
    const t = c.classify(j);
    if (t === "excluded") { excluded++; continue; }
    if (!t || (track && t !== track)) continue;
    if (q && !`${j.company} ${j.title} ${j.locations || ""}`.toLowerCase().includes(q)) continue;
    if (newOnly && isSeen(j, seen)) continue;
    if (sponsorOk && j.sponsor === "no") continue;
    if (h1bOnly && !["strong", "moderate"].includes(j.h1b)) continue;
    out.push({ ...j, track: t });
  }
  out.sort((a, b) => String(b.posted || "").localeCompare(String(a.posted || "")) || Number(a.tier || 3) - Number(b.tier || 3));
  return { jobs: out, excluded };
}

export function jobIds(j) {
  return [j.id, ...String(j.also || "").split(";").filter(Boolean)];
}

export function isSeen(j, seen) {
  return jobIds(j).some((id) => seen.has(id));
}
