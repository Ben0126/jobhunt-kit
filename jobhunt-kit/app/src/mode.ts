// Where a person is looking for work: only the US, only Taiwan, or both. One folder serves all three; the choice decides
// which outputs and pages exist (104 for Taiwan, the job list for the US) and, from the next stage on, which AI rules are
// installed (docs/plan-dual-market.zh-TW.md).
//
// The choice lives in me/mode.yaml ("markets: [us, tw]"). The app's start screen writes it, and so may the AI after the
// person chose. It is NOT in me/profile.md: both kits' first-time flow treats "me/profile.md exists" as "not the first
// time", so creating it from the start screen would skip the AI's welcome.
// A folder without me/mode.yaml is an older one-market kit: its jobhunt.yaml `market` answers, and no start screen shows.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Folder } from "./folder.ts";

export type MarketId = "us" | "tw";
export type ModeInfo = { markets: MarketId[]; set: boolean; source: "mode" | "legacy" | "none" };

export const MODE_PATH = "me/mode.yaml";
const ORDER: MarketId[] = ["us", "tw"];

/** ["tw", "US", "nope", "us"] -> ["us", "tw"]: known ones only, each once, always in the same order. */
export function cleanMarkets(v: unknown): MarketId[] {
  const got = new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()));
  return ORDER.filter((m) => got.has(m));
}

function fromTexts(modeText: string | null, configText: string | null): ModeInfo {
  if (modeText) {
    try {
      const markets = cleanMarkets((Bun.YAML.parse(modeText) as any)?.markets);
      if (markets.length) return { markets, set: true, source: "mode" };
    } catch {}
  }
  if (configText) {
    try {
      const m = String((Bun.YAML.parse(configText.replace(/^﻿/, "")) as any)?.market ?? "").trim().toLowerCase();
      if (m === "us" || m === "tw") return { markets: [m], set: true, source: "legacy" };
    } catch {}
  }
  return { markets: [], set: false, source: "none" };
}

export async function readMode(folder: Folder): Promise<ModeInfo> {
  const text = async (rel: string) => {
    try {
      return await folder.readText(rel);
    } catch {
      return null;
    }
  };
  return fromTexts(await text(MODE_PATH), await text("jobhunt.yaml"));
}

export function readModeSync(dir: string): ModeInfo {
  const text = (rel: string) => {
    try {
      return readFileSync(join(dir, ...rel.split("/")), "utf-8");
    } catch {
      return null;
    }
  };
  return fromTexts(text(MODE_PATH), text("jobhunt.yaml"));
}

/** The market whose rules lead: the US when it is chosen (English first), else Taiwan. */
export const leadMarket = (markets: MarketId[]): MarketId => (markets.includes("us") ? "us" : "tw");

export function modeText(markets: MarketId[]): string {
  return (
    "# Where you are looking for work: us (United States), tw (Taiwan), or both. Set on the program's start screen,\n" +
    "# or by the AI after you chose. 你要找哪裡的工作：us（美國）、tw（台灣），或兩個都寫。\n" +
    `markets: [${cleanMarkets(markets).join(", ")}]\n`
  );
}

export async function writeMode(folder: Folder, markets: MarketId[]): Promise<void> {
  await folder.writeText(MODE_PATH, modeText(markets));
}

/** jobhunt.yaml with only its `language:` line changed (or added at the end); every other line and comment stays. */
export function withLanguage(configText: string, language: "en" | "zh-TW"): string {
  const nl = /\r\n/.test(configText) ? "\r\n" : "\n";
  const lines = configText.split(/\r?\n/);
  const i = lines.findIndex((l) => /^language\s*:/.test(l));
  if (i >= 0) {
    const comment = /(\s+#.*)$/.exec(lines[i].replace(/^language\s*:\s*("[^"]*"|'[^']*'|[^\s#]*)/, ""))?.[1] ?? "";
    lines[i] = `language: ${language}${comment}`;
    return lines.join(nl);
  }
  const body = configText.length && !configText.endsWith("\n") ? configText + nl : configText;
  return `${body}language: ${language}${nl}`;
}

/** The market a job is for. One market: that one. Both: the target's own `market:` (us or tw), else its base_variant
 * (en… is the US, anything else Taiwan). An English resume for a Taiwan employer says `market: tw`. */
export function marketForTarget(target: any, markets: MarketId[], lead: MarketId): MarketId {
  if (!(markets.includes("us") && markets.includes("tw"))) return lead;
  const f = String(target?.market ?? "").trim().toLowerCase();
  if (f === "us" || f === "tw") return f;
  return /^en(?:[-_]|$)/i.test(String(target?.base_variant ?? "")) ? "us" : "tw";
}
