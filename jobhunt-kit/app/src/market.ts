// Which job market a kit folder is for: jobhunt.yaml `market` (tw | us), `language` (zh-TW | en), `paper` (a4 | letter).
// Missing file, broken yaml or an unknown market all mean the Taiwan kit, so a folder made before this existed keeps
// working exactly as it did.
import type { Folder } from "./folder.ts";

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

export async function readMarket(folder: Folder): Promise<MarketConfig> {
  try {
    return marketFromConfig(await folder.readYaml("jobhunt.yaml"));
  } catch {
    return TW_DEFAULTS;
  }
}
