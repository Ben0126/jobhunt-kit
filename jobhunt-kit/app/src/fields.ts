// Which field a job is in. The job list is for people of every major, so the built-in list covers the whole range of work
// a new graduate can apply for (not just engineering), and a person can add their own fields or extend any of them
// with keywords in jobhunt.yaml (`feed: keywords:`). A field is just an id; a custom one is shown under its own name.
//
// The title decides, by the first rule that fits:
//   1. the person's own keywords,
//   2. hardware words ("embedded", "FPGA"), then software words ("software", "machine learning"): they win over a business
//      word in the same title ("Machine Learning Engineer, User Growth" is engineering),
//   3. one domain after another, most specific first (health, finance, people & legal, education & public service,
//      engineering, science, media, design & product, marketing & sales, operations, business),
//   4. the broad "engineer / data / IT" words, then the source's own category, else "other".
export type FieldDef = { id: string; en: string; zh: string; shortEn: string; shortZh: string; re: RegExp };

const re = (s: string) => new RegExp(s, "i");

const HARDWARE = re(
  String.raw`embedded|firmware|\bfpga\b|\basic\b|\brtl\b|verification|silicon|semiconductor|hardware|electrical|electronics?|circuit|analog|\brf\b|wireless|signal processing|\bdsp\b|\bpcb\b|power (?:electronics|systems?)|mechatronic|robot|controls? engineer|\bvlsi\b|physical design|test engineer|validation engineer|\bsoc\b|photonic|sensor|\bchip\b|device engineer`,
);
const SOFTWARE_STRONG = re(
  String.raw`software|developer|programmer|\bswe\b|machine learning|deep learning|\bml\b|\bai\b|\bllm|computer vision|\bnlp\b|data scien|data engineer|full.?stack|back.?end|front.?end|devops|\bsre\b|\bcloud\b|cyber|information security|\bios\b|android|compiler|algorithm`,
);

/** In the order the rules run (after hardware and software). */
export const FIELDS: FieldDef[] = [
  { id: "software", en: "Software & data", zh: "軟體與資料", shortEn: "Software", shortZh: "軟體", re: re(String.raw`\bit (?:intern|analyst|support|specialist)|information technology|help ?desk|systems? administrator|network (?:engineer|admin)|\bqa\b|quality assurance engineer|database`) },
  { id: "hardware", en: "Electrical & hardware", zh: "電機與硬體", shortEn: "Hardware", shortZh: "硬體", re: HARDWARE },
  {
    id: "health", en: "Healthcare & public health", zh: "醫療與公共衛生", shortEn: "Health", shortZh: "醫療",
    re: re(String.raw`nurs(?:e|ing)|clinic|patient|pharmac|medical|therap|dental|hospital|public health|epidemiolog|health ?care|physician|radiolog|dietit|nutrition|behavioral health|mental health|caregiver`),
  },
  {
    id: "finance", en: "Finance & accounting", zh: "財務與會計", shortEn: "Finance", shortZh: "財務",
    re: re(String.raw`financ|accounting|accountant|audit|\btax\b|invest|banking|\bbank\b|treasury|\brisk\b|actuar|trading|quantitative|\bquant\b|credit|equity|\bfunds?\b|wealth|underwrit|bookkeep|payroll|controller|fp&a|private client|capital markets`),
  },
  {
    id: "people", en: "People, HR & legal", zh: "人資與法務", shortEn: "People & legal", shortZh: "人資法務",
    re: re(String.raw`\bhr\b|human resources|recruit|talent|people (?:ops|operations|partner|team|analytics)|legal|paralegal|attorney|\blaw\b|compliance|employee (?:experience|relations)|labor relations|benefits`),
  },
  {
    id: "education", en: "Education, nonprofit & public service", zh: "教育、非營利與公共服務", shortEn: "Education & public", shortZh: "教育公共",
    re: re(String.raw`teach|educat|tutor|instruct|curriculum|\bschool\b|student (?:success|services|affairs)|youth|non-?profit|community|social work|public (?:policy|service|affairs)|government|civic|\bfellow|volunteer|\blibrar(?:y|ian)\b|archiv|policy analyst|advocacy|program coordinator|case manager|counsel(?:or|ing)`),
  },
  {
    id: "engineering", en: "Engineering (mechanical, civil, industrial…)", zh: "工程（機械、土木、工業…）", shortEn: "Engineering", shortZh: "工程",
    re: re(String.raw`mechanical|civil|structural|industrial engineer|manufacturing|chemical engineer|aerospace|materials engineer|process engineer|quality engineer|construction|geotechnical|environmental engineer|petroleum|\benergy\b|\bhvac\b|automotive|biomedical|nuclear|reliability engineer|field engineer|project engineer|facilities engineer|engineering (?:intern|co-?op|technician)`),
  },
  {
    id: "science", en: "Science & research", zh: "科學與研究", shortEn: "Science", shortZh: "科學",
    re: re(String.raw`scientist|laborator|\blab\b|biolog|chemi(?:st|stry)|physic|geolog|environmental|ecolog|genom|bioinformatic|neuroscience|materials scien|astronom|climate|field technician|research (?:assistant|associate|intern|technician)|\br&d\b|oncolog|\bdrug\b|biotech|assay|formulation|toxicolog|pharmacolog|\bresearch\b`),
  },
  {
    id: "media", en: "Media, arts & writing", zh: "媒體、藝術與寫作", shortEn: "Media & arts", shortZh: "媒體藝術",
    re: re(String.raw`editor|editorial|journalis|reporter|writer|producer|\bvideo\b|\bfilm\b|photograph|podcast|broadcast|museum|gallery|\bmusic\b|\baudio\b|curator|publishing|screenwrit|storytell`),
  },
  {
    id: "design", en: "Design & product", zh: "設計與產品", shortEn: "Design & product", shortZh: "設計產品",
    re: re(String.raw`product manag|product design|product owner|\bux\b|\bui\b|user experience|user research|designer|design (?:intern|co-?op)|graphic|creative|illustrat|animation|\bart\b|visual|game design|architect(?:ure|ural)|interior|fashion|merchandis|apm\b`),
  },
  {
    id: "marketing", en: "Marketing, sales & communications", zh: "行銷、業務與傳播", shortEn: "Marketing & sales", shortZh: "行銷業務",
    re: re(String.raw`marketing|brand|content|social media|communications?|\bpr\b|public relations|advertis|copywrit|\bseo\b|growth|\bsales\b|account (?:executive|manager|coordinator)|business development|\bsdr\b|\bbdr\b|partnership|customer success|community manager|campaign|events?\b|promotion|retail sales|sales associate`),
  },
  {
    id: "operations", en: "Operations, supply chain & customer service", zh: "營運、供應鏈與客服", shortEn: "Operations", shortZh: "營運",
    re: re(String.raw`operations|supply chain|logistics|procurement|purchasing|planner|\bplanning\b|warehouse|inventory|fulfillment|dispatch|facilit|project coordinator|administrative|office (?:assistant|intern|coordinator)|executive assistant|customer (?:service|support|care|experience)|\bretail\b|\bstore\b|hospitality|restaurant|food service|merchant|sourcing|transportation|distribution|delivery`),
  },
  {
    id: "business", en: "Business, strategy & consulting", zh: "商業、策略與顧問", shortEn: "Business", shortZh: "商業",
    re: re(String.raw`business|strategy|strategic|consult|management trainee|rotational|leadership development|general management|entrepreneur|corporate development|chief of staff|management program|executive program`),
  },
];

const BROAD_SOFTWARE = re(String.raw`engineer|\bdata\b|computer|\bit\b|technolog|digital|analytics|automation|research engineer|systems?`);
const GENERIC_ANALYST = re(String.raw`analyst|associate|specialist|coordinator|assistant|trainee`);

/** Simplify's own category when nothing in the title says more. */
const BY_CATEGORY: Record<string, string> = {
  Hardware: "hardware", "Hardware Engineering": "hardware", Software: "software", "Software Engineering": "software", "AI/ML/Data": "software",
  "Data Science, AI & Machine Learning": "software", Product: "design", "Product Management": "design", Quant: "finance", "Quantitative Finance": "finance",
};

export const OTHER: FieldDef = { id: "other", en: "General / other", zh: "一般／其他", shortEn: "Other", shortZh: "其他", re: re("$^") };

const wordsRe = (list: string[]): RegExp | null => {
  const parts = list.map((w) => w.trim()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return parts.length ? new RegExp(parts.join("|"), "i") : null;
};

/** `keywords`: the person's own, by field id (an id that is not built in is a new field). */
export function fieldOf(title: string, category: string, keywords: Record<string, string[]> = {}): string {
  for (const [field, words] of Object.entries(keywords)) {
    const r = wordsRe(words);
    if (r && r.test(title)) return field;
  }
  if (HARDWARE.test(title)) return "hardware";
  if (SOFTWARE_STRONG.test(title) || /\bIT\b/.test(title)) return "software"; // "IT Business Analyst": the capitals tell it from the word "it"
  for (const f of FIELDS) if (f.id !== "software" && f.id !== "hardware" && f.re.test(title)) return f.id;
  if (FIELDS[0].re.test(title) || BROAD_SOFTWARE.test(title)) return category === "Hardware" ? "hardware" : "software";
  if (BY_CATEGORY[category]) return BY_CATEGORY[category];
  if (GENERIC_ANALYST.test(title)) return "business";
  return "other";
}

/** How a field is shown: built-in ones in the folder's language, a custom one under the name the person gave it. */
export function fieldLabel(id: string, lang: "en" | "zh-TW", short = false): string {
  const f = id === "other" ? OTHER : FIELDS.find((x) => x.id === id);
  if (!f) return id;
  return lang === "en" ? (short ? f.shortEn : f.en) : short ? f.shortZh : f.zh;
}

/** Built-in ids first (in the list's order), then custom ones, "other" last. */
export function fieldOrder(ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const builtin = FIELDS.map((f) => f.id).filter((i) => set.has(i));
  const custom = [...set].filter((i) => !FIELDS.some((f) => f.id === i) && i !== "other").sort();
  return [...builtin, ...custom, ...(set.has("other") ? ["other"] : [])];
}
