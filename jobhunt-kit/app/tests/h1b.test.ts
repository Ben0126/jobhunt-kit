// H-1B 紀錄（src/h1b.ts）：公司名稱正規化、索引下載和驗證、加總、只給事實。不碰網路（假的 fetch）。
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ensureIndex, factsOf, H1BError, loadRecords, lookup, normCompany, POINTER } from "../src/h1b.ts";
import { cleanup } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "jobhunt-h1b-"));
  dirs.push(d);
  return d;
};

const rec = (n: string, o: Record<string, number> = {}) => JSON.stringify({ k: "x", n, fy: 2021, ly: 2024, filed: 0, cert: 0, pwd: 0, perm: 0, ns: 0, ...o });
const INDEX = [
  rec("Amazon.com Services LLC", { filed: 100, cert: 90, perm: 10, ly: 2025 }),
  rec("Amazon.com, Inc.", { filed: 50, cert: 50, fy: 2019, ly: 2024 }),
  rec("Amazon Web Services Inc", { filed: 7 }), // another company's name: "amazon web" is not "amazon"
  rec("Cognizant Technology Solutions US Corp", { filed: 900, ns: 800, pwd: 5 }),
  rec("Cognizant Foods Ltd", { filed: 2 }),
  rec("Wing Aviation LLC", { filed: 9 }),
  rec("Wing Chun Kitchen", { filed: 1 }),
  rec("Acmecorp Industrial Machinery", { filed: 30, ly: 2025 }), // the name "acmecorp" has no entity of its own...
  rec("Acmecorp Pharma", { filed: 5 }),
  "not json",
  "",
].join("\n");
const bytes = gzipSync(Buffer.from(INDEX));
const sha = createHash("sha256").update(bytes).digest("hex");

test("normCompany：Inc／LLC／Services 這類字拿掉，一家公司的各種名稱併成同一個", () => {
  expect(normCompany("Amazon.com Services LLC")).toBe("amazon");
  expect(normCompany("Amazon.com, Inc.")).toBe("amazon");
  expect(normCompany("Johnson & Johnson")).toBe("johnson and johnson");
  expect(normCompany("Cognizant Technology Solutions U.S. Corporation")).toBe("cognizant");
  expect(normCompany("The Home Depot, Inc.")).toBe("home depot");
  expect(normCompany("Inc.")).toBe("inc"); // nothing left: keep the words
  expect(normCompany("")).toBe("");
});

test("loadRecords：同名加總；沒有同名時用開頭一樣、申請最多的那家（名稱至少 6 個字元）；太短的名稱只認完全同名", () => {
  const d = tmp();
  writeFileSync(join(d, "i.gz"), bytes);
  const r = loadRecords(join(d, "i.gz"), new Set(["amazon", "cognizant", "wing", "acmecorp", "nonexistent co"]));
  expect(r.get("amazon")).toEqual({ filed: 150, certified: 140, pwd: 0, perm: 10, first: 2019, last: 2025, secondary: 0 });
  // "Amazon Web Services" is "amazon web", a different name: not added to amazon
  expect(r.get("cognizant")!.filed).toBe(900); // "...Technology Solutions US Corp" is the same name once the filler words go
  expect(r.get("acmecorp")!.filed).toBe(30); // no exact entity: the one with the most filings that starts with it
  expect(r.has("wing")).toBe(false); // 4 characters: "Wing Aviation" and "Wing Chun Kitchen" are not guessed
  expect(r.has("nonexistent co")).toBe(false);
});

test("factsOf：只有件數和年份，沒有等級；派遣比例是百分比；沒有紀錄是 null", () => {
  expect(factsOf(null)).toBeNull();
  const f = factsOf({ filed: 900, certified: 880, pwd: 5, perm: 3, first: 2020, last: 2025, secondary: 800 })!;
  expect(f).toEqual({ filed: 900, certified: 880, greenCard: 8, firstYear: 2020, lastYear: 2025, clientSitePct: 89 });
  expect(Object.keys(f).some((k) => /tier|grade|score|likely|strong/i.test(k))).toBe(false);
  expect(factsOf({ filed: 0, certified: 0, pwd: 0, perm: 0, first: 0, last: 0, secondary: 0 })!.clientSitePct).toBe(0);
});

function fakeGet(files: Record<string, Uint8Array | Error>, log: string[] = []) {
  return async (url: string) => {
    log.push(url);
    const v = files[url];
    if (!v) throw new Error("HTTP 404");
    if (v instanceof Error) throw v;
    return v;
  };
}
const pointer = (over: Record<string, unknown> = {}) =>
  new TextEncoder().encode(JSON.stringify({ version: "2026Q3.1", sha256: sha, filename: "index-2026Q3.1.ndjson.gz", ...over }));
const FILE_URL = "https://github.com/msampath/h1b-sponsor-data/releases/download/index-latest/index-2026Q3.1.ndjson.gz";

test("ensureIndex：第一次下載並用 sha256 驗證；內容沒變就不再下載；公司名稱一個字都沒傳出去", async () => {
  const d = tmp();
  const log: string[] = [];
  const get = fakeGet({ [POINTER]: pointer(), [FILE_URL]: bytes }, log);
  const a = await ensureIndex(d, get);
  expect(a.version).toBe("2026Q3.1");
  expect(readFileSync(a.path)).toEqual(Buffer.from(bytes));
  expect(log).toEqual([POINTER, FILE_URL]);
  log.length = 0;
  await ensureIndex(d, get);
  expect(log).toEqual([POINTER]); // same checksum: no second download
  const facts = lookup(a.path, ["Amazon.com Inc"]);
  expect(facts["Amazon.com Inc"]!.filed).toBe(150);
  expect(log.every((u) => u.startsWith("https://github.com/msampath/"))).toBe(true);
});

test("ensureIndex：下載壞掉（sha256 對不上）不採用；有舊檔就繼續用舊檔；沒舊檔就說原因", async () => {
  const d = tmp();
  await expect(ensureIndex(d, fakeGet({ [POINTER]: pointer(), [FILE_URL]: gzipSync(Buffer.from("tampered")) }))).rejects.toThrow(H1BError);
  expect(existsSync(join(d, "index.ndjson.gz"))).toBe(false);
  await ensureIndex(d, fakeGet({ [POINTER]: pointer(), [FILE_URL]: bytes })); // good copy in place
  const offline = fakeGet({ [POINTER]: new Error("offline") });
  expect((await ensureIndex(d, offline)).version).toBe("2026Q3.1"); // old file is better than nothing
  // a new quarter whose download is corrupt keeps the old file too
  const newer = pointer({ sha256: "0".repeat(64), version: "2026Q4.1", filename: "index-2026Q4.ndjson.gz" });
  const files = { [POINTER]: newer, "https://github.com/msampath/h1b-sponsor-data/releases/download/index-latest/index-2026Q4.ndjson.gz": bytes };
  expect((await ensureIndex(d, fakeGet(files))).version).toBe("2026Q3.1");
  const empty = tmp();
  await expect(ensureIndex(empty, offline)).rejects.toThrow("Could not read the version");
});

test("ensureIndex：指標檔寫的檔名只認一般檔名（不能帶路徑或網址去別的地方下載）", async () => {
  const d = tmp();
  for (const filename of ["../evil.gz", "https://evil.example/x.gz", "a/b.gz", ""]) {
    await expect(ensureIndex(d, fakeGet({ [POINTER]: pointer({ filename }) }))).rejects.toThrow(H1BError);
  }
  expect(existsSync(join(d, "index.ndjson.gz"))).toBe(false);
});
