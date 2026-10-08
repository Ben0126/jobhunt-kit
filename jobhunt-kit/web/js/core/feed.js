// Load today's postings: the compact feed published next to this page (built daily by the jobhunt-kit repo),
// or — if it's missing — SimplifyJobs' full list straight from GitHub, reduced the same way in the browser.

const SIMPLIFY = {
  intern: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  fulltime: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
};
const FEED = { intern: "feed/intern.json", fulltime: "feed/newgrad.json" };
const SPONSOR = { "Offers Sponsorship": "yes", "Does Not Offer Sponsorship": "no", "U.S. Citizenship is Required": "citizen" };
const US = /, [A-Z]{2}$|United States|\bUSA?\b|^Remote|Remote in USA/;

/** Simplify listings → feed rows (active, US, the chosen term). */
export function fromSimplify(listings, { term = "" } = {}) {
  const out = [];
  for (const x of listings) {
    if (!x.active || x.is_visible === false) continue;
    if (term && (x.terms || []).length && !(x.terms || []).includes(term)) continue;
    const locs = (x.locations || []).filter((l) => US.test(l));
    if (!locs.length) continue;
    out.push({ id: x.id, company: x.company_name, title: x.title,
      locations: locs.slice(0, 3).join("; ") + (locs.length > 3 ? " +" : ""), degrees: (x.degrees || []).join("/"),
      posted: x.date_posted ? new Date(x.date_posted * 1000).toISOString().slice(0, 10) : "",
      link: `https://simplify.jobs/p/${x.id}`, source: "simplify", sponsor: SPONSOR[x.sponsorship] || "" });
  }
  return out;
}

export async function loadFeed(settings, fetcher = fetch) {
  const kind = settings.employment === "fulltime" ? "fulltime" : "intern";
  try {
    const r = await fetcher(FEED[kind], { cache: "no-cache" });
    if (r.ok) {
      const feed = await r.json();
      if (Array.isArray(feed.jobs) && feed.jobs.length) return feed;
    }
  } catch { /* fall through to Simplify */ }
  const r = await fetcher(SIMPLIFY[kind]);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const jobs = fromSimplify(await r.json(), { term: kind === "intern" ? settings.term : "" });
  return { generated: new Date().toISOString(), jobs, count: jobs.length, sources: ["simplify (direct)"] };
}
