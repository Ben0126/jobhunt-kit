// 職缺清單的伺服器介面：/api/feed、/api/feed/refresh、/api/h1b，和進度表上「這個職缺已下架」的標記。美國版才有。
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Http } from "../src/feed.ts";
import { Folder } from "../src/folder.ts";
import { POINTER } from "../src/h1b.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const SCAFFOLD_US = join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us");
const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

const sx = (o: Record<string, unknown>) => ({ active: true, is_visible: true, category: "Software", terms: ["Summer 2027"], degrees: [], sponsorship: "Other", locations: ["Austin, TX"], date_posted: 1_790_000_000, ...o });
let intern: any[] = [];
const INT_URL = "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";
const NG_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";

function calls() {
  const log: string[] = [];
  const http: Http = async (url) => {
    log.push(url);
    if (url === INT_URL) return { status: 200, body: intern };
    if (url === NG_URL) return { status: 200, body: [] };
    return { status: 200, body: { jobs: [] } }; // every company page: empty
  };
  return { log, http };
}

const gz = gzipSync(Buffer.from(JSON.stringify({ k: "x", n: "Acme Corp", fy: 2019, ly: 2026, filed: 40, cert: 38, pwd: 0, perm: 3, ns: 0 })));
const FILE = "https://github.com/msampath/h1b-sponsor-data/releases/download/index-latest/index-t.ndjson.gz";
const h1bGet = async (url: string) => {
  if (url === POINTER) return new TextEncoder().encode(JSON.stringify({ version: "t1", sha256: createHash("sha256").update(gz).digest("hex"), filename: "index-t.ndjson.gz" }));
  if (url === FILE) return new Uint8Array(gz);
  throw new Error("HTTP 404");
};

function usServe(yamlAppend = "") {
  const dir = mkdtempSync(join(tmpdir(), "jobhunt-feedapi-"));
  cpSync(SCAFFOLD_US, dir, { recursive: true });
  if (yamlAppend) writeFileSync(join(dir, "jobhunt.yaml"), readFileSync(join(dir, "jobhunt.yaml"), "utf-8") + "\n" + yamlAppend);
  const data = mkdtempSync(join(tmpdir(), "jobhunt-data-"));
  dirs.push(dir, data);
  const c = calls();
  const s: Running = startServer({ folder: new Folder(dir), dataDir: data, feedHttp: c.http, h1bGet });
  stops.push(s.stop);
  const base = `http://127.0.0.1:${s.port}`;
  const H = { "x-jobhunt-token": s.token, "content-type": "application/json" };
  const get = async (p: string) => (await fetch(`${base}${p}`, { headers: H })).json() as Promise<any>;
  const post = async (p: string, b: unknown = {}) => (await fetch(`${base}${p}`, { method: "POST", headers: H, body: JSON.stringify(b) })).json() as Promise<any>;
  return { dir, data, s, base, H, get, post, log: c.log };
}

test("更新前是空的（stale）；更新後有職缺、存在 .jobhunt/feed.json；再問一次不再連網", async () => {
  intern = [sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern", url: "https://acme.example/1" }), sx({ id: "a2", company_name: "Chipco", title: "FPGA Design Intern", category: "Hardware", url: "https://chipco.example/2" })];
  const { dir, get, post, log, base } = usServe();
  expect((await fetch(`${base}/api/feed`)).status).toBe(401);
  const empty = await get("/api/feed");
  expect(empty).toMatchObject({ total: 0, stale: true, autoRefresh: true, shownFields: [], fields: [] });
  const r = await post("/api/feed/refresh");
  expect(r.total).toBe(2);
  expect(r.stale).toBe(false);
  expect(r.rows.map((x: any) => x.company).sort()).toEqual(["Acme Corp", "Chipco"]);
  expect(r.rows.find((x: any) => x.company === "Acme Corp").h1b).toMatchObject({ filed: 40, greenCard: 3, lastYear: 2026 });
  expect(r.h1bVersion).toBe("t1");
  expect(existsSync(join(dir, ".jobhunt", "feed.json"))).toBe(true);
  const before = log.length;
  const again = await get("/api/feed?fields=hardware");
  expect(again.rows.map((x: any) => x.company)).toEqual(["Chipco"]);
  expect(log.length).toBe(before); // asking is local
});

test("更新同時按兩次只讀一輪", async () => {
  intern = [sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern" })];
  const { post, log } = usServe();
  await Promise.all([post("/api/feed/refresh"), post("/api/feed/refresh")]);
  expect(log.filter((u) => u === INT_URL)).toHaveLength(1);
});

test("jobhunt.yaml 的 feed: 設定有用：只看 ece、關掉 H-1B", async () => {
  intern = [sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern" }), sx({ id: "a2", company_name: "Chipco", title: "FPGA Design Intern", category: "Hardware" })];
  const { post } = usServe("feed:\n  fields: [hardware]\n  h1b: false\n  auto_refresh: false\n");
  const r = await post("/api/feed/refresh");
  expect(r.rows.map((x: any) => x.company)).toEqual(["Chipco"]);
  expect(r).toMatchObject({ autoRefresh: false, shownFields: ["hardware"], h1bVersion: "" });
  expect(r.fields.map((f: any) => f.id)).toEqual(["software", "hardware"]); // the chips still list what exists, the shown ones come from the settings
});

test("進度表上追蹤的職缺：官網下架後，那一列帶 _closed；重新出現就拿掉", async () => {
  intern = [sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern", url: "https://acme.example/1" }), sx({ id: "a3", company_name: "Keepco", title: "Software Engineer Intern", url: "https://keep.example/3" })];
  const { post, get } = usServe();
  await post("/api/feed/refresh");
  let b = await post("/api/applications/add", { company: "Acme Corp", role: "Software Engineer Intern", link: "https://acme.example/1", version: (await get("/api/applications")).version });
  expect(b.rows.every((r: any) => !r._closed)).toBe(true);
  intern = [intern[1]]; // Acme's posting is gone, one of two left (not more than half vanished... exactly half)
  await post("/api/feed/refresh");
  b = await get("/api/applications");
  expect(b.rows.find((r: any) => r.company === "Acme Corp")._closed).toBe(true);
  intern = [sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern", url: "https://acme.example/1" }), intern[0]];
  await post("/api/feed/refresh");
  expect((await get("/api/applications")).rows.find((r: any) => r.company === "Acme Corp")._closed).toBeFalsy();
});

test("/api/h1b：索引還沒下載就說沒有（不會在這裡下載）；下載後回事實；公司名稱太長或空的不查", async () => {
  intern = [sx({ id: "a1", company_name: "Acme Corp", title: "Software Engineer Intern" })];
  const { get, post, data } = usServe();
  expect(await get("/api/h1b?company=Acme%20Corp")).toEqual({ available: false, facts: null });
  await post("/api/feed/refresh");
  expect(existsSync(join(data, "h1b", "index.ndjson.gz"))).toBe(true);
  expect((await get("/api/h1b?company=Acme%20Inc")).facts).toMatchObject({ filed: 40, lastYear: 2026 });
  expect((await get("/api/h1b?company=Nobody%20Co")).facts).toBeNull();
  expect(await get("/api/h1b")).toEqual({ available: false, facts: null });
});

test("台灣版：職缺清單不存在（404）", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const s = startServer({ folder: new Folder(dir) });
  stops.push(s.stop);
  const r = await fetch(`http://127.0.0.1:${s.port}/api/feed`, { headers: { "x-jobhunt-token": s.token } });
  expect(r.status).toBe(404);
  expect((await fetch(`http://127.0.0.1:${s.port}/api/feed/refresh`, { method: "POST", headers: { "x-jobhunt-token": s.token, "content-type": "application/json" }, body: "{}" })).status).toBe(404);
});
