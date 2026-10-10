// "A newer version exists" reminder (phase 1: only tells the user; phase 2, a one-click update, is not built yet).
// One GET to GitHub's public "latest release" address, at most once per 24 hours, with a fixed User-Agent and nothing
// about the user. Every failure is silent. Off when jobhunt.yaml says `update_check: false`. A dev build never checks.
// The last check is remembered in .jobhunt/update.json (the app's own bookkeeping, like app.lock; not in any
// read or write whitelist of folder.ts, so neither the AI nor the UI treats it as user data).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Folder } from "./folder.ts";
import { marketFromConfig, type Market } from "./market.ts";
import { VERSION } from "./version.ts";

export const REPO = "Ben0126/jobhunt-kit";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
export const CHECK_TIMEOUT_MS = 3000;

/** "v0.10", "0.7", "1.2.3" -> numbers; anything else (including "dev" and "v0.7-rc1") -> null. */
export function parseVersion(s: unknown): number[] | null {
  const m = typeof s === "string" ? /^v?(\d{1,6})\.(\d{1,6})(?:\.(\d{1,6}))?$/.exec(s.trim()) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

/** Numeric, part by part (v0.10 is newer than v0.9). False when either side is not a version. */
export function isNewer(latest: unknown, current: unknown): boolean {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** The program file this computer runs (what the user must replace), or null on a system we do not ship for. */
export function programName(platform: string = process.platform, arch: string = process.arch): string | null {
  if (platform === "win32") return "jobhunt.exe";
  if (platform === "darwin") return arch === "arm64" ? "jobhunt-mac-arm64" : "jobhunt-mac-x64";
  return null;
}

/** The release file name for this kit and computer (release.yml): job-hunt-windows.zip, job-hunt-us-mac-apple.zip ... */
export function assetName(market: Market, platform: string = process.platform, arch: string = process.arch): string | null {
  const os = platform === "win32" ? "windows" : platform === "darwin" ? (arch === "arm64" ? "mac-apple" : "mac-intel") : null;
  return os ? `${market === "us" ? "job-hunt-us" : "job-hunt"}-${os}.zip` : null;
}

export const downloadUrl = (asset: string) => `https://github.com/${REPO}/releases/latest/download/${asset}`;
export const notesUrl = (tag: string) => `https://github.com/${REPO}/releases/tag/${tag}`;

/** `update_check: false` (also no / off) in jobhunt.yaml turns the reminder off. Anything else, or nothing, leaves it on. */
export function updateCheckEnabled(cfg: unknown): boolean {
  const v: unknown = cfg && typeof cfg === "object" ? (cfg as any).update_check : undefined;
  if (v === false) return false;
  return !(typeof v === "string" && /^(false|no|off)$/i.test(v.trim()));
}

export type UpdateNotice = { version: string; notesUrl: string; downloadUrl: string; zipName: string; programName: string };

export type UpdateOptions = {
  folder: Folder;
  version?: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  platform?: string;
  arch?: string;
};

export type UpdateChecker = { get: () => Promise<UpdateNotice | null> };

type Seen = { at: number; latest: string | null };

function readCache(path: string): Seen | null {
  try {
    const c = JSON.parse(readFileSync(path, "utf-8"));
    const at = Date.parse(c?.checked_at);
    if (!Number.isFinite(at)) return null;
    return { at, latest: parseVersion(c.latest) ? String(c.latest).trim() : null };
  } catch {
    return null;
  }
}

/** Never throws; resolves to the notice, or null (nothing to show, switched off, offline, anything wrong). */
export function createUpdateChecker(o: UpdateOptions): UpdateChecker {
  const version = o.version ?? VERSION;
  const doFetch = o.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  const now = o.now ?? Date.now;
  const platform = o.platform ?? process.platform;
  const arch = o.arch ?? process.arch;
  let memo: Seen | null = null; // survives an unwritable folder: still one check per 24 h
  let inflight: Promise<UpdateNotice | null> | null = null;

  async function run(): Promise<UpdateNotice | null> {
    if (!parseVersion(version)) return null; // dev build or odd version: never reminds, never calls out
    let cfg: unknown = null;
    try {
      cfg = await o.folder.readYaml("jobhunt.yaml");
    } catch {
      return null; // a settings file we cannot read may hold an off switch we cannot see: do not call out
    }
    if (!updateCheckEnabled(cfg)) return null;
    const market = marketFromConfig(cfg).market;
    const zip = assetName(market, platform, arch), program = programName(platform, arch);
    if (!zip || !program) return null;

    const cachePath = o.folder.updatePath;
    const t = now();
    let seen = memo ?? readCache(cachePath);
    if (!seen || t - seen.at >= CHECK_EVERY_MS || t < seen.at) {
      let latest = seen?.latest ?? null; // a failed check keeps what we knew
      try {
        const r = await doFetch(LATEST_RELEASE_API, {
          headers: { "User-Agent": `jobhunt-kit/${version}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        if (r.ok) {
          const j: any = await r.json();
          latest = j && !j.draft && !j.prerelease && parseVersion(j.tag_name) ? String(j.tag_name).trim() : null;
        }
      } catch {}
      seen = memo = { at: t, latest };
      try {
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(cachePath, JSON.stringify({ checked_at: new Date(t).toISOString(), latest }) + "\n");
      } catch {}
    } else memo = seen;

    if (!seen.latest || !isNewer(seen.latest, version)) return null;
    return { version: seen.latest, notesUrl: notesUrl(seen.latest), downloadUrl: downloadUrl(zip), zipName: zip, programName: program };
  }

  return {
    get() {
      inflight ??= run().catch(() => null).finally(() => { inflight = null; });
      return inflight;
    },
  };
}
