// 職缺清單（src/feed.ts）：讀 Simplify 和公司官網、分三類（cs／ece／business）、新職缺、下架、H-1B 事實、設定檔。
// 不碰網路：假的 http 和假的 H-1B 索引。
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  closedLinks, defaultSummer, emptyCache, feedConfig, isUSLocation, phdOnly, queryFeed, readBoard, readSimplify, refreshFeed, termOk,
  type BoardSpec, type FeedCache, type FeedConfig, type Http,
} from "../src/feed.ts";
import { fieldOf } from "../src/fields.ts";
import { POINTER } from "../src/h1b.ts";
import { cleanup } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "jobhunt-feed-"));
  dirs.push(d);
  return d;
};

const NOW0 = new Date("2026-10-13T12:00:00Z"); // from September on, "this summer" means next year's
const CFG = (over: Record<string, unknown> = {}): FeedConfig => feedConfig({ feed: { skip_companies: [], ...over } }, NOW0);
const NO_BOARDS = (over: Record<string, unknown> = {}) => {
  const c = CFG(over);
  return { ...c, boards: [] as BoardSpec[] };
};

const sx = (o: Record<string, unknown>) => ({
  active: true, is_visible: true, category: "Software", terms: ["Summer 2027"], degrees: [], sponsorship: "Other",
  locations: ["Austin, TX"], date_posted: 1_790_000_000, ...o,
});
const INTERN_LIST = [
  sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern", locations: ["SF"], url: "https://acme.example/jobs/1" }),
  sx({ id: "a2", company_name: "Chipco", title: "FPGA Design Intern", category: "Hardware", url: "https://chipco.example/2" }),
  sx({ id: "a3", company_name: "Bankco", title: "Business Analyst Intern", category: "Product", locations: ["New York, NY"], url: "https://bankco.example/3" }),
  sx({ id: "a4", company_name: "Gone Inc", title: "Software Engineer Intern", active: false }),
  sx({ id: "a5", company_name: "Old Inc", title: "Software Engineer Intern", terms: ["Summer 2026"] }),
  sx({ id: "a6", company_name: "Phd Inc", title: "Research Intern", degrees: ["PhD"] }),
  sx({ id: "a7", company_name: "Abroad Inc", title: "Software Engineer Intern", locations: ["London, UK"] }),
  sx({ id: "a8", company_name: "Defense Inc", title: "Software Engineer Intern", sponsorship: "U.S. Citizenship is Required", url: "https://defense.example/8" }),
  sx({ id: "a9", company_name: "Sponsorco", title: "Data Analyst Intern", sponsorship: "Offers Sponsorship", category: "AI/ML/Data" }),
];
const NEWGRAD_LIST = [
  sx({ id: "g1", company_name: "Acme Corp", title: "Software Engineer, New Grad", terms: undefined, url: "https://acme.example/jobs/g1" }),
  sx({ id: "g2", company_name: "Acme Corp", title: "Software Engineer Intern", terms: undefined, url: "https://acme.example/dup" }), // same posting as a1 in the other list
];

const ghRow = (id: number, title: string, loc: string) => ({ id, title, location: { name: loc }, absolute_url: `https://boards.greenhouse.io/x/jobs/${id}`, first_published: "2026-10-01T00:00:00Z" });
const BOARD: BoardSpec = { name: "Acme Corp", ats: "greenhouse", board: "acme" };
const GH_URL = "https://boards-api.greenhouse.io/v1/boards/acme/jobs";
const GH_ROWS = [
  ghRow(1, "Software Engineer Intern, Summer 2027", "Remote - USA"), // the same posting as Simplify's a1 (company + title)
  ghRow(2, "Software Engineer Intern, Fall 2026", "Austin, TX"), // wrong term
  ghRow(3, "Staff Software Engineer", "Austin, TX"), // not entry level
  ghRow(4, "University Graduate - Data Engineer", "Seattle, WA"), // new grad
  ghRow(5, "Software Engineer Intern, Summer 2027", "Dublin, Ireland"), // not US
  ghRow(6, "Marketing Intern", "Austin, TX"),
  ghRow(7, "Software Engineer Intern (2027)", "In-Office"), // no country on it: a US company's page, kept
  ghRow(8, "Software Engineer Intern (2027)", "Hybrid - Toronto, Canada"), // clearly abroad
];

type Pages = Record<string, unknown | Error | "304">;
function http(pages: Pages, log: string[] = []): Http {
  return async (url, opt) => {
    log.push(url);
    const v = pages[url];
    if (v instanceof Error) throw v;
    if (v === "304" || (opt?.etag && v && (v as any).__etag === opt.etag)) return { status: 304 };
    if (v === undefined) throw new Error("HTTP 404");
    return { status: 200, body: (v as any).__body ?? v, etag: (v as any).__etag };
  };
}
const INT_URL = "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";
const NG_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";
const PAGES = (): Pages => ({ [INT_URL]: INTERN_LIST, [NG_URL]: NEWGRAD_LIST, [GH_URL]: { jobs: GH_ROWS } });
const cfgWithBoard = () => ({ ...CFG(), boards: [BOARD] });
const NOW = (d: string) => () => new Date(`${d}T12:00:00Z`);

test("isUSLocation：州、城市縮寫、Remote 算美國；國外和「New Mexico 不是 Mexico」要分清楚", () => {
  for (const ok of ["SF", "NYC", "Boston, MA", "Remote in USA", "Remote - USA", "Austin, Texas", "Santa Clara, CA", "New Mexico", "United States", "US"]) expect(isUSLocation(ok), ok).toBe(true);
  for (const no of ["London, UK", "Toronto, ON", "Dublin, Ireland", "Bengaluru", "Taipei, Taiwan", "Berlin", "", "Mexico City, Mexico"]) expect(isUSLocation(no), no).toBe(false);
  expect(isUSLocation("Toronto, ON", "Austin, TX")).toBe(true); // any one US place is enough
});

test("termOk／phdOnly：寫了不要的年份或季節就不收；只收博士才擋，MS/PhD 照收", () => {
  const terms = ["Summer 2027"];
  expect(termOk("Software Engineer Intern, Summer 2027", terms)).toBe(true);
  expect(termOk("Software Engineer Intern", terms)).toBe(true);
  expect(termOk("Software Engineer Intern, Summer 2026", terms)).toBe(false);
  expect(termOk("Software Engineer Intern, Fall 2026", terms)).toBe(false);
  expect(termOk("Intern (Fall)", ["Summer 2027", "Fall 2027"])).toBe(true);
  expect(phdOnly("Research Intern", ["PhD"])).toBe(true);
  expect(phdOnly("Research Intern", ["Master's", "PhD"])).toBe(false);
  expect(phdOnly("Research Intern (PhD)")).toBe(true);
  expect(phdOnly("Research Intern (MS/PhD)")).toBe(false);
});

test("feedConfig：沒寫就是預設；壞的公司（不認得的 ATS、網址字元）被丟掉；網址只認 raw.githubusercontent.com；skip_companies 拿掉預設公司", () => {
  const d = feedConfig(null, NOW0);
  expect(d).toMatchObject({ autoRefresh: true, fields: [], kinds: ["internship", "newgrad"], terms: ["Summer 2027"], hideCitizenship: true, h1b: true });
  expect(d.boards.length).toBeGreaterThan(30);
  expect(d.boards.some((b) => /anduril|palantir/i.test(b.name))).toBe(false); // defense employers that want US citizens
  const c = feedConfig({
    feed: {
      fields: ["Business", "Health Care!"], keywords: { "Pre-Law": ["lsat", "paralegal"], software: ["quant dev"], empty: [] }, kinds: ["newgrad"], auto_refresh: false, h1b: false, hide_citizenship_required: false, terms: ["Fall 2027"],
      skip_companies: ["stripe"],
      companies: [
        { name: "Good Co", ats: "lever", board: "good-co" },
        { name: "Bad ATS", ats: "workday", board: "x" },
        { name: "Bad Token", ats: "greenhouse", board: "x/../y" },
        { name: "Good Day", ats: "workday", board: "acme.wd5/Careers" },
        { name: "Bad Day", ats: "workday", board: "acme/Careers" },
        { name: "Bad Day 2", ats: "workday", board: "acme.wd5/a/b" },
        { name: "", ats: "greenhouse", board: "z" },
      ],
      internships_url: "https://evil.example/x.json",
      new_grad_url: "https://raw.githubusercontent.com/Someone/Repo/main/x.json",
    },
  }, NOW0);
  expect(c.fields).toEqual(["business", "health-care-"]); // ids are lower case, letters and digits
  expect(c.keywords).toEqual({ "pre-law": ["lsat", "paralegal"], software: ["quant dev"] }); // a field with no words is dropped
  expect(c).toMatchObject({ kinds: ["newgrad"], autoRefresh: false, h1b: false, hideCitizenship: false, terms: ["Fall 2027"] });
  expect(c.boards.some((b) => b.name === "Stripe")).toBe(false);
  expect(c.boards.filter((b) => b.name === "Good Co" || b.name === "Good Day" || b.name.startsWith("Bad")).map((b) => b.name)).toEqual(["Good Co", "Good Day"]);
  expect(c.internshipsUrl).toBe(d.internshipsUrl);
  expect(c.newGradUrl).toBe("https://raw.githubusercontent.com/Someone/Repo/main/x.json");
});

test("readSimplify：只收開著、要的學期、不是只給博士、在美國的；沒有學期欄位的（新鮮人清單）照收", () => {
  const rows = readSimplify(INTERN_LIST, "internship", "simplify-internships", CFG());
  expect(rows.map((r) => r.id)).toEqual(["a1", "a2", "a3", "a8", "a9"]);
  expect(rows.find((r) => r.id === "a1")).toMatchObject({ company: "Acme Corp", locations: "SF", category: "Software", kind: "internship", link: "https://acme.example/jobs/1", posted: "2026-09-21" });
  expect(rows.find((r) => r.id === "a2")!.category).toBe("Hardware");
  expect(rows.find((r) => r.id === "a3")!.category).toBe("Product");
  expect(rows.find((r) => r.id === "a8")!.citizen).toBe(true);
  expect(rows.find((r) => r.id === "a9")!.sponsor).toBe("yes");
  expect(readSimplify(NEWGRAD_LIST, "newgrad", "simplify-newgrad", CFG()).map((r) => r.id)).toEqual(["g1", "g2"]);
});

test("readBoard：只收美國的實習（要的學期）和新鮮人職缺；資深職缺、國外、別的學期不收", async () => {
  const rows = await readBoard(BOARD, http(PAGES()), CFG());
  expect(rows.map((r) => [r.title, r.kind, fieldOf(r.title, r.category)])).toEqual([
    ["Software Engineer Intern, Summer 2027", "internship", "software"],
    ["University Graduate - Data Engineer", "newgrad", "software"],
    ["Marketing Intern", "internship", "marketing"],
    ["Software Engineer Intern (2027)", "internship", "software"],
  ]);
  expect(rows[0].id).toBe("b-greenhouse-acme-1");
  await expect(readBoard(BOARD, http({}), CFG())).rejects.toThrow("HTTP 404");
});

// ---- 一整輪更新
const H1B_FILES = (() => {
  const idx = Buffer.from([{ n: "Acme Corp", filed: 40, cert: 38, perm: 3, fy: 2019, ly: 2026 }, { n: "Bankco LLC", filed: 0, pwd: 2, ly: 2020 }].map((r) => JSON.stringify({ k: "x", fy: 2020, ly: 2024, cert: 0, pwd: 0, perm: 0, ns: 0, ...r })).join("\n"));
  const gz = gzipSync(idx);
  const sha = createHash("sha256").update(gz).digest("hex");
  const file = "https://github.com/msampath/h1b-sponsor-data/releases/download/index-latest/index-t.ndjson.gz";
  return { [POINTER]: new TextEncoder().encode(JSON.stringify({ version: "t1", sha256: sha, filename: "index-t.ndjson.gz" })), [file]: new Uint8Array(gz) } as Record<string, Uint8Array>;
})();
const getH1b = async (url: string) => {
  const v = H1B_FILES[url];
  if (!v) throw new Error("HTTP 404");
  return v;
};

async function refresh(prev: FeedCache, pages: Pages, today: string, cfg = cfgWithBoard(), h1bDir = tmp()) {
  return refreshFeed(prev, { config: cfg, http: http(pages), get: getH1b, h1bDir, now: NOW(today) });
}

test("更新：第一次只建立基準（沒有任何「新」）；同一個職缺在兩個地方只列一筆；H-1B 是事實", async () => {
  const r = await refresh(emptyCache(), PAGES(), "2026-10-13");
  const byTitle = (c: string, t: string) => r.cache.listings.find((l) => l.company === c && l.title === t);
  // Acme's "Software Engineer Intern": company page + Simplify internships + Simplify new grad list = one row, the other ids in `also`
  const acme = r.cache.listings.filter((l) => l.company === "Acme Corp" && /^Software Engineer Intern/.test(l.title));
  expect(acme).toHaveLength(1);
  expect(acme[0].source).toBe("board:greenhouse:acme");
  expect(acme[0].also.sort()).toEqual(["a1", "b-greenhouse-acme-7", "g2"]); // the same title posted for another place is folded in too
  expect(byTitle("Acme Corp", "Software Engineer, New Grad")!.kind).toBe("newgrad");
  expect(r.cache.listings.every((l) => l.baseline && !l.closed)).toBe(true);
  expect(r.failed).toEqual([]);
  expect(r.cache.sources["simplify-internships"]).toMatchObject({ count: 5, at: "2026-10-13" });
  expect(r.cache.h1b.version).toBe("t1");
  expect(r.cache.h1b.byCompany["Acme Corp"]).toEqual({ filed: 40, certified: 38, greenCard: 3, firstYear: 2019, lastYear: 2026, clientSitePct: 0 });
  expect(r.cache.h1b.byCompany["Bankco"]).toEqual({ filed: 0, certified: 0, greenCard: 2, firstYear: 2020, lastYear: 2020, clientSitePct: 0 });
  expect(r.cache.h1b.byCompany["Chipco"]).toBeNull();
  // asking for the list: nothing is new, citizenship-only is hidden, counts per field
  const q = queryFeed(r.cache, {}, cfgWithBoard(), "2026-10-13");
  expect(q.newCount).toBe(0);
  expect(q.rows.some((x) => x.company === "Defense Inc")).toBe(false);
  expect(q.citizenHidden).toBe(1);
  expect(q.counts.business).toBe(1);
  expect(q.counts.marketing).toBe(1);
  expect(q.fields.map((f) => f.id)).toEqual(["software", "hardware", "marketing", "business"]); // only fields that have jobs, in the list's order
  expect(q.fields.find((f) => f.id === "hardware")).toEqual({ id: "hardware", label: "Electrical & hardware", count: 1 });
  expect(queryFeed(r.cache, { showCitizen: true }, cfgWithBoard(), "2026-10-13").rows.some((x) => x.company === "Defense Inc")).toBe(true);
});

test("更新：第二次有新職缺 → 標「新」；消失的職缺 → 標下架（記日期、不再列）；又出現就恢復", async () => {
  const first = await refresh(emptyCache(), PAGES(), "2026-10-13");
  const pages = PAGES();
  pages[INT_URL] = [...INTERN_LIST.filter((x) => (x as any).id !== "a2"), sx({ id: "n1", company_name: "Newco", title: "Software Engineer Intern", url: "https://newco.example/1" })];
  const second = await refresh(first.cache, pages, "2026-10-14");
  expect(second.added).toBe(1);
  expect(second.closed).toBe(1);
  const closed = second.cache.listings.find((l) => l.id === "a2")!;
  expect(closed.closed).toBe("2026-10-14");
  const q = queryFeed(second.cache, {}, cfgWithBoard(), "2026-10-14");
  expect(q.rows.filter((r) => r.isNew).map((r) => r.company)).toEqual(["Newco"]);
  expect(q.rows.some((r) => r.id === "a2")).toBe(false);
  expect(q.closed).toBe(1);
  expect(closedLinks(second.cache).has("https://chipco.example/2")).toBe(true);
  // "new" lasts three days, then it is just a posting
  expect(queryFeed(second.cache, {}, cfgWithBoard(), "2026-10-18").newCount).toBe(0);
  expect(queryFeed(second.cache, { newOnly: true }, cfgWithBoard(), "2026-10-14").rows.map((r) => r.company)).toEqual(["Newco"]);
  // it is back
  const third = await refresh(second.cache, PAGES(), "2026-10-15");
  expect(third.cache.listings.find((l) => l.id === "a2")!.closed).toBe("");
});

test("更新：某一家官網讀不到 → 只有那一家失敗，上次的職缺照留；整頁突然少一大半 → 當成壞掉的回應，不當成下架", async () => {
  const first = await refresh(emptyCache(), { ...PAGES(), [GH_URL]: { jobs: Array.from({ length: 10 }, (_, i) => ghRow(100 + i, `Software Engineer Intern ${i}`, "Austin, TX")) } }, "2026-10-13");
  const ghCount = first.cache.listings.filter((l) => l.source === "board:greenhouse:acme").length;
  expect(ghCount).toBe(10);
  // down: carried over
  const down = await refresh(first.cache, { ...PAGES(), [GH_URL]: new Error("HTTP 503") }, "2026-10-14");
  expect(down.failed[0]).toContain("Acme Corp");
  expect(down.cache.listings.filter((l) => l.source === "board:greenhouse:acme" && !l.closed)).toHaveLength(10);
  expect(down.cache.sources["board:greenhouse:acme"].error).toContain("503");
  // answers with 1 of 10: not believed
  const odd = await refresh(first.cache, { ...PAGES(), [GH_URL]: { jobs: [ghRow(100, "Software Engineer Intern 0", "Austin, TX")] } }, "2026-10-14");
  expect(odd.failed[0]).toContain("vanished at once");
  expect(odd.cache.listings.filter((l) => l.source === "board:greenhouse:acme" && !l.closed)).toHaveLength(10);
  // a Simplify list that did not change (304) keeps its postings
  const same = await refresh(first.cache, { ...PAGES(), [INT_URL]: "304" }, "2026-10-14");
  expect(same.cache.listings.filter((l) => l.source === "simplify-internships" && !l.closed).length).toBe(first.cache.listings.filter((l) => l.source === "simplify-internships").length);
});

test("更新：H-1B 索引下載失敗不影響職缺清單，只記原因；設定關掉就完全不問", async () => {
  const r = await refreshFeed(emptyCache(), { config: cfgWithBoard(), http: http(PAGES()), get: async () => { throw new Error("offline"); }, h1bDir: tmp(), now: NOW("2026-10-13") });
  expect(r.cache.listings.length).toBeGreaterThan(5);
  expect(r.cache.h1b.error).toContain("Could not read");
  let asked = 0;
  await refreshFeed(emptyCache(), { config: { ...cfgWithBoard(), h1b: false }, http: http(PAGES()), get: async (u) => { asked++; return getH1b(u); }, h1bDir: tmp(), now: NOW("2026-10-13") });
  expect(asked).toBe(0);
});

test("queryFeed：分類、搜尋、只看新、近兩年有 H-1B 申請、筆數上限", async () => {
  const r = await refresh(emptyCache(), PAGES(), "2026-10-13");
  const cfg = cfgWithBoard();
  const q = (x: object) => queryFeed(r.cache, x, cfg, "2026-10-13");
  expect(q({ fields: ["hardware"] }).rows.map((x) => x.company)).toEqual(["Chipco"]);
  expect(q({ q: "bankco" }).rows).toHaveLength(1);
  expect(q({ q: "new york" }).rows.map((x) => x.company)).toEqual(["Bankco"]);
  expect(q({ h1bRecent: true }).rows.every((x) => x.company === "Acme Corp")).toBe(true); // Bankco's last filing was 2020
  expect(q({ kinds: ["newgrad"] }).rows.every((x) => x.kind === "newgrad")).toBe(true);
  expect(q({ limit: 2 }).rows).toHaveLength(2);
  expect(q({ limit: 2 }).total).toBeGreaterThan(2);
  const only = queryFeed(r.cache, {}, { ...cfg, fields: ["hardware"] }, "2026-10-13");
  expect(only.rows.map((x) => x.field)).toEqual(["hardware"]); // the settings' fields are the default view
  // the person's own words make a field of their own, shown under its name
  const custom = queryFeed(r.cache, {}, { ...cfg, keywords: { "my-picks": ["fpga"] } }, "2026-10-13");
  expect(custom.rows.find((x) => x.company === "Chipco")!.field).toBe("my-picks");
  expect(custom.fields.map((f) => f.id)).toContain("my-picks");
});

test("Workday：搜幾個字、每個翻幾頁，之後用職稱決定；地點只寫「N Locations」就看路徑裡的地點；國外的不收", async () => {
  const WD: BoardSpec = { name: "Big Bank", ats: "workday", board: "bigbank.wd5/Careers" };
  const url = "https://bigbank.wd5.myworkdayjobs.com/wday/cxs/bigbank/Careers/jobs";
  const post = (title: string, req: string, loc: string, path: string, posted = "Posted 3 Days Ago") => ({ title, externalPath: path, bulletFields: [req], locationsText: loc, postedOn: posted });
  const seen: string[] = [];
  const h: Http = async (u, opt) => {
    expect(u).toBe(url);
    const body: any = opt?.post;
    seen.push(`${body.searchText}@${body.offset}`);
    if (body.searchText === "internship" && body.offset === 0)
      return {
        status: 200,
        body: {
          total: 3,
          jobPostings: [
            post("2027 Summer Analyst, Wealth", "R1", "New York, NY", "/job/New-York/Summer-Analyst_R1"),
            post("International Payments Manager", "R2", "Dallas, TX", "/job/Dallas/Intl_R2"), // matches the search, not entry level
            post("Summer Internship - Markets", "R3", "2 Locations", "/job/London/Markets_R3"), // abroad
          ],
        },
      };
    if (body.searchText === "new graduate" && body.offset === 0)
      return { status: 200, body: { total: 1, jobPostings: [post("Graduate Program - Risk Analyst", "R4", "3 Locations", "/job/Charlotte-NC/Risk_R4", "Posted Today")] } };
    return { status: 200, body: { total: 0, jobPostings: [] } };
  };
  const rows = await readBoard(WD, h, CFG());
  expect(rows.map((r) => [r.id, r.title, r.kind, r.locations])).toEqual([
    ["b-workday-bigbank-R1", "2027 Summer Analyst, Wealth", "internship", "New York, NY; New York"],
    ["b-workday-bigbank-R4", "Graduate Program - Risk Analyst", "newgrad", "3 Locations; Charlotte NC"],
  ]);
  expect(rows[0].link).toBe("https://bigbank.wd5.myworkdayjobs.com/en-US/Careers/job/New-York/Summer-Analyst_R1");
  expect(rows[1].posted).toBe(new Date().toISOString().slice(0, 10));
  // one page per search when the answer is short; three searches
  expect(seen).toEqual(["internship@0", "new graduate@0", "university@0"]);
});

test("defaultSummer／学期：九月起「這個夏天」是明年；之前是今年；網址跟著年份", () => {
  expect(defaultSummer(new Date("2026-08-31T12:00:00Z"))).toBe(2026);
  expect(defaultSummer(new Date("2026-09-01T12:00:00Z"))).toBe(2027);
  expect(defaultSummer(new Date("2027-01-15T12:00:00Z"))).toBe(2027);
  const c = feedConfig(null, new Date("2027-10-01T12:00:00Z"));
  expect(c.terms).toEqual(["Summer 2028"]);
  expect(c.internshipsUrl).toContain("/Summer2028-Internships/");
  expect(feedConfig({ feed: { terms: ["Summer 2027"] } }, new Date("2027-10-01T12:00:00Z")).terms).toEqual(["Summer 2027"]);
});
