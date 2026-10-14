// The job list (US kit): open internships and new-grad positions read from public sources, sorted into fields (software,
// health, finance, education, design, marketing, ... see fields.ts: every major, not just engineering), with what each
// employer has filed for H-1B shown next to it and a note when a posting disappears.
// Ported from the owner's own tracker (D:\job-hunt: jobtracker/fetch_jobs.py, boards.py, liveness.py), but:
//  - runs on this computer when the person asks (or, if switched on, when the page opens and the list is a day old);
//    nothing is sent anywhere, every request is a plain GET of a public address;
//  - the owner's own robotics / ML grouping is NOT the default: fields cover every major, and the person can add fields,
//    keywords or whole companies in jobhunt.yaml (`feed:`);
//  - sources: SimplifyJobs' Summer internships and New-Grad lists (technology-heavy), and company career pages on
//    Greenhouse, Lever, Ashby, SmartRecruiters, Workable and Workday (each company's own public posting API; the built-in
//    companies are spread over tech, finance, health, retail, consumer goods, energy, media). zapply is not used: its list
//    is CC BY-NC-SA.
//
// Closed postings: Simplify has an `active` flag; a company page that stops listing a posting means it closed (the company
// page counts only when it was fetched fine this time, and a page that suddenly loses more than half of its postings is
// treated as a broken answer, not as many closings).
//
// What is kept is written to .jobhunt/feed.json (the app's own bookkeeping, like update.json).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fieldLabel, fieldOf, fieldOrder } from "./fields.ts";
import { ensureIndex, lookup, type Fetcher, type H1BFacts } from "./h1b.ts";
import { feedServerFromEnv, viaTestServer } from "./testserver.ts";

export type Kind = "internship" | "newgrad";
export type Ats = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "workday";
export type BoardSpec = { name: string; ats: Ats; board: string };

export type Listing = {
  id: string;
  company: string;
  title: string;
  locations: string;
  posted: string; // YYYY-MM-DD ("" when the source has no date)
  link: string;
  kind: Kind;
  category: string; // the source's own category ("Software", "Hardware"...), "" for company pages; the field is worked out when asked
  degrees: string;
  sponsor: "yes" | "no" | ""; // what the posting says (Simplify's field); NOT what the employer has filed
  citizen: boolean; // the posting asks for US citizenship (or a clearance)
  source: string; // simplify-internships | simplify-newgrad | board:<ats>:<board>
  also: string[]; // ids of the same posting seen in another source
  firstSeen: string;
  baseline: boolean; // first time this source was read: not "new"
  closed: string; // date it was seen closed, "" while open
};

export type SourceStatus = { at: string; count: number; error?: string; etag?: string };

export type FeedCache = {
  version: 1;
  fetchedAt: string;
  sources: Record<string, SourceStatus>;
  listings: Listing[];
  h1b: { version: string; error?: string; byCompany: Record<string, H1BFacts | null> };
};

export const emptyCache = (): FeedCache => ({ version: 1, fetchedAt: "", sources: {}, listings: [], h1b: { version: "", byCompany: {} } });

// ---------------------------------------------------------------- settings (jobhunt.yaml `feed:`)

export type FeedConfig = {
  autoRefresh: boolean;
  fields: string[]; // fields to show; empty = every field
  kinds: Kind[];
  terms: string[]; // internship terms to keep ("Summer 2027")
  boards: BoardSpec[];
  keywords: Record<string, string[]>; // the person's own words by field id (a new id is a new field)
  hideCitizenship: boolean;
  h1b: boolean;
  internshipsUrl: string;
  newGradUrl: string;
};

const RAW = "https://raw.githubusercontent.com/SimplifyJobs";

/** The summer people are applying for: from September on it is next year's, before that this year's. */
export function defaultSummer(now: Date): number {
  return now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}
export const DEFAULT_BOARDS: BoardSpec[] = [
  ...(
    [
      ["Stripe", "stripe"], ["Airbnb", "airbnb"], ["Databricks", "databricks"], ["Figma", "figma"], ["Coinbase", "coinbase"],
      ["Lyft", "lyft"], ["Pinterest", "pinterest"], ["Robinhood", "robinhood"], ["Roblox", "roblox"], ["Affirm", "affirm"],
      ["Cloudflare", "cloudflare"], ["Datadog", "datadog"], ["MongoDB", "mongodb"], ["Samsara", "samsara"], ["Scale AI", "scaleai"],
      ["Anthropic", "anthropic"], ["Toast", "toast"], ["Twilio", "twilio"], ["Flexport", "flexport"], ["Nuro", "nuro"],
      ["Waymo", "waymo"], ["Vercel", "vercel"], ["Duolingo", "duolingo"], ["Reddit", "reddit"], ["Gusto", "gusto"],
      ["Elastic", "elastic"], ["Fivetran", "fivetran"], ["Block", "block"],
    ] as const
  ).map(([name, board]) => ({ name, ats: "greenhouse" as Ats, board })),
  ...(
    [
      ["OpenAI", "openai"], ["Notion", "notion"], ["Ramp", "ramp"], ["Perplexity", "perplexity"], ["Cohere", "cohere"],
      ["Harvey", "harvey"], ["Sierra", "sierra"], ["Replit", "replit"], ["Decagon", "decagon"], ["Hex", "hex"], ["Mercor", "mercor"],
    ] as const
  ).map(([name, board]) => ({ name, ats: "ashby" as Ats, board })),
  // Workday career sites (tenant.wdN/site): finance, health, retail, consumer goods, energy, media, consulting
  ...(
    [
      ["3M", "3m.wd1/Search"], ["Abbott", "abbott.wd5/abbottcareers"], ["Adobe", "adobe.wd5/external_experienced"], ["Bank of America", "ghr.wd1/lateral-us"],
      ["Capital One", "capitalone.wd12/Capital_One"], ["Chevron", "chevron.wd5/jobs"], ["Citi", "citi.wd5/2"], ["CVS Health", "cvshealth.wd1/cvs_health_careers"],
      ["Disney", "disney.wd5/disneycareer"], ["General Motors", "generalmotors.wd5/Careers_GM"], ["Home Depot", "homedepot.wd5/CareerDepot"],
      ["Humana", "humana.wd5/Humana_External_Career_Site"], ["Johnson & Johnson", "jj.wd5/JJ"], ["Lowe's", "lowes.wd5/LWS_External_CS"],
      ["Mastercard", "mastercard.wd1/CorporateCareers"], ["Medtronic", "medtronic.wd1/MedtronicCareers"], ["Nike", "nike.wd1/nke"],
      ["Pfizer", "pfizer.wd1/PfizerCareers"], ["Procter & Gamble", "pg.wd5/1000"], ["PNC", "pnc.wd5/External"], ["PwC", "pwc.wd3/Global_Experienced_Careers"],
      ["Salesforce", "salesforce.wd12/External_Career_Site"], ["State Street", "statestreet.wd1/Global"], ["Stryker", "stryker.wd1/StrykerCareers"],
      ["Target", "target.wd5/targetcareers"], ["Truist", "truist.wd1/Careers"], ["U.S. Bank", "usbank.wd1/US_Bank_Careers"], ["Wells Fargo", "wf.wd1/WellsFargoJobs"],
    ] as const
  ).map(([name, board]) => ({ name, ats: "workday" as Ats, board })),
];

const ATS = new Set<string>(["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "workday"]);

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** The `feed:` section of jobhunt.yaml with every missing or odd value replaced by its default. */
export function feedConfig(yaml: unknown, now: Date = new Date()): FeedConfig {
  const f: any = yaml && typeof yaml === "object" && (yaml as any).feed && typeof (yaml as any).feed === "object" ? (yaml as any).feed : {};
  // `tracks` is the old name of `fields`
  const fields = strList(f.fields ?? f.tracks).map((x) => x.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")).filter(Boolean);
  const kinds = strList(f.kinds).filter((k): k is Kind => k === "internship" || k === "newgrad");
  const skip = new Set(strList(f.skip_companies).map((s) => s.toLowerCase()));
  const extra: BoardSpec[] = [];
  for (const c of Array.isArray(f.companies) ? f.companies : []) {
    const name = String(c?.name ?? "").trim();
    const ats = String(c?.ats ?? "").trim().toLowerCase();
    const board = String(c?.board ?? "").trim();
    // a board token goes into a URL: letters, digits, dot, dash, underscore only (a Workday one is "tenant.wdN/site")
    const okBoard = ats === "workday" ? /^[A-Za-z0-9-]{1,60}\.wd\d{1,3}\/[A-Za-z0-9._-]{1,80}$/.test(board) : /^[A-Za-z0-9._-]{1,80}$/.test(board);
    if (name && ATS.has(ats) && okBoard) extra.push({ name, ats: ats as Ats, board });
  }
  const boards = [...DEFAULT_BOARDS, ...extra].filter((b) => !skip.has(b.name.toLowerCase()));
  const keywords: Record<string, string[]> = {};
  if (f.keywords && typeof f.keywords === "object" && !Array.isArray(f.keywords))
    for (const [k, v] of Object.entries(f.keywords)) {
      const id = k.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      if (id && strList(v).length) keywords[id] = strList(v);
    }
  const summer = defaultSummer(now);
  const url = (v: unknown, dflt: string) => (typeof v === "string" && /^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\//.test(v.trim()) ? v.trim() : dflt);
  return {
    autoRefresh: f.auto_refresh !== false,
    fields,
    kinds: kinds.length ? kinds : ["internship", "newgrad"],
    terms: strList(f.terms).length ? strList(f.terms) : [`Summer ${summer}`],
    boards,
    keywords,
    hideCitizenship: f.hide_citizenship_required !== false,
    h1b: f.h1b !== false,
    internshipsUrl: url(f.internships_url, `${RAW}/Summer${summer}-Internships/dev/.github/scripts/listings.json`),
    newGradUrl: url(f.new_grad_url, `${RAW}/New-Grad-Positions/dev/.github/scripts/listings.json`),
  };
}

// ---------------------------------------------------------------- locations, terms, degrees

const STATES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|" +
  "louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|" +
  "new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|" +
  "virginia|washington|west virginia|wisconsin|wyoming";
const ABBR =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_EXPLICIT = /united states/i;
const US_WORD = /(?<![A-Za-z])U\.?S\.?(?:A\.?)?(?![A-Za-z0-9])/; // US / USA / U.S. (capitals only: "us" is a word)
const US_STATE = new RegExp(`\\b(?:${STATES})\\b`, "i");
const US_ABBR = new RegExp(`(?:^|[\\s,(])(?:${ABBR})(?:$|[\\s,)])`);
const US_ABBR_COMMA = new RegExp(`,\\s*(?:${ABBR})\\s*$`, "i");
const US_CITY_CODE = /^(?:SF|NYC|LA|South SF|Bay Area|Remote)\b/i;
const NON_US = new RegExp(
  String.raw`\b(?:canada|united kingdom|uk|ireland|germany|india|china|japan|singapore|israel|taiwan|france|netherlands|poland|spain|mexico|australia|korea|` +
    String.raw`vietnam|malaysia|philippines|switzerland|sweden|finland|denmark|belgium|italy|brazil|costa rica|estonia|toronto|bc|london|munich|shanghai|` +
    String.raw`beijing|bangalore|bengaluru|hyderabad|tel aviv|hsinchu|taipei|tokyo|seoul|paris|amsterdam|berlin|frankfurt|stockholm|warsaw|ontario|` +
    String.raw`utrecht|oxford|serbia|belgrade|helsinki|zurich|tbilisi|europe|emea|apac|pune|montreal|quebec)\b|,\s*(?:ON|BC|QC|AB|MB|SK|NS|NB|NL|PE)$`,
  "i",
);

/** A place that is clearly somewhere else. */
export const hasForeignPlace = (...locs: unknown[]) => locs.some((l) => NON_US.test(String(l ?? "").replace(/-/g, " ").replace(/new mexico/gi, "new_state")));

/** Any one place that looks like the US counts (a posting often lists the US and other countries). A state name that is
 * also a country or city elsewhere ("Georgia", "London, KY") is the rare case; "New Mexico" is not "Mexico". */
export function isUSLocation(...locs: unknown[]): boolean {
  for (const raw of locs) {
    const s = String(raw ?? "").replace(/-/g, " ").trim();
    if (!s) continue;
    if (US_EXPLICIT.test(s) || US_WORD.test(s)) return true;
    const cleaned = s.replace(/new mexico/gi, "new_state");
    if (NON_US.test(cleaned)) continue;
    if (US_STATE.test(s) || US_ABBR.test(s) || US_ABBR_COMMA.test(s) || US_CITY_CODE.test(s)) return true;
  }
  return false;
}

const SEASON = /\b(fall|spring|winter|autumn|january|february|march|april|september|october|november|december)\b|part[- ]time|year[- ]round/i;

/** A title that names a year or season has to be one the person asked for ("Summer 2027"); one that names none passes. */
export function termOk(title: string, terms: string[]): boolean {
  const wantedYears = new Set(terms.flatMap((t) => t.match(/\b20\d\d\b/g) ?? []));
  const years = new Set(title.match(/\b20\d\d\b/g) ?? []);
  if (years.size && wantedYears.size && ![...years].some((y) => wantedYears.has(y))) return false;
  const other = SEASON.exec(title);
  if (other && !/summer/i.test(title)) {
    const word = other[1] ?? other[0];
    return terms.some((t) => t.toLowerCase().includes(word.toLowerCase()));
  }
  return true;
}

const LOWER_DEGREE = /\b(ms|msc|m\.s|masters?|master's|meng|bs|b\.s|bachelors?|bachelor's|undergrad\w*|mba)\b/;

/** A posting only for PhD students: Simplify's own degree list when it has one, else the title. */
export function phdOnly(title: string, degrees: string[] = []): boolean {
  if (degrees.length) return degrees.length === 1 && degrees[0] === "PhD";
  const t = title.toLowerCase().replace(/ph\.\s?d\.?/g, "phd");
  return t.includes("phd") && !LOWER_DEGREE.test(t);
}

const INTERN = /\bintern(?:s|ship|ships)?\b|\bco-?op\b|summer (?:analyst|associate)/i;
const NEWGRAD = /new\s*grad|university grad|recent grad|graduate (?:program|engineer|developer|analyst|associate|scientist|software|nurse|trainee)|early career|early talent|entry[- ]level|campus|\bclass of 20\d\d\b|rotational|analyst program|associate program|leadership development/i;

// ---------------------------------------------------------------- reading the sources

export type HttpResult = { status: number; body?: any; etag?: string };
export type Http = (url: string, opt?: { etag?: string; post?: unknown }) => Promise<HttpResult>;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export const defaultHttp: Http = async (url0, opt) => {
  const fake = feedServerFromEnv();
  const url = fake ? viaTestServer(fake, url0) : url0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, {
      method: opt?.post === undefined ? "GET" : "POST",
      headers: {
        "User-Agent": UA, Accept: "application/json", ...(opt?.etag ? { "If-None-Match": opt.etag } : {}),
        ...(opt?.post === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: opt?.post === undefined ? undefined : JSON.stringify(opt.post),
      signal: AbortSignal.timeout(90_000),
    });
    if ((r.status === 429 || r.status === 503) && attempt < 3) {
      await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      continue;
    }
    if (r.status === 304) return { status: 304 };
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { status: 200, body: await r.json(), etag: r.headers.get("etag") ?? undefined };
  }
  throw new Error("HTTP 429");
};

const date = (ts?: number | string | null): string => {
  try {
    if (typeof ts === "number" && ts > 0) return new Date(ts * 1000).toISOString().slice(0, 10);
    if (typeof ts === "string" && ts) return new Date(ts).toISOString().slice(0, 10);
  } catch {}
  return "";
};

const tidy = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const clip = (locs: string[]) => locs.slice(0, 3).join("; ") + (locs.length > 3 ? " +" : "");

type Draft = Omit<Listing, "firstSeen" | "baseline" | "closed" | "also">;

/** One Simplify list -> postings that are open, in the US, for the wanted terms, not PhD-only. */
export function readSimplify(raw: any, kind: Kind, source: string, cfg: FeedConfig): Draft[] {
  const out: Draft[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    if (!x || !x.active || x.is_visible === false || !x.id) continue;
    if (kind === "internship") {
      const terms: string[] = Array.isArray(x.terms) ? x.terms : [];
      if (!terms.some((t) => cfg.terms.includes(t))) continue;
    }
    const degrees: string[] = Array.isArray(x.degrees) ? x.degrees : [];
    const title = tidy(x.title);
    if (!title || phdOnly(title, degrees)) continue;
    // the new-grad list sometimes holds an internship: the title decides
    const k: Kind = kind === "newgrad" && INTERN.test(title) ? "internship" : kind;
    if (k === "internship" && kind === "newgrad" && !termOk(title, cfg.terms)) continue;
    const locs = (Array.isArray(x.locations) ? x.locations : []).map(tidy).filter((l: string) => isUSLocation(l));
    if (!locs.length) continue;
    out.push({
      id: String(x.id), company: tidy(x.company_name), title, locations: clip(locs), posted: date(x.date_posted),
      link: String(x.url || `https://simplify.jobs/p/${x.id}`), kind: k, category: String(x.category ?? ""),
      degrees: degrees.join("/"), sponsor: x.sponsorship === "Offers Sponsorship" ? "yes" : x.sponsorship === "Does Not Offer Sponsorship" ? "no" : "",
      citizen: x.sponsorship === "U.S. Citizenship is Required", source,
    });
  }
  return out;
}

type RawBoardRow = { id: string; title: string; locs: string[]; posted: string; link: string; intern?: boolean; us?: boolean };

async function boardRows(b: BoardSpec, http: Http): Promise<RawBoardRow[]> {
  const get = async (url: string) => (await http(url)).body;
  if (b.ats === "greenhouse") {
    const d = await get(`https://boards-api.greenhouse.io/v1/boards/${b.board}/jobs`);
    return d.jobs.map((j: any) => ({ id: String(j.id), title: tidy(j.title), locs: [tidy(j.location?.name)], posted: date(j.first_published || j.updated_at), link: j.absolute_url || "" }));
  }
  if (b.ats === "lever") {
    const d = await get(`https://api.lever.co/v0/postings/${b.board}?mode=json`);
    return d.map((j: any) => ({
      id: String(j.id), title: tidy(j.text), locs: [j.categories?.location, ...(j.categories?.allLocations ?? [])].map(tidy).filter(Boolean),
      posted: j.createdAt ? date(j.createdAt / 1000) : "", link: j.hostedUrl || "", intern: /intern/i.test(String(j.categories?.commitment ?? "")),
    }));
  }
  if (b.ats === "ashby") {
    const d = await get(`https://api.ashbyhq.com/posting-api/job-board/${b.board}`);
    return d.jobs
      .filter((j: any) => j.isListed !== false)
      .map((j: any) => {
        const places = [j, ...(j.secondaryLocations ?? [])];
        const countries = places.map((p: any) => p?.address?.postalAddress?.addressCountry).filter(Boolean);
        return {
          id: String(j.id), title: tidy(j.title), locs: places.map((p: any) => tidy(p?.location)).filter(Boolean), posted: date(j.publishedAt), link: j.jobUrl || "",
          intern: j.employmentType === "Intern",
          // the location text is often just a city; a country field, when there is one, decides
          us: countries.length ? countries.some((c: string) => /^(united states|us|usa)$/i.test(String(c).trim())) : undefined,
        };
      });
  }
  if (b.ats === "smartrecruiters") {
    const out: RawBoardRow[] = [];
    for (let offset = 0, page = 0; page < 30; page++, offset += 100) {
      const d = await get(`https://api.smartrecruiters.com/v1/companies/${b.board}/postings?limit=100&offset=${offset}`);
      for (const j of d.content ?? []) {
        const loc = j.location ?? {};
        out.push({
          id: String(j.id), title: tidy(j.name), locs: [tidy(loc.fullLocation)], posted: date(j.releasedDate),
          link: `https://jobs.smartrecruiters.com/${b.board}/${j.id}`, intern: j.typeOfEmployment?.id === "intern", us: loc.country === "us",
        });
      }
      if (offset + 100 >= (d.totalFound ?? 0)) return out;
    }
    throw new Error("more than 30 pages: the result would be cut off");
  }
  if (b.ats === "workday") return workdayRows(b, http);
  const d = await get(`https://apply.workable.com/api/v1/widget/accounts/${b.board}`);
  return d.jobs.map((j: any) => ({
    id: String(j.shortcode), title: tidy(j.title), locs: [[j.city, j.state, j.country].filter(Boolean).join(", ")], posted: date(j.published_on), link: j.url || "",
  }));
}

// Workday's search is a loose full-text one ("intern" also finds "International"), so a few words are searched, a few pages each,
// and the title decides afterwards.
const WORKDAY_SEARCHES: [string, number][] = [["internship", 6], ["new graduate", 4], ["university", 3]];
const POSTED = /posted (today|yesterday|(\d+)\+? days? ago)/i;

async function workdayRows(b: BoardSpec, http: Http): Promise<RawBoardRow[]> {
  const [host, site] = b.board.split("/");
  const tenant = host.split(".")[0];
  const url = `https://${host}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const out: RawBoardRow[] = [];
  const seen = new Set<string>();
  for (const [search, pages] of WORKDAY_SEARCHES) {
    for (let page = 0; page < pages; page++) {
      const d: any = (await http(url, { post: { appliedFacets: {}, limit: 20, offset: page * 20, searchText: search } })).body;
      const list: any[] = d?.jobPostings ?? [];
      for (const j of list) {
        const path = String(j.externalPath ?? "");
        const req = String((j.bulletFields ?? [])[0] ?? path.split("_").pop() ?? "");
        if (!req || seen.has(req)) continue;
        seen.add(req);
        const m = POSTED.exec(String(j.postedOn ?? ""));
        const days = m ? (/today/i.test(m[1]) ? 0 : /yesterday/i.test(m[1]) ? 1 : Number(m[2])) : null;
        const posted = days == null ? "" : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        // /job/<main place>/<title>_<requisition>: "Waltham-Office-POST" style codes are not places, so only a real one counts
        const place = path.split("/")[2] ?? "";
        out.push({
          id: `${tenant}-${req}`, title: tidy(j.title), locs: [tidy(j.locationsText), place.replace(/-/g, " ")].filter(Boolean), posted,
          link: `https://${host}.myworkdayjobs.com/en-US/${site}${path}`,
        });
      }
      if (list.length < 20 || (page + 1) * 20 >= (d?.total ?? 0)) break;
    }
  }
  return out;
}

/** A company page -> the entry-level US postings on it (interns for the wanted terms; new grads). */
export async function readBoard(b: BoardSpec, http: Http, cfg: FeedConfig): Promise<Draft[]> {
  const rows = await boardRows(b, http);
  const out: Draft[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const safe = r.id.replace(/[^A-Za-z0-9_.-]+/g, "-");
    const id = b.ats === "workday" ? `b-workday-${safe}` : `b-${b.ats}-${b.board}-${safe}`; // (a Workday board is "tenant.wdN/site": its rows carry the tenant)
    if (seen.has(id) || !r.title) continue;
    const intern = r.intern || INTERN.test(r.title);
    const grad = !intern && NEWGRAD.test(r.title);
    if (!intern && !grad) continue;
    // Company pages often say only "In-Office", "Hybrid" or a bare city. These companies are US-based: a posting is kept
    // unless a place on it is clearly abroad (better one foreign posting too many than a silently missing one).
    const us = r.us ?? (isUSLocation(...r.locs) || !hasForeignPlace(...r.locs));
    if (!us) continue;
    if (intern && !termOk(r.title, cfg.terms)) continue;
    if (phdOnly(r.title)) continue;
    seen.add(id);
    out.push({
      id, company: b.name, title: r.title, locations: clip(r.locs.filter(Boolean)), posted: r.posted, link: r.link, kind: intern ? "internship" : "newgrad",
      category: "", degrees: "", sponsor: "", citizen: /clearance|citizen|ts\/sci|\bsecret\b/i.test(r.title), source: `board:${b.ats}:${b.board}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- putting it together

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|llc|ltd|corp|co|the)\b/g, " ").replace(/\s+/g, " ").trim();
const normTitle = (s: string) => norm(s.replace(/\b(summer|20\d\d|intern|interns|internship|internships|co op|coop)\b/gi, " "));

export type RefreshOptions = {
  config: FeedConfig;
  http?: Http;
  get?: Fetcher; // the H-1B index download
  h1bDir?: string;
  now?: () => Date;
};

export type RefreshResult = { cache: FeedCache; added: number; closed: number; failed: string[] };

const KEEP_CLOSED_DAYS = 60;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Read every source, then work out what is new, what closed, and each employer's H-1B record. Each source succeeds or
 * fails alone: one broken company page never costs the rest, and its postings are carried over from last time. */
export async function refreshFeed(prev: FeedCache, o: RefreshOptions): Promise<RefreshResult> {
  const http = o.http ?? defaultHttp;
  const cfg = o.config;
  const now = (o.now ?? (() => new Date()))();
  const today = day(now);
  const sources: Record<string, SourceStatus> = {};
  const fresh = new Map<string, Draft[]>(); // source -> postings read this time
  const failed: string[] = [];
  const kinds = new Set(cfg.kinds);

  const jobs: { source: string; label: string; run: () => Promise<Draft[] | "same"> }[] = [];
  if (kinds.has("internship"))
    jobs.push({ source: "simplify-internships", label: "Simplify internships", run: () => simplifyJob("simplify-internships", cfg.internshipsUrl, "internship") });
  if (kinds.has("newgrad"))
    jobs.push({ source: "simplify-newgrad", label: "Simplify new grad", run: () => simplifyJob("simplify-newgrad", cfg.newGradUrl, "newgrad") });
  for (const b of cfg.boards) jobs.push({ source: `board:${b.ats}:${b.board}`, label: b.name, run: () => readBoard(b, http, cfg) });

  async function simplifyJob(source: string, url: string, kind: Kind): Promise<Draft[] | "same"> {
    const r = await http(url, { etag: prev.sources[source]?.etag });
    if (r.status === 304) return "same";
    sources[source] = { at: today, count: 0, etag: r.etag };
    return readSimplify(r.body, kind, source, cfg);
  }

  // a few at a time: the company pages are small, the two Simplify files are big
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        try {
          const got = await j.run();
          if (got === "same") sources[j.source] = { ...prev.sources[j.source], at: today };
          else {
            fresh.set(j.source, got);
            sources[j.source] = { ...sources[j.source], at: today, count: got.length };
          }
        } catch (e: any) {
          failed.push(`${j.label}: ${String(e?.message ?? e).slice(0, 120)}`);
          sources[j.source] = { ...prev.sources[j.source], at: prev.sources[j.source]?.at ?? "", count: prev.sources[j.source]?.count ?? 0, error: String(e?.message ?? e).slice(0, 160) };
        }
      }
    }),
  );

  // postings of every source: this time's where it was read, last time's where it was not (failed, or "not modified")
  const had = new Map(prev.listings.map((l) => [l.id, l]));
  const current: Listing[] = [];
  const closedNow: Listing[] = [];
  for (const j of jobs) {
    const old = prev.listings.filter((l) => l.source === j.source);
    const got = fresh.get(j.source);
    if (!got) {
      current.push(...old); // not read this time: keep what we had, open ones stay open
      continue;
    }
    // a source read for the first time only sets the baseline: nothing on it counts as "new" that day
    const firstRead = !prev.sources[j.source];
    const ids = new Set(got.map((g) => g.id));
    const openBefore = old.filter((l) => !l.closed);
    const vanished = openBefore.filter((l) => !ids.has(l.id));
    // a page that loses more than half of what it had is a broken answer, not that many closings
    const broken = openBefore.length >= 4 && vanished.length > openBefore.length / 2;
    if (broken) {
      failed.push(`${j.label}: ${vanished.length} of ${openBefore.length} postings vanished at once; kept as they were`);
      sources[j.source] = { ...sources[j.source], error: "too many postings vanished at once" };
      current.push(...old);
      continue;
    }
    for (const g of got) {
      const was = had.get(g.id);
      if (was) current.push({ ...was, ...g, also: was.also, firstSeen: was.firstSeen, baseline: was.baseline, closed: "" });
      else current.push({ ...g, also: [], firstSeen: today, baseline: firstRead, closed: "" });
    }
    for (const l of old) {
      if (ids.has(l.id)) continue;
      if (l.closed) {
        if ((now.getTime() - Date.parse(l.closed)) / 86400000 < KEEP_CLOSED_DAYS) current.push(l);
      } else {
        const c = { ...l, closed: today };
        closedNow.push(c);
        current.push(c);
      }
    }
  }
  // (postings of a source that is no longer in the settings were not carried over: they are gone)

  // the same posting in two places (Simplify and the company's page; the internship and new-grad lists): one row
  const byKey = new Map<string, Listing>();
  const merged: Listing[] = [];
  const order = (l: Listing) => (l.source.startsWith("board:") ? 0 : l.source === "simplify-internships" ? 1 : 2);
  const uniq = (xs: string[]) => [...new Set(xs)];
  for (const l of [...current].sort((x, y) => order(x) - order(y))) {
    const key = `${norm(l.company)}|${normTitle(l.title)}|${l.kind}`;
    const keep = byKey.get(key);
    if (!keep) {
      byKey.set(key, l);
      merged.push(l);
    } else if (keep.closed && !l.closed) {
      // the open copy is the one to show
      l.also = uniq([...l.also, keep.id, ...keep.also]);
      merged[merged.indexOf(keep)] = l;
      byKey.set(key, l);
    } else if (keep.id !== l.id) keep.also = uniq([...keep.also, l.id, ...l.also]);
  }
  const added = merged.filter((l) => !had.has(l.id) && !l.closed).length;

  // H-1B record of every employer on an open posting
  const h1b: FeedCache["h1b"] = { ...prev.h1b };
  if (cfg.h1b && o.h1bDir) {
    const names = [...new Set(merged.filter((l) => !l.closed).map((l) => l.company))];
    try {
      const { path, version } = await ensureIndex(o.h1bDir, o.get);
      h1b.byCompany = lookup(path, names);
      h1b.version = version;
      delete h1b.error;
    } catch (e: any) {
      h1b.error = String(e?.message ?? e).slice(0, 200);
    }
  }

  const cache: FeedCache = { version: 1, fetchedAt: now.toISOString(), sources, listings: merged, h1b };
  return { cache, added, closed: closedNow.length, failed };
}

// ---------------------------------------------------------------- storing and asking

export function readCache(path: string): FeedCache {
  try {
    const c = JSON.parse(readFileSync(path, "utf-8"));
    if (c && c.version === 1 && Array.isArray(c.listings)) return { ...emptyCache(), ...c };
  } catch {}
  return emptyCache();
}

export function writeCache(path: string, c: FeedCache): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(c));
  renameSync(tmp, path);
}

export type Query = {
  fields?: string[];
  kinds?: string[];
  q?: string;
  newOnly?: boolean;
  h1bRecent?: boolean; // filed H-1B LCAs in the last two years
  showCitizen?: boolean;
  limit?: number;
};

export type Row = Listing & { field: string; fieldShort: string; isNew: boolean; h1b: H1BFacts | null };

const NEW_DAYS = 3;

/** What the page lists, newest first. Closed postings and ones that ask for US citizenship are left out unless asked for. */
export function queryFeed(c: FeedCache, q: Query, cfg: FeedConfig, today: string, lang: "en" | "zh-TW" = "en") {
  const text = (q.q ?? "").toLowerCase().trim();
  const shown = q.fields?.length ? q.fields : cfg.fields;
  const fieldSet = shown.length ? new Set(shown) : null; // null: every field
  const kinds = new Set(q.kinds?.length ? q.kinds : cfg.kinds);
  const todayMs = Date.parse(today);
  const rows: Row[] = [];
  const counts: Record<string, number> = {};
  let closed = 0;
  let citizen = 0;
  for (const l of c.listings) {
    if (l.closed) {
      closed++;
      continue;
    }
    if (!kinds.has(l.kind)) continue;
    if (l.citizen && (cfg.hideCitizenship && !q.showCitizen)) {
      citizen++;
      continue;
    }
    if (text && !`${l.company} ${l.title} ${l.locations}`.toLowerCase().includes(text)) continue;
    const field = fieldOf(l.title, l.category, cfg.keywords);
    counts[field] = (counts[field] ?? 0) + 1;
    if (fieldSet && !fieldSet.has(field)) continue;
    const isNew = !l.baseline && (todayMs - Date.parse(l.firstSeen)) / 86400000 < NEW_DAYS;
    if (q.newOnly && !isNew) continue;
    const h1b = c.h1b.byCompany[l.company] ?? null;
    if (q.h1bRecent && !(h1b && h1b.filed > 0 && h1b.lastYear >= Number(today.slice(0, 4)) - 2)) continue;
    rows.push({ ...l, field, fieldShort: fieldLabel(field, lang, true), isNew, h1b });
  }
  rows.sort((a, b) => Number(b.isNew) - Number(a.isNew) || (b.posted || "").localeCompare(a.posted || "") || a.company.localeCompare(b.company));
  const limit = Math.min(Math.max(q.limit ?? 200, 1), 500);
  return {
    total: rows.length,
    rows: rows.slice(0, limit),
    counts,
    fields: fieldOrder([...Object.keys(counts), ...cfg.fields]).map((id) => ({ id, label: fieldLabel(id, lang), count: counts[id] ?? 0 })),
    closed,
    citizenHidden: citizen,
    newCount: rows.filter((r) => r.isNew).length,
  };
}

/** Postings that closed, by link and id, so the tracker can say "this one is closed" next to a job someone is tracking. */
export function closedLinks(c: FeedCache): Set<string> {
  const out = new Set<string>();
  for (const l of c.listings) if (l.closed) for (const k of [l.link, l.id, ...l.also]) if (k) out.add(k);
  return out;
}
