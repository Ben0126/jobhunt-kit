// Which job market a kit folder is for: jobhunt.yaml `market` (tw | us), `language` (zh-TW | en), `paper` (a4 | letter).
// Missing file, broken yaml or an unknown market all mean the Taiwan kit, so a folder made before this existed keeps
// working exactly as it did.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Folder } from "./folder.ts";
import { leadMarket, readMode, readModeSync } from "./mode.ts";

export type Market = "tw" | "us";
export type Language = "zh-TW" | "en";
export type Paper = "a4" | "letter";
export type MarketConfig = { market: Market; language: Language; paper: Paper };

export const TW_DEFAULTS: MarketConfig = { market: "tw", language: "zh-TW", paper: "a4" };
const US_DEFAULTS: MarketConfig = { market: "us", language: "en", paper: "letter" };

const word = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** The settings in a parsed jobhunt.yaml. A bad `language` or `paper` falls back to the market's own default. */
export function marketFromConfig(cfg: unknown): MarketConfig {
  const c: any = cfg && typeof cfg === "object" ? cfg : {};
  const base = word(c.market) === "us" ? US_DEFAULTS : TW_DEFAULTS; // unknown market = Taiwan
  const lang = word(c.language);
  const paper = word(c.paper);
  return {
    market: base.market,
    language: lang === "en" ? "en" : lang === "zh-tw" ? "zh-TW" : base.language,
    paper: paper === "letter" ? "letter" : paper === "a4" ? "a4" : base.paper,
  };
}

/** jobhunt.yaml with no `market` of its own (the one-for-all kit) takes it from me/mode.yaml: the US leads when chosen. */
const withMode = (cfg: unknown, markets: ("us" | "tw")[]): unknown => {
  const c: any = cfg && typeof cfg === "object" ? cfg : {};
  return c.market == null && markets.length ? { ...c, market: leadMarket(markets) } : cfg;
};

export async function readMarket(folder: Folder): Promise<MarketConfig> {
  try {
    return marketFromConfig(withMode(await folder.readYaml("jobhunt.yaml"), (await readMode(folder)).markets));
  } catch {
    return TW_DEFAULTS;
  }
}

/** Same as readMarket for code that cannot await (the Word reader). `dir` is the folder's path. */
export function readMarketSync(dir: string): MarketConfig {
  try {
    return marketFromConfig(withMode(Bun.YAML.parse(readFileSync(join(dir, "jobhunt.yaml"), "utf-8").replace(/^﻿/, "")), readModeSync(dir).markets));
  } catch {
    return TW_DEFAULTS;
  }
}

/** True when a path has a segment naming the US kit: the folder `job-hunt-us`, or a zip like `job-hunt-us-windows.zip`
 * (Windows shows a zip's content as `Temp1_job-hunt-us-windows.zip\job-hunt-us\...`). `focus-us` and `campus-users` do not count. */
export function pathNamesUsKit(p: string): boolean {
  return p.split(/[\/]+/).some((seg) => /job-hunt-us(?![a-z0-9])/i.test(seg));
}

/** The wording for a folder the program does not recognise (no readable jobhunt.yaml): English when the program's own
 * path or the given folder path names the US kit, else the Taiwan (Chinese) wording as before. */
export function unrecognisedLanguage(dir: string | null, execPath: string = process.execPath): Language {
  return pathNamesUsKit(execPath) || (!!dir && pathNamesUsKit(dir)) ? "en" : "zh-TW";
}
