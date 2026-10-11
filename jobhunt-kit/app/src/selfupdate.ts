// One-click update (phase 2 of the update reminder in update.ts; design notes in ../docs/plan-update.zh-TW.md).
//
// 1. prepareUpdate: ask GitHub for the latest release, download this kit's zip for this computer, and work out which
//    files would change. Nothing in the folder is written.
// 2. applyUpdate: only after the user saw that list. Replaces ONLY the program and the instruction files (the fixed
//    list below), never the user's data; jobhunt.yaml only gets the settings lines it is missing. The old files are
//    copied to .jobhunt/backup/ first, any failure puts everything back, and the new program must report the new
//    version before the update counts.
// 3. undoUpdate (`jobhunt update --undo`): puts the backup back.
//
// The zip is never unpacked as a whole: its resume.yaml and data/applications.csv are blank templates that would wipe
// the user's confirmed experience and application progress.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DocxError, unzipEntry, zipEntries, type ZipLimits } from "./docx.ts";
import { type Market, readMarketSync } from "./market.ts";
import { apiUrl, assetName, isNewer, parseVersion, programName, REPO, testServerFromEnv } from "./update.ts";
import type { UpdateText } from "./selfupdate.text.ts";

// ---------------------------------------------------------------- what may be replaced

/** Instruction files at the top of each kit folder (the program file is added per computer, see programName). */
const ROOT_FILES: Record<Market, string[]> = {
  tw: ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "開始使用.md", "開場句.txt"],
  us: ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "START-HERE.md", "opening-prompt.txt"],
};
/** Folders that hold only instruction files the AI is not allowed to edit (the kit's .claude/settings.json denies it). */
const KIT_DIRS = ["playbooks/", "templates/", ".claude/"];
/** Claude Code keeps the user's own permission answers here: never replaced. */
const NEVER = new Set([".claude/settings.local.json"]);
const SETTINGS = "jobhunt.yaml";
const PROGRAMS = ["jobhunt.exe", "jobhunt-mac-arm64", "jobhunt-mac-x64"];

/** The top folder inside the release zip (release.yml: pkg/job-hunt, pkg/job-hunt-us). */
export const zipTop = (m: Market) => (m === "us" ? "job-hunt-us" : "job-hunt");

/** Is this path (relative, forward slashes) one the update may replace in a folder of this market on this computer? */
export function replaceable(rel: string, market: Market, program: string): boolean {
  if (!rel || rel.includes("\\") || rel.includes(":") || rel.includes("\0") || rel.startsWith("/")) return false;
  if (rel.split("/").some((p) => p === "" || p === "." || p === "..")) return false;
  if (NEVER.has(rel)) return false;
  if (rel === program || ROOT_FILES[market].includes(rel)) return true;
  return KIT_DIRS.some((d) => rel.startsWith(d) && rel.length > d.length);
}

// ---------------------------------------------------------------- failures

export type FailCode =
  | "dev" | "unsupported" | "offline" | "latest" | "noAsset" | "badDownload" | "notPlainFile" | "busy"
  | "restored" | "verifyFailed" | "rollbackFailed" | "undoNone" | "undoWrongVersion" | "undoFailed";

export class UpdateFailure extends Error {
  constructor(readonly code: FailCode, readonly detail: Record<string, string> = {}) {
    super(code);
  }
}

export function failureText(e: UpdateFailure, T: UpdateText): string {
  const d = e.detail;
  switch (e.code) {
    case "dev": return T.devBuild;
    case "unsupported": return T.unsupported;
    case "offline": return T.offline;
    case "latest": return T.latest(d.version ?? "");
    case "noAsset": return T.noAsset(d.asset ?? "");
    case "badDownload": return T.badDownload;
    case "notPlainFile": return T.notPlainFile(d.path ?? "");
    case "busy": return T.busy;
    case "restored": return T.restored;
    case "verifyFailed": return T.verifyFailed;
    case "rollbackFailed": return T.rollbackFailed;
    case "undoNone": return T.undoNone;
    case "undoWrongVersion": return T.undoWrongVersion(d.now ?? "", d.to ?? "");
    case "undoFailed": return T.undoFailed;
  }
}

// ---------------------------------------------------------------- jobhunt.yaml: add missing settings, keep the rest

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The user's jobhunt.yaml with the top-level settings it lacks copied from the new one (each with the comment lines
 * right above it). Every existing line stays as it is. null = nothing to add, or either file can't be read safely. */
export function mergeSettings(oldText: string, newText: string): { text: string; added: string[] } | null {
  let a: unknown, b: unknown;
  try {
    a = Bun.YAML.parse(oldText);
    b = Bun.YAML.parse(newText);
  } catch {
    return null;
  }
  if (!isObj(a) || !isObj(b)) return null;
  const missing = Object.keys(b).filter((k) => !(k in a) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
  if (!missing.length) return null;
  const lines = newText.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  for (const key of missing) {
    const at = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
    if (at < 0) return null;
    let start = at;
    while (start > 0 && /^#/.test(lines[start - 1])) start--;
    let end = at + 1;
    while (end < lines.length && !/^[^\s#]/.test(lines[end])) end++;
    while (end > at + 1 && /^\s*(#.*)?$/.test(lines[end - 1])) end--; // comments and blank lines belong to the next key
    blocks.push(lines.slice(start, end).join("\n"));
  }
  const nl = /\r\n/.test(oldText) ? "\r\n" : "\n";
  const base = oldText.length && !oldText.endsWith("\n") ? oldText + nl : oldText;
  const text = base + nl + blocks.join(nl + nl).replace(/\n/g, nl) + nl;
  // The result must still say exactly what the user's file said, plus the new keys.
  try {
    const c = Bun.YAML.parse(text);
    if (!isObj(c)) return null;
    for (const k of Object.keys(a)) if (JSON.stringify(c[k]) !== JSON.stringify(a[k])) return null;
    for (const k of missing) if (JSON.stringify(c[k]) !== JSON.stringify(b[k])) return null;
  } catch {
    return null;
  }
  return { text, added: missing };
}

// ---------------------------------------------------------------- 1. prepare (read-only)

export type NewFile = { path: string; data: Uint8Array; isNew: boolean; program: boolean };
/** settingsBase: jobhunt.yaml as it was when the list was made (the merge is redone from nothing if it changed). */
export type Prepared = { from: string; to: string; market: Market; program: string; files: NewFile[]; settingsAdded: string[]; settingsBase?: string };
/** What the page and the command line show before the user agrees. */
export type PlanView = { from: string; to: string; files: { path: string; isNew: boolean }[]; settingsAdded: string[] };

export const planView = (p: Prepared): PlanView => ({
  from: p.from,
  to: p.to,
  files: p.files.filter((f) => f.path !== SETTINGS).map((f) => ({ path: f.path, isNew: f.isNew })),
  settingsAdded: p.settingsAdded,
});

/** Limits for the release zip: one program (about 110 MB unpacked) plus a few dozen small text files. */
export const UPDATE_ZIP_LIMITS: ZipLimits = { entries: 2000, entry: 300 * 1024 * 1024, ratio: 200, ratioFloor: 1024 * 1024 };
const MAX_DOWNLOAD = 200 * 1024 * 1024;
const API_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export type UpdateEnv = {
  dir: string;
  version: string;
  platform?: string;
  arch?: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** Development only: a local test server (http://127.0.0.1:<port>) that stands in for GitHub. */
  server?: string | null;
};

export { testServerFromEnv };
const zipUrl = (server: string | null, tag: string, asset: string) =>
  `${server ?? "https://github.com"}/${REPO}/releases/download/${tag}/${asset}`;

/** A file in the folder that is about to be replaced: must be a plain file (or absent) under plain folders. */
function checkPlain(dir: string, rel: string): boolean {
  const parts = rel.split("/");
  let p = dir;
  for (let i = 0; i < parts.length; i++) {
    p = join(p, parts[i]);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      return false; // absent from here down: a new file
    }
    if (st.isSymbolicLink()) throw new UpdateFailure("notPlainFile", { path: parts.slice(0, i + 1).join("/") });
    if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile()) throw new UpdateFailure("notPlainFile", { path: parts.slice(0, i + 1).join("/") });
  }
  return true;
}

export async function prepareUpdate(env: UpdateEnv): Promise<Prepared> {
  const from = env.version;
  if (!parseVersion(from)) throw new UpdateFailure("dev");
  const platform = env.platform ?? process.platform, arch = env.arch ?? process.arch;
  const market = readMarketSync(env.dir).market;
  const asset = assetName(market, platform, arch), program = programName(platform, arch);
  if (!asset || !program) throw new UpdateFailure("unsupported");
  const doFetch = env.fetch ?? ((u: string, i: RequestInit) => fetch(u, i));
  const server = env.server ?? null;
  const headers = { "User-Agent": `jobhunt-kit/${from}` };

  let release: any;
  try {
    const r = await doFetch(apiUrl(server), { headers: { ...headers, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!r.ok) throw new Error(String(r.status));
    release = await r.json();
  } catch {
    throw new UpdateFailure("offline");
  }
  const tag = release && !release.draft && !release.prerelease && parseVersion(release.tag_name) ? String(release.tag_name).trim() : null;
  if (!tag) throw new UpdateFailure("offline");
  if (!isNewer(tag, from)) throw new UpdateFailure("latest", { version: from });
  const info = Array.isArray(release.assets) ? release.assets.find((a: any) => a?.name === asset) : null;
  if (!info) throw new UpdateFailure("noAsset", { asset });
  const digest = typeof info.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(info.digest) ? info.digest.slice(7).toLowerCase() : null;
  if (Number(info.size) > MAX_DOWNLOAD) throw new UpdateFailure("badDownload");

  let zip: Uint8Array;
  try {
    const r = await doFetch(zipUrl(server, tag, asset), { headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!r.ok) throw new Error(String(r.status));
    zip = new Uint8Array(await r.arrayBuffer());
  } catch {
    throw new UpdateFailure("offline");
  }
  if (zip.length > MAX_DOWNLOAD || (Number.isFinite(Number(info.size)) && Number(info.size) > 0 && zip.length !== Number(info.size))) throw new UpdateFailure("badDownload");
  if (digest && new Bun.CryptoHasher("sha256").update(zip).digest("hex") !== digest) throw new UpdateFailure("badDownload");

  // Pick the files we may replace; every other entry (the user-data templates included) is skipped unread.
  const top = zipTop(market) + "/";
  const picked = new Map<string, Uint8Array>();
  let settingsNew: string | null = null;
  try {
    const entries = zipEntries(zip, UPDATE_ZIP_LIMITS);
    const budget = { left: 600 * 1024 * 1024 };
    for (const e of entries) {
      const name = e.name.normalize("NFC");
      if (!name.startsWith(top) || name.endsWith("/")) continue;
      const rel = name.slice(top.length);
      if (rel === SETTINGS) settingsNew = new TextDecoder().decode(unzipEntry(zip, e, budget, UPDATE_ZIP_LIMITS));
      else if (replaceable(rel, market, program)) {
        if (picked.has(rel)) throw new DocxError("corrupt", `duplicate ${rel}`);
        picked.set(rel, unzipEntry(zip, e, budget, UPDATE_ZIP_LIMITS));
      }
    }
  } catch (e) {
    if (e instanceof DocxError) throw new UpdateFailure("badDownload");
    throw e;
  }
  // A zip without the program or the main rules is not a kit for this folder.
  if (!picked.has(program) || !picked.has("AGENTS.md") || settingsNew == null) throw new UpdateFailure("badDownload");
  try {
    const m = Bun.YAML.parse(settingsNew) as any;
    if ((m?.market === "us" ? "us" : "tw") !== market) throw new Error("market");
  } catch {
    throw new UpdateFailure("badDownload");
  }

  const files: NewFile[] = [];
  for (const [rel, data] of [...picked].sort(([a], [b]) => (a === program ? 1 : b === program ? -1 : a < b ? -1 : a > b ? 1 : 0))) {
    const exists = checkPlain(env.dir, rel);
    if (exists && Buffer.from(readFileSync(join(env.dir, rel))).equals(Buffer.from(data))) continue;
    files.push({ path: rel, data, isNew: !exists, program: rel === program });
  }
  let settingsAdded: string[] = [];
  let settingsBase: string | undefined;
  if (checkPlain(env.dir, SETTINGS)) {
    settingsBase = readFileSync(join(env.dir, SETTINGS), "utf-8");
    const merged = mergeSettings(settingsBase, settingsNew);
    if (merged) {
      files.unshift({ path: SETTINGS, data: new TextEncoder().encode(merged.text), isNew: false, program: false });
      settingsAdded = merged.added;
    }
  }
  return { from, to: tag, market, program, files, settingsAdded, settingsBase };
}

// ---------------------------------------------------------------- 2. apply

const STAGE = ".jobhunt-new";
const backupDir = (dir: string) => join(dir, ".jobhunt", "backup");
const backupJson = (dir: string) => join(backupDir(dir), "backup.json");
const backupFile = (dir: string, rel: string) => join(backupDir(dir), "files", ...rel.split("/"));

export type ApplyOptions = {
  platform?: string;
  /** Runs `<program> --version`; null when it would not start. Tests pass their own. */
  runVersion?: (exe: string) => string | null;
  now?: () => Date;
};

function defaultRunVersion(exe: string): string | null {
  try {
    const p = Bun.spawnSync([exe, "--version"], { cwd: dirname(exe), stdout: "pipe", stderr: "ignore", timeout: 30_000, windowsHide: true } as any);
    return p.exitCode === 0 ? p.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

/** Only one update (or undo) at a time per folder. A lock older than 30 minutes is left over from a crash. */
function takeLock(dir: string): () => void {
  const path = join(dir, ".jobhunt", "update.lock");
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      closeSync(openSync(path, "wx"));
      return () => {
        try {
          unlinkSync(path);
        } catch {}
      };
    } catch {
      try {
        if (Date.now() - statSync(path).mtimeMs > 30 * 60_000) unlinkSync(path);
        else break;
      } catch {}
    }
  }
  throw new UpdateFailure("busy");
}

/** Put a staged file in place. Windows can't overwrite a running program but can rename it: the old one becomes
 * <name>.old and keeps running until the user closes it (removed on the next start, cleanupAfterUpdate). */
function swapIn(abs: string, staged: string, program: boolean, platform: string): string | null {
  if (program && platform === "win32" && existsSync(abs)) {
    let old = `${abs}.old`;
    try {
      if (existsSync(old)) unlinkSync(old);
    } catch {
      old = `${abs}.old-${Date.now()}`; // an older .old is still running
    }
    renameSync(abs, old);
    try {
      renameSync(staged, abs);
    } catch (e) {
      renameSync(old, abs);
      throw e;
    }
    return old;
  }
  if (program) chmodSync(staged, 0o755);
  renameSync(staged, abs);
  return null;
}

type Done = { path: string; existed: boolean; program: boolean; oldPath: string | null };

function rollback(dir: string, done: Done[], platform: string): boolean {
  let ok = true;
  for (const d of [...done].reverse()) {
    const abs = join(dir, ...d.path.split("/"));
    try {
      if (d.oldPath) {
        unlinkSync(abs);
        renameSync(d.oldPath, abs);
      } else if (d.existed) {
        const staged = abs + STAGE;
        copyFileSync(backupFile(dir, d.path), staged);
        swapIn(abs, staged, d.program, platform);
      } else unlinkSync(abs);
    } catch {
      ok = false;
    }
  }
  return ok;
}

export function applyUpdate(dir: string, p: Prepared, o: ApplyOptions = {}): void {
  const platform = o.platform ?? process.platform;
  const runVersion = o.runVersion ?? defaultRunVersion;
  const release = takeLock(dir);
  const staged: string[] = [];
  try {
    // The folder may have changed since the preview: check again.
    for (const f of p.files) if (checkPlain(dir, f.path) === f.isNew) throw new UpdateFailure("restored");
    if (p.files.some((f) => f.path === SETTINGS) && readFileSync(join(dir, SETTINGS), "utf-8") !== p.settingsBase) throw new UpdateFailure("restored");

    // Stage every new file next to its target (same disk, so the swap below is a rename).
    try {
      for (const f of p.files) {
        const abs = join(dir, ...f.path.split("/"));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs + STAGE, f.data);
        staged.push(abs + STAGE);
      }
    } catch {
      throw new UpdateFailure("restored");
    }

    // Back up what is about to be replaced (only the latest update is kept).
    try {
      rmSync(backupDir(dir), { recursive: true, force: true });
      for (const f of p.files) {
        if (f.isNew) continue;
        const to = backupFile(dir, f.path);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(join(dir, ...f.path.split("/")), to);
      }
      const record = { from: p.from, to: p.to, at: (o.now ?? (() => new Date()))().toISOString(), files: p.files.map((f) => ({ path: f.path, existed: !f.isNew, program: f.program })) };
      writeFileSync(backupJson(dir), JSON.stringify(record, null, 2) + "\n");
    } catch {
      rmSync(backupDir(dir), { recursive: true, force: true });
      throw new UpdateFailure("restored");
    }

    // Swap, program last. Any failure puts back what was already swapped.
    const done: Done[] = [];
    try {
      for (const f of p.files) {
        const abs = join(dir, ...f.path.split("/"));
        const oldPath = swapIn(abs, abs + STAGE, f.program, platform);
        done.push({ path: f.path, existed: !f.isNew, program: f.program, oldPath });
      }
    } catch {
      if (!rollback(dir, done, platform)) throw new UpdateFailure("rollbackFailed");
      rmSync(backupDir(dir), { recursive: true, force: true });
      throw new UpdateFailure("restored");
    }

    // The new program must start and report the new version.
    if (p.files.some((f) => f.program)) {
      const said = runVersion(join(dir, p.program));
      if (said !== p.to.replace(/^v/, "")) {
        if (!rollback(dir, done, platform)) throw new UpdateFailure("rollbackFailed");
        rmSync(backupDir(dir), { recursive: true, force: true });
        throw new UpdateFailure("verifyFailed");
      }
    }
  } finally {
    for (const s of staged) {
      try {
        if (existsSync(s)) unlinkSync(s);
      } catch {}
    }
    release();
  }
}

// ---------------------------------------------------------------- 3. undo

type BackupRecord = { from: string; to: string; files: { path: string; existed: boolean; program: boolean }[] };

export function readBackup(dir: string): BackupRecord | null {
  try {
    const r = JSON.parse(readFileSync(backupJson(dir), "utf-8"));
    if (!parseVersion(r?.from) || !parseVersion(r?.to) || !Array.isArray(r.files)) return null;
    const files = r.files.filter((f: any) => f && typeof f.path === "string" && (f.path === SETTINGS || /^[^/]/.test(f.path)));
    // Only paths an update could have written: a hand-edited record can't make undo touch the user's files.
    const ok = (f: any) => f.path === SETTINGS || (f.program ? PROGRAMS.includes(f.path) : replaceable(f.path, "tw", "") || replaceable(f.path, "us", ""));
    if (!files.every(ok)) return null;
    return { from: String(r.from), to: String(r.to), files: files.map((f: any) => ({ path: f.path, existed: !!f.existed, program: !!f.program })) };
  } catch {
    return null;
  }
}

/** Puts back the files the last update replaced (and removes the ones it added). Returns the version gone back to. */
export function undoUpdate(dir: string, o: { version: string; platform?: string }): string {
  const platform = o.platform ?? process.platform;
  const rec = readBackup(dir);
  if (!rec) throw new UpdateFailure("undoNone");
  const strip = (v: string) => v.replace(/^v/, "");
  if (strip(o.version) !== strip(rec.to)) throw new UpdateFailure("undoWrongVersion", { now: strip(o.version), to: strip(rec.to) });
  const release = takeLock(dir);
  const staged: string[] = [];
  try {
    try {
      for (const f of rec.files) {
        if (!f.existed) continue;
        checkPlain(dir, f.path);
        const abs = join(dir, ...f.path.split("/"));
        mkdirSync(dirname(abs), { recursive: true });
        copyFileSync(backupFile(dir, f.path), abs + STAGE);
        staged.push(abs + STAGE);
      }
    } catch (e) {
      if (e instanceof UpdateFailure) throw e;
      throw new UpdateFailure("undoFailed");
    }
    try {
      for (const f of [...rec.files].sort((a, b) => Number(a.program) - Number(b.program))) {
        const abs = join(dir, ...f.path.split("/"));
        if (f.existed) swapIn(abs, abs + STAGE, f.program, platform);
        else if (existsSync(abs)) unlinkSync(abs);
      }
    } catch {
      throw new UpdateFailure("undoFailed");
    }
    rmSync(backupDir(dir), { recursive: true, force: true });
    return strip(rec.from);
  } finally {
    for (const s of staged) {
      try {
        if (existsSync(s)) unlinkSync(s);
      } catch {}
    }
    release();
  }
}

// ---------------------------------------------------------------- start-up tidy

/** The program renamed aside by a Windows update (jobhunt.exe.old, jobhunt.exe.old-<time>): delete it once nothing
 * runs from it any more. Never throws. */
export function cleanupAfterUpdate(dir: string, program: string | null = programName()): void {
  if (!program) return;
  try {
    for (const name of readdirSync(dir)) {
      if (name === `${program}.old` || new RegExp(`^${program.replace(/[.]/g, "\\.")}\\.old-\\d+$`).test(name)) {
        try {
          unlinkSync(join(dir, name));
        } catch {}
      }
    }
  } catch {}
}

// ---------------------------------------------------------------- command line: jobhunt update [--yes | --undo]

/** How the user types the program in a terminal opened in the folder: .\jobhunt.exe or ./jobhunt-mac-arm64. */
export const programCommand = (program: string, platform: string = process.platform) => (platform === "win32" ? `.\\${program}` : `./${program}`);

export async function runUpdate(argv: string[], dir: string | null, o: { version: string; print?: (s: string) => void; env?: Partial<UpdateEnv>; apply?: ApplyOptions } ): Promise<number> {
  const print = o.print ?? ((s: string) => console.log(s));
  const { cliTextFor } = await import("./cli.text.ts");
  const { updateTextFor } = await import("./selfupdate.text.ts");
  const { looksLikeJobhuntFolder } = await import("./folder.ts");
  const { unrecognisedLanguage } = await import("./market.ts");
  if (!dir || !looksLikeJobhuntFolder(dir)) {
    const C = cliTextFor(unrecognisedLanguage(dir));
    print(C.notFolder1);
    if (dir) print(C.programAt(dir));
    return 2;
  }
  const M = readMarketSync(dir);
  const T = updateTextFor(M.language);
  const platform = o.env?.platform ?? process.platform;
  const cmd = programCommand(programName(platform, o.env?.arch ?? process.arch) ?? "jobhunt", platform);
  const args = argv.slice(argv.indexOf("update") + 1).filter((a, i, all) => !/^--(dir|folder)(=|$)/.test(a) && !/^--(dir|folder)$/.test(all[i - 1] ?? ""));
  const yes = args.includes("--yes"), undo = args.includes("--undo");
  if (args.some((a) => a !== "--yes" && a !== "--undo") || (yes && undo)) {
    print(T.usage(cmd));
    return 2;
  }
  try {
    if (undo) {
      print(T.undoDone(undoUpdate(dir, { version: o.version, platform })));
      print(T.reopenCli);
      return 0;
    }
    const p = await prepareUpdate({ dir, version: o.version, server: testServerFromEnv(), ...o.env });
    const v = planView(p);
    print(T.previewTitle(v.from, v.to));
    if (!v.files.length && !v.settingsAdded.length) {
      print(T.nothingChanged(v.to));
      return 0;
    }
    if (v.files.length) {
      print(T.willReplace(v.files.length));
      for (const f of v.files) print(`  ${f.path}${f.isNew ? T.newFile : ""}`);
    }
    if (v.settingsAdded.length) print(T.settingsAdded(v.settingsAdded));
    print(T.keep(p.market));
    print(T.backupNote);
    if (!yes) {
      print(T.confirmCli(cmd));
      return 0;
    }
    applyUpdate(dir, p, { platform, ...o.apply });
    print(T.done(v.to));
    print(T.reopenCli);
    print(T.undoHintCli(cmd));
    return 0;
  } catch (e) {
    if (!(e instanceof UpdateFailure)) throw e;
    print(failureText(e, T));
    return e.code === "latest" ? 0 : 1;
  }
}
