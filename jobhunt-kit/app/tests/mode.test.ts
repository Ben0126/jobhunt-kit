// 模式：只找美國／只找台灣／兩邊都找（me/mode.yaml），和介面語言（jobhunt.yaml 的 language 一行）。
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Folder } from "../src/folder.ts";
import { readMarket } from "../src/market.ts";
import { cleanMarkets, leadMarket, readMode, readModeSync, withLanguage, writeMode } from "../src/mode.ts";
import { startServer } from "../src/server.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

/** The one-for-all kit's folder: jobhunt.yaml has no `market:` line (the start screen decides). */
function newKit(language = "en"): string {
  const d = copyFixture();
  dirs.push(d);
  const p = join(d, "jobhunt.yaml");
  writeFileSync(p, readFileSync(p, "utf-8").replace(/^market:.*\n/m, "").replace(/^language: \S+/m, `language: ${language}`));
  return d;
}

test("cleanMarkets／leadMarket：只認 us、tw，大小寫和重複不管，順序固定；選了美國就以美國為主", () => {
  expect(cleanMarkets(["tw", "US", "nope", "us", " tw "])).toEqual(["us", "tw"]);
  expect(cleanMarkets("us")).toEqual([]);
  expect(cleanMarkets(null)).toEqual([]);
  expect(leadMarket(["us", "tw"])).toBe("us");
  expect(leadMarket(["tw"])).toBe("tw");
});

test("readMode：有 me/mode.yaml 就照它；舊資料夾照 jobhunt.yaml 的 market；都沒有就是還沒選", async () => {
  const legacy = copyFixture();
  dirs.push(legacy);
  expect(await readMode(new Folder(legacy))).toEqual({ markets: ["tw"], set: true, source: "legacy" });
  const d = newKit();
  const f = new Folder(d);
  expect(await readMode(f)).toEqual({ markets: [], set: false, source: "none" });
  await writeMode(f, ["tw", "us"]);
  expect(readFileSync(join(d, "me", "mode.yaml"), "utf-8")).toContain("markets: [us, tw]");
  expect(await readMode(f)).toEqual({ markets: ["us", "tw"], set: true, source: "mode" });
  expect(readModeSync(d)).toEqual({ markets: ["us", "tw"], set: true, source: "mode" });
  // a broken or empty file is "not chosen yet", never a crash
  writeFileSync(join(d, "me", "mode.yaml"), "markets: [nope\n");
  expect((await readMode(f)).set).toBe(false);
  writeFileSync(join(d, "me", "mode.yaml"), "markets: []\n");
  expect((await readMode(f)).set).toBe(false);
});

test("readMarket：jobhunt.yaml 沒寫 market 時照模式（選了美國就是美國、Letter）；有寫就照 jobhunt.yaml", async () => {
  const d = newKit();
  const f = new Folder(d);
  expect((await readMarket(f)).market).toBe("tw"); // nothing chosen yet: the old default
  await writeMode(f, ["us"]);
  expect(await readMarket(f)).toMatchObject({ market: "us", language: "en" });
  await writeMode(f, ["us", "tw"]);
  expect((await readMarket(f)).market).toBe("us");
  await writeMode(f, ["tw"]);
  expect((await readMarket(f)).market).toBe("tw");
  // an older folder that names its market keeps it, whatever mode.yaml says
  const legacy = copyFixture();
  dirs.push(legacy);
  await writeMode(new Folder(legacy), ["us"]);
  expect((await readMarket(new Folder(legacy))).market).toBe("tw");
});

test("withLanguage：只換 language 那一行，註解和其他行一個字都不動；沒有那一行就加在最後；換行格式照原檔", () => {
  const src = "# settings\nlanguage: zh-TW        # 介面語言\nmarket: tw\n";
  expect(withLanguage(src, "en")).toBe("# settings\nlanguage: en        # 介面語言\nmarket: tw\n");
  expect(withLanguage("a: 1\n", "zh-TW")).toBe("a: 1\nlanguage: zh-TW\n");
  expect(withLanguage("a: 1", "en")).toBe("a: 1\nlanguage: en\n");
  expect(withLanguage("language: en\r\nb: 2\r\n", "zh-TW")).toBe("language: zh-TW\r\nb: 2\r\n");
  expect(withLanguage('language: "en" # x\n', "zh-TW")).toBe("language: zh-TW # x\n");
});

test("/api/info 和 /api/mode：開始畫面選了模式和語言就存起來；亂寫的拒絕；要通行碼", async () => {
  const d = newKit();
  const s = startServer({ folder: new Folder(d) });
  stops.push(s.stop);
  const base = `http://127.0.0.1:${s.port}`;
  const H = { "x-jobhunt-token": s.token, "content-type": "application/json" };
  const post = (b: unknown) => fetch(`${base}/api/mode`, { method: "POST", headers: H, body: JSON.stringify(b) });
  expect(await (await fetch(`${base}/api/info`, { headers: H })).json()).toMatchObject({ modeSet: false, markets: [], language: "en" });
  expect((await fetch(`${base}/api/mode`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
  expect((await post({ markets: ["mars"] })).status).toBe(400);
  expect((await post({ language: "fr" })).status).toBe(400);
  expect(existsSync(join(d, "me", "mode.yaml"))).toBe(false);
  const before = readFileSync(join(d, "jobhunt.yaml"), "utf-8");
  const r: any = await (await post({ markets: ["us", "tw"], language: "zh-TW" })).json();
  expect(r).toMatchObject({ markets: ["us", "tw"], modeSet: true, language: "zh-TW", market: "us" });
  const after = readFileSync(join(d, "jobhunt.yaml"), "utf-8");
  // only the language line changed
  expect(after.split("\n").filter((l, i) => l !== before.split("\n")[i])).toEqual(["language: zh-TW        # 介面和進度表狀態用繁體中文"]); // its comment stays
  expect(await (await fetch(`${base}/api/info`, { headers: H })).json()).toMatchObject({ modeSet: true, markets: ["us", "tw"] });
  // the page itself now comes in Chinese
  expect(await (await fetch(`${base}/`)).text()).toContain('lang="zh-Hant-TW"');
  // the job list exists once the US is in
  expect((await fetch(`${base}/api/feed`, { headers: H })).status).toBe(200);
  await post({ markets: ["tw"] });
  expect((await fetch(`${base}/api/feed`, { headers: H })).status).toBe(404);
});
