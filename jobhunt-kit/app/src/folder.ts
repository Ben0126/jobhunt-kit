// Where the job-hunt folder is, and the only doors the app may use to read or write inside it.
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

/** Files the app may read (paths relative to the folder, forward slashes). */
const READ_RULES: RegExp[] = [
  /^data\/applications\.csv$/,
  /^data\/resume_versions\.csv$/, // the numbers given to resumes that were sent (resumever.ts)
  /^resume\.yaml$/,
  /^me\/profile\.md$/,
  /^targets\/[^/]+$/,
  /^resumes\/[^/]+$/,
  /^104\/[^/]+$/,
  /^profiles\/[^/]+\.md$/i, // US kit: LinkedIn / Handshake text (checked for visa words and ID numbers)
  /^jobs\/[^/]+\/[^/]+$/,
  /^checks\/[^/]+$/,
  /^me\/stories\/[^/]+\.md$/,
  /^jobhunt\.yaml$/,
  /^me\/mode\.yaml$/, // where they look for work (src/mode.ts)
  /^submitted\/\d{4}-\d{2}-\d{2}_[^/]+\.html$/, // the copies "I applied, save a copy" made: shown on the resume page
];

/** Files the app may write. Everything else in the folder belongs to the user or the AI. */
const WRITE_RULES: RegExp[] = [
  /^me\/mode\.yaml$/, // the start screen's choice: us, tw or both (src/mode.ts)
  /^jobhunt\.yaml$/, // only its `language:` line, from the start screen or the language switch (mode.ts withLanguage)
  /^data\/applications\.csv$/,
  /^data\/resume_versions\.csv$/, // only "I applied, save a copy" adds a row (applications.ts archive)
  /^checks\/[^/]+\.md$/, // only the「## 程式檢查」section is replaced (src/checksfile.ts)
];

/** 「我投了這份，存一份」: the only way into submitted/ is a new copy of a resume file (archiveCopy), never an
 * overwrite. writeText can't reach these paths (they are not in WRITE_RULES). */
const ARCHIVE_SOURCE = /^resumes\/[^/]+\.html$/;
const ARCHIVE_RULES: RegExp[] = [/^submitted\/\d{4}-\d{2}-\d{2}_[^/]+\.html$/];

/** Folders whose file names the app may list (names only; contents still go through READ_RULES). */
const LIST_RULES: RegExp[] = [/^targets$/, /^resumes$/, /^104$/, /^profiles$/, /^jobs$/, /^jobs\/[^/]+$/, /^checks$/, /^submitted$/, /^me\/stories$/];

export class FolderError extends Error {}

type Mode = "read" | "write" | "list" | "archive";

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

/** In the compiled program `check` and `read` run without a permission prompt (the kit's .claude/settings.json allows
 * them with any arguments), so they only ever work on the folder the program sits in (`update` too: it replaces the
 * program it runs from): --dir/--folder pointing anywhere
 * else would let them read Word files or write checks/ in another folder unasked. Development (bun src/main.ts) and
 * opening the UI keep the flag. */
export function dirFlagRefused(command: string | undefined, argv: string[], execPath = process.execPath): boolean {
  return (command === "check" || command === "read" || command === "update" || command === "mode" || command === "resume-sections") && isCompiledBinary(execPath) && argv.some((a) => /^--(?:dir|folder)(?:=|$)/.test(a));
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

  static allowed(rel: string, mode: Mode): boolean {
    let r: string;
    try {
      r = normalizeRel(rel);
    } catch {
      return false;
    }
    const rules = mode === "read" ? READ_RULES : mode === "write" ? WRITE_RULES : mode === "archive" ? ARCHIVE_RULES : LIST_RULES;
    return rules.some((re) => re.test(r));
  }

  /** Absolute path for a whitelisted relative path; refuses anything else, including symlinks that leave the folder. */
  path(rel: string, mode: Mode): string {
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
    // Text files may come with Windows line endings (Notepad, a CRLF git checkout): everything that reads them
    // parses lines, so hand out LF only.
    return (await f.text()).replace(/\r\n?/g, "\n");
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

  /** Copy a resume file into submitted/ as a new file. Fails (code EEXIST) if the target is already there: a
   * saved copy is never replaced. Both paths go through the whitelist and the symlink check. */
  archiveCopy(fromRel: string, toRel: string): void {
    const r = normalizeRel(fromRel);
    if (!ARCHIVE_SOURCE.test(r)) throw new FolderError(`not allowed: ${r}`);
    const src = this.path(r, "read");
    const dest = this.path(toRel, "archive");
    mkdirSync(dirname(dest), { recursive: true });
    this.path(toRel, "archive"); // again, now that the folder exists (it must not lead outside)
    copyFileSync(src, dest, constants.COPYFILE_EXCL);
  }

  /** Bytes of a saved copy in submitted/, or null when there is none. */
  async readArchived(toRel: string): Promise<Uint8Array | null> {
    const f = Bun.file(this.path(toRel, "archive"));
    if (!(await f.exists())) return null;
    return new Uint8Array(await f.arrayBuffer());
  }

  // ---- lock file (.jobhunt/app.lock): the app's own bookkeeping, not user data
  get lockPath(): string {
    return join(this.root, ".jobhunt", "app.lock");
  }

  /** The job list the program read (src/feed.ts): bookkeeping too, in no rule above. */
  get feedPath(): string {
    return join(this.root, ".jobhunt", "feed.json");
  }

  /** When the program last asked GitHub about a newer version (src/update.ts): bookkeeping too, in no rule above. */
  get updatePath(): string {
    return join(this.root, ".jobhunt", "update.json");
  }
}
