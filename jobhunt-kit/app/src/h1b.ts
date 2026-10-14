// H-1B records of an employer: how many H-1B LCAs it filed with the Labor Department, and whether it filed green card
// papers (PERM / prevailing wage). The posting's own "we sponsor / we don't" is often wrong or missing; this is what the
// employer actually filed.
//
// Data: github.com/msampath/h1b-sponsor-data (MIT code; the records are the Labor Department's public disclosure data),
// a ~8 MB index (ndjson.gz, one line per employer entity) refreshed quarterly. It is downloaded ONCE to the program's own
// data folder (checked against the sha256 the project publishes) and every lookup runs on this computer: no employer
// name is sent anywhere.
//
// FACTS ONLY. No grade, no "likely to sponsor". A record means a filing was found; no record means none was found in
// these files, which is not proof of anything (the US kit's rule: no legal advice, no predictions). Same name rules as
// the owner's own tracker (jobtracker/h1b.py, fetch_jobs.norm_company), because one employer files under many names.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { feedServerFromEnv, viaTestServer } from "./testserver.ts";

const REPO = "msampath/h1b-sponsor-data";
const TAG = "index-latest";
export const POINTER = `https://github.com/${REPO}/releases/download/${TAG}/index-latest.json`;
const PREFIX_MIN = 6; // a name that matches no one exactly is looked up as "starts with this", unless it is too short (Wing, Snap)

export type Fetcher = (url: string) => Promise<Uint8Array>;

export const defaultFetch: Fetcher = async (url0) => {
  // end-to-end tests of the built program point this at a stand-in server on this computer (see testserver.ts)
  const fake = feedServerFromEnv();
  const url = fake ? viaTestServer(fake, url0) : url0;
  const r = await fetch(url, { headers: { "User-Agent": "jobhunt-kit" }, signal: AbortSignal.timeout(120_000), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};

export class H1BError extends Error {}

/** What was filed (all counts are from the index; sums over every entity with the same normalised name). */
export type H1BRec = { filed: number; certified: number; pwd: number; perm: number; first: number; last: number; secondary: number };

const CO_STOP = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|com|company|companies|the|plc|group|holdings?|technologies|technology|solutions|services|systems|international)\b/g;

/** "Amazon.com Services LLC" and "Amazon.com, Inc." both become "amazon". */
export function normCompany(s: string): string {
  const lower = String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\bu s\b/g, "us");
  const words = lower.replace(CO_STOP, " ").split(/\s+/).filter(Boolean);
  while (words.length > 1 && ["and", "us", "usa"].includes(words[words.length - 1])) words.pop();
  return words.join(" ") || lower.split(/\s+/).filter(Boolean).join(" ");
}

type Meta = { version: string; sha256: string; filename: string };

/** The index file in `dir`, downloaded when there is none or the project published a new one. A failed download keeps the
 * old file; with no old file it throws. */
export async function ensureIndex(dir: string, get: Fetcher = defaultFetch): Promise<{ path: string; version: string }> {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "index.ndjson.gz");
  const metaPath = join(dir, "index.meta.json");
  let meta: Partial<Meta> = {};
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {}
  let pointer: any;
  try {
    pointer = JSON.parse(new TextDecoder().decode(await get(POINTER)));
    if (!pointer?.filename || !/^[0-9a-f]{64}$/.test(String(pointer.sha256))) throw new Error("bad pointer");
  } catch (e) {
    if (existsSync(path)) return { path, version: meta.version ?? "" };
    throw new H1BError(`Could not read the version of the H-1B index (${(e as Error).message}).`);
  }
  if (existsSync(path) && meta.sha256 === pointer.sha256) return { path, version: String(pointer.version ?? "") };
  let raw: Uint8Array;
  try {
    // the file name comes from the pointer: only a plain name is followed
    if (!/^[A-Za-z0-9._-]+$/.test(pointer.filename)) throw new Error("bad file name");
    raw = await get(`https://github.com/${REPO}/releases/download/${TAG}/${pointer.filename}`);
  } catch (e) {
    if (existsSync(path)) return { path, version: meta.version ?? "" };
    throw new H1BError(`Could not download the H-1B index (${(e as Error).message}).`);
  }
  if (createHash("sha256").update(raw).digest("hex") !== pointer.sha256) {
    if (existsSync(path)) return { path, version: meta.version ?? "" };
    throw new H1BError("The downloaded H-1B index does not match its checksum, so it was not used.");
  }
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, raw);
  renameSync(tmp, path);
  writeFileSync(metaPath, JSON.stringify({ version: String(pointer.version ?? ""), sha256: pointer.sha256, filename: pointer.filename }));
  return { path, version: String(pointer.version ?? "") };
}

const blank = (): H1BRec => ({ filed: 0, certified: 0, pwd: 0, perm: 0, first: 0, last: 0, secondary: 0 });

function add(a: H1BRec, r: any): void {
  a.filed += Number(r.filed) || 0;
  a.certified += Number(r.cert) || 0;
  a.pwd += Number(r.pwd) || 0;
  a.perm += Number(r.perm) || 0;
  a.secondary += Number(r.ns) || 0;
  const fy = Number(r.fy) || 0, ly = Number(r.ly) || 0;
  if (fy && (!a.first || fy < a.first)) a.first = fy;
  a.last = Math.max(a.last, ly);
}

/** index -> { normalised name: summed record } for the names in `wanted`. Entities with exactly that name are summed;
 * when there is none, the entity whose name starts with it and has the most filings stands in ("Cognizant" ->
 * "Cognizant Technology Solutions"), but only for names of PREFIX_MIN characters or more. */
export function loadRecords(path: string, wanted: Set<string>): Map<string, H1BRec> {
  const exact = new Map<string, H1BRec>();
  const prefix = new Map<string, Map<string, H1BRec>>();
  const text = gunzipSync(readFileSync(path)).toString("utf-8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    const key = normCompany(r.n ?? "");
    if (!key) continue;
    if (wanted.has(key)) {
      if (!exact.has(key)) exact.set(key, blank());
      add(exact.get(key)!, r);
    }
    const toks = key.split(" ");
    for (let n = 1; n < toks.length; n++) {
      const p = toks.slice(0, n).join(" ");
      if (wanted.has(p) && p.length >= PREFIX_MIN) {
        if (!prefix.has(p)) prefix.set(p, new Map());
        const byKey = prefix.get(p)!;
        if (!byKey.has(key)) byKey.set(key, blank());
        add(byKey.get(key)!, r);
      }
    }
  }
  const out = new Map(exact);
  for (const [p, cands] of prefix) {
    if (out.has(p)) continue;
    let best: H1BRec | null = null;
    for (const c of cands.values()) if (!best || c.filed + c.pwd + c.perm > best.filed + best.pwd + best.perm) best = c;
    if (best) out.set(p, best);
  }
  return out;
}

/** What to show: counts and years, no verdict. */
export type H1BFacts = {
  filed: number;
  certified: number;
  greenCard: number; // PERM + prevailing-wage filings
  firstYear: number;
  lastYear: number;
  clientSitePct: number; // share of H-1B filings placing the worker at a third-party client site, 0..100
};

export function factsOf(rec: H1BRec | null | undefined): H1BFacts | null {
  if (!rec) return null;
  return {
    filed: rec.filed,
    certified: rec.certified,
    greenCard: rec.pwd + rec.perm,
    firstYear: rec.first,
    lastYear: rec.last,
    clientSitePct: rec.filed ? Math.round((rec.secondary / rec.filed) * 100) : 0,
  };
}

/** Facts for each company name (null: no such employer in the index). */
export function lookup(path: string, companies: string[]): Record<string, H1BFacts | null> {
  const keys = new Map(companies.map((c) => [c, normCompany(c)]));
  const recs = loadRecords(path, new Set(keys.values()));
  return Object.fromEntries([...keys].map(([c, k]) => [c, factsOf(recs.get(k))]));
}
