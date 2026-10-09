// Where the job-hunt folder is, and the only doors the app may use to read or write inside it.
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

/** Files the app may read (paths relative to the folder, forward slashes). */
const READ_RULES: RegExp[] = [
  /^data\/applications\.csv$/,
  /^resume\.yaml$/,
  /^me\/profile\.md$/,
  /^targets\/[^/]+$/,
  /^resumes\/[^/]+$/,
  /^104\/[^/]+$/,
  /^jobs\/[^/]+\/[^/]+$/,
  /^checks\/[^/]+$/,
  /^me\/stories\/[^/]+\.md$/,
  /^jobhunt\.yaml$/,
];

/** Files the app may write. Everything else in the folder belongs to the user or the AI. */
const WRITE_RULES: RegExp[] = [
  /^data\/applications\.csv$/,
  /^checks\/[^/]+\.md$/, // only the「## 程式檢查」section is replaced (src/checksfile.ts)
];

/** Folders whose file names the app may list (names only; contents still go through READ_RULES). */
const LIST_RULES: RegExp[] = [/^targets$/, /^resumes$/, /^104$/, /^jobs$/, /^jobs\/[^/]+$/, /^checks$/, /^submitted$/, /^me\/stories$/];

export class FolderError extends Error {}

export function isCompiledBinary(execPath = process.execPath): boolean {
  return !/^bun(\.exe)?$/i.test(basename(execPath));
}

/** The data folder: --dir/--folder in dev (or tests), otherwise the folder the executable sits in. */
export function resolveDataDir(argv: string[], execPath = process.execPath): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "--folder") return argv[i + 1] ? resolve(argv[i + 1]) : null;
    const m = /^--(?:dir|folder)=(.+)$/.exec(a);
    if (m) return resolve(m[1]);
  }
  if (isCompiledBinary(execPath)) return dirname(execPath);
  return null;
}

export function looksLikeJobhuntFolder(dir: string): boolean {
  try {
    return statSync(join(dir, "AGENTS.md")).isFile();
  } catch {
    return false;
  }
}

function normalizeRel(rel: string): string {
  if (typeof rel !== "string" || rel === "" || rel.includes("\0")) throw new FolderError("bad path");
  const r = rel.replace(/\\/g, "/");
  if (isAbsolute(r) || r.startsWith("/") || /^[a-zA-Z]:/.test(r) || r.includes(":")) throw new FolderError("bad path");
  const parts = r.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) throw new FolderError("bad path");
  return parts.join("/");
}

export class Folder {
  readonly root: string;
  private realRoot: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.realRoot = realpathSync(this.root);
  }

  static allowed(rel: string, mode: "read" | "write" | "list"): boolean {
    let r: string;
    try {
      r = normalizeRel(rel);
    } catch {
      return false;
    }
    const rules = mode === "read" ? READ_RULES : mode === "write" ? WRITE_RULES : LIST_RULES;
    return rules.some((re) => re.test(r));
  }

  /** Absolute path for a whitelisted relative path; refuses anything else, including symlinks that leave the folder. */
  path(rel: string, mode: "read" | "write" | "list"): string {
    const r = normalizeRel(rel);
    if (!Folder.allowed(r, mode)) throw new FolderError(`not allowed: ${r}`);
    const abs = join(this.root, ...r.split("/"));
    // Walk up to the deepest existing ancestor and make sure its real location is still inside the folder.
    let probe = abs;
    while (!existsSync(probe) && probe !== this.root) probe = dirname(probe);
    const real = realpathSync(probe);
    if (real !== this.realRoot && !real.startsWith(this.realRoot.endsWith(sep) ? this.realRoot : this.realRoot + sep))
      throw new FolderError(`outside folder: ${r}`);
    return abs;
  }

  exists(rel: string): boolean {
    try {
      return existsSync(this.path(rel, "read"));
    } catch {
      return false;
    }
  }

  async readText(rel: string): Promise<string | null> {
    const p = this.path(rel, "read");
    const f = Bun.file(p);
    if (!(await f.exists())) return null;
    return await f.text();
  }

  async readBytes(rel: string): Promise<Uint8Array | null> {
    const p = this.path(rel, "read");
    const f = Bun.file(p);
    if (!(await f.exists())) return null;
    return new Uint8Array(await f.arrayBuffer());
  }

  async readYaml(rel: string): Promise<unknown> {
    const t = await this.readText(rel);
    return t == null ? null : Bun.YAML.parse(t);
  }

  /** Last change time of a readable file as local YYYY-MM-DD, or null. */
  modified(rel: string): string | null {
    try {
      const d = statSync(this.path(rel, "read")).mtime;
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    } catch {
      return null;
    }
  }

  /** Names in a whitelisted folder (no dotfiles). Missing folder → []. */
  list(rel: string, kind: "file" | "dir" | "any" = "any"): string[] {
    const p = this.path(rel, "list");
    let entries;
    try {
      entries = readdirSync(p, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((e) => !e.name.startsWith("."))
      .filter((e) => kind === "any" || (kind === "file" ? e.isFile() : e.isDirectory()))
      .map((e) => e.name)
      .sort();
  }

  /** Atomic write: temp file next to the target, then rename over it. */
  async writeText(rel: string, text: string): Promise<void> {
    const p = this.path(rel, "write");
    mkdirSync(dirname(p), { recursive: true });
    const tmp = join(dirname(p), `.${basename(p)}.${process.pid}.${Date.now()}.tmp`);
    await Bun.write(tmp, text);
    try {
      renameSync(tmp, p);
    } catch (e) {
      try {
        unlinkSync(tmp);
      } catch {}
      throw e;
    }
  }

  // ---- lock file (.jobhunt/app.lock): the app's own bookkeeping, not user data
  get lockPath(): string {
    return join(this.root, ".jobhunt", "app.lock");
  }
}
