// market.ts: which kit a folder is for, read from jobhunt.yaml (missing or unknown = Taiwan).
import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Folder } from "../src/folder.ts";
import { marketFromConfig, readMarket, TW_DEFAULTS } from "../src/market.ts";
import { cleanup, emptyTemp } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

function folderWith(yaml: string | null): Folder {
  const dir = emptyTemp();
  dirs.push(dir);
  writeFileSync(join(dir, "AGENTS.md"), "# test\n");
  if (yaml != null) writeFileSync(join(dir, "jobhunt.yaml"), yaml);
  return new Folder(dir);
}

test("marketFromConfig：tw、us、沒寫、不認得的值（不認得就當台灣）", () => {
  expect(marketFromConfig({ market: "tw", language: "zh-TW", paper: "a4" })).toEqual(TW_DEFAULTS);
  expect(marketFromConfig({ market: "us", language: "en", paper: "letter" })).toEqual({ market: "us", language: "en", paper: "letter" });
  expect(marketFromConfig({ market: "us" })).toEqual({ market: "us", language: "en", paper: "letter" }); // us defaults
  expect(marketFromConfig({ market: " US " }).market).toBe("us");
  for (const bad of [{}, null, undefined, "us", 5, [], { market: "uk" }, { market: 3 }, { market: "" }]) expect(marketFromConfig(bad)).toEqual(TW_DEFAULTS);
  // a bad language or paper falls back to that market's own default; valid ones are honoured
  expect(marketFromConfig({ market: "us", language: "fr", paper: "legal" })).toEqual({ market: "us", language: "en", paper: "letter" });
  expect(marketFromConfig({ market: "tw", language: "klingon" }).language).toBe("zh-TW");
  expect(marketFromConfig({ market: "tw", paper: "letter" }).paper).toBe("letter");
});

test("readMarket：沒有 jobhunt.yaml、壞掉的 yaml、market: us", async () => {
  expect(await readMarket(folderWith(null))).toEqual(TW_DEFAULTS);
  expect(await readMarket(folderWith("market: [unclosed\n  - : :"))).toEqual(TW_DEFAULTS);
  expect(await readMarket(folderWith("market: uk\nlanguage: en\n"))).toEqual({ ...TW_DEFAULTS, language: "en" }); // unknown market = tw; a valid language stays
  expect(await readMarket(folderWith("language: en\nmarket: us\npaper: letter\nkit_format: folder-v0\n"))).toEqual({ market: "us", language: "en", paper: "letter" });
});
