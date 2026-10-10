// 申請進度：讀寫 data/applications.csv 的規則（和 playbooks/log-application.md 一致）。
import { createHash } from "node:crypto";
import { ensureColumn, parseCsv, rowToObject, serializeCsv, type CsvDoc } from "./csv.ts";
import { Folder } from "./folder.ts";
import { appsText, STATUSES_ZH, type StatusDef } from "./applications.text.ts";
import { readMarket, type Language } from "./market.ts";

export const CSV_PATH = "data/applications.csv";

/** Header of the kit's applications.csv (jobhunt/scaffold/workspace-general/data/applications.csv). */
export const KIT_HEADER = [
  "job_id", "company", "role", "track", "tier", "resume_version", "status", "applied_date", "last_update",
  "next_action", "next_action_date", "contact", "source", "notes", "resume_file", "resume_commit", "resume_rev", "link",
];

/** Status names for the Taiwan (zh-TW) board; English ones are in applications.text.ts. */
export const STATUSES: StatusDef[] = STATUSES_ZH;
const STATUS_CODES = new Set(STATUSES.map((s) => s.code));

export const EDITABLE = ["company", "role", "status", "applied_date", "next_action", "next_action_date", "notes", "link"] as const;
type Editable = (typeof EDITABLE)[number];
const DATE_FIELDS = new Set(["applied_date", "next_action_date"]);

/** Same numbers as the owner's own tracker (jobtracker/followup.py): ask after 10 days, give up after 28. */
export const FOLLOW_UP_DAYS = 10;
export const GHOST_DAYS = 28;

/** A problem to show the user as-is (plain words, in the folder's language). */
export class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function dayNumber(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function slug(text: string): string {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function versionOf(bytes: Uint8Array | null): string {
  if (!bytes) return "none";
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export type Row = Record<string, string> & { _index: number; _deletable: boolean };
export type FollowUp = { index: number; company: string; role: string; kind: "applied" | "ghost" | "interview" | "deadline"; message: string };

export type Board = {
  version: string;
  today: string;
  statuses: StatusDef[];
  rows: Row[];
  followUps: FollowUp[];
};

function shortDate(s: string, today: string, lang: Language): string {
  const [y, m, d] = s.split("-").map(Number);
  return appsText(lang).shortDate(y, m, d, y === Number(today.slice(0, 4)));
}

/** 「該追蹤了」：
 * - 已投遞：10 天以上沒更新 → 問進度；28 天以上 → 可能石沉大海（不需要聯絡人）。
 * - 面試中：約好的日期已過。
 * - 待投遞：截止日（下一步日期）是今天或已經過了。 */
export function followUps(rows: Record<string, string>[], today: string, lang: Language = "zh-TW"): FollowUp[] {
  const T = appsText(lang);
  const out: FollowUp[] = [];
  rows.forEach((r, index) => {
    const status = (r.status || "").trim();
    const base = { index, company: r.company || "", role: r.role || "" };
    if (status === "applied") {
      const ref = [r.last_update, r.applied_date].filter((d) => d && isValidDate(d)).sort().pop();
      if (!ref) return;
      const days = daysBetween(ref, today);
      if (days >= GHOST_DAYS)
        out.push({ ...base, kind: "ghost", message: T.ghost(days) });
      else if (days >= FOLLOW_UP_DAYS)
        out.push({ ...base, kind: "applied", message: T.applied(days) });
    } else if (status === "interview") {
      const d = r.next_action_date;
      if (d && isValidDate(d) && daysBetween(d, today) > 0)
        out.push({ ...base, kind: "interview", message: T.interview(shortDate(d, today, lang)) });
    } else if (status === "todo") {
      const d = r.next_action_date;
      if (!d || !isValidDate(d)) return;
      const late = daysBetween(d, today);
      if (late === 0) out.push({ ...base, kind: "deadline", message: T.deadlineToday(shortDate(d, today, lang)) });
      else if (late > 0)
        out.push({ ...base, kind: "deadline", message: T.deadlinePast(shortDate(d, today, lang)) });
    }
  });
  return out;
}

export class Applications {
  constructor(readonly folder: Folder, readonly today: () => string = () => localToday()) {}

  private queue: Promise<unknown> = Promise.resolve();
  /** Writes run one at a time. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private async load(): Promise<{ doc: CsvDoc; version: string }> {
    const bytes = await this.folder.readBytes(CSV_PATH);
    if (!bytes) return { doc: { header: [...KIT_HEADER], rows: [], bom: false, eol: "\n", trailingNewline: true }, version: "none" };
    return { doc: parseCsv(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)) /* keep the BOM so it is written back */, version: versionOf(bytes) };
  }

  /** The words for this folder (jobhunt.yaml `language`). Read per call: the file may change while the app is open. */
  private async tx() {
    return appsText((await readMarket(this.folder)).language);
  }

  private async save(doc: CsvDoc, T: ReturnType<typeof appsText>): Promise<void> {
    try {
      await this.folder.writeText(CSV_PATH, serializeCsv(doc));
    } catch (e: any) {
      if (e && (e.code === "EBUSY" || e.code === "EPERM" || e.code === "EACCES"))
        throw new UserError(T.fileOpen, 423);
      throw e;
    }
  }

  private checkVersion(current: string, given: unknown, T: ReturnType<typeof appsText>) {
    if (given !== current) throw new UserError(T.changedUnderneath, 409);
  }

  /** Names of what is saved in submitted/: frozen snapshots ("261008-01_2.json" → "261008-01_2") and resume
   * copies the app saved ("2026-10-09_261008-01.html" → "261008-01"). */
  private submittedIds(): string[] {
    const out: string[] = [];
    for (const n of this.folder.list("submitted", "file")) {
      if (/\.json$/i.test(n)) out.push(n.replace(/\.json$/i, ""));
      const m = /^\d{4}-\d{2}-\d{2}_(.+)\.html$/i.exec(n);
      if (m) out.push(m[1]);
    }
    return out;
  }

  private hasSnapshot(jobId: string, submitted: string[], resumeFile = ""): boolean {
    if (/^submitted\//.test(resumeFile.trim())) return true;
    return !!jobId && submitted.some((s) => s === jobId || s.startsWith(jobId + "_"));
  }

  async board(): Promise<Board> {
    const { doc, version } = await this.load();
    const lang = (await readMarket(this.folder)).language;
    const today = this.today();
    const submitted = this.submittedIds();
    const objs = doc.rows.map((r) => rowToObject(doc.header, r));
    const rows = objs.map((o, i) => {
      const full: Row = { ...Object.fromEntries(KIT_HEADER.map((k) => [k, ""])), ...o, _index: i, _deletable: false } as Row;
      full._deletable = !this.hasSnapshot((o.job_id || "").trim(), submitted, o.resume_file || "");
      return full;
    });
    return { version, today, statuses: appsText(lang).statuses, rows, followUps: followUps(objs, today, lang) };
  }

  // ---- job id (AGENTS.md「職缺代號」)
  private async existingJob(company: string, role: string): Promise<string | null> {
    for (const id of this.folder.list("jobs", "dir")) {
      let text: string | null = null;
      try {
        text = await this.folder.readText(`jobs/${id}/jd.md`);
      } catch {
        continue;
      }
      if (!text) continue;
      const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      if (!m) continue;
      try {
        const fm = Bun.YAML.parse(m[1]) as any;
        if (fm && String(fm.company ?? "").trim() === company && String(fm.role ?? "").trim() === role) return id;
      } catch {}
    }
    return null;
  }

  private usedIds(doc: CsvDoc): Set<string> {
    const used = new Set<string>();
    for (const n of this.folder.list("jobs", "dir")) used.add(n);
    for (const dir of ["targets", "checks", "resumes"])
      for (const n of this.folder.list(dir, "file")) used.add(n.replace(/\.[^.]+$/, ""));
    const ji = doc.header.indexOf("job_id");
    if (ji >= 0) for (const r of doc.rows) if (r[ji]) used.add(r[ji].trim());
    return used;
  }

  newJobId(company: string, role: string, used: Set<string>): string {
    let base = slug(`${company} ${role}`);
    if (!base) {
      const t = this.today().replace(/-/g, "").slice(2); // YYMMDD
      let n = 1;
      for (const id of used) {
        const m = new RegExp(`^${t}-(\\d+)`).exec(id);
        if (m) n = Math.max(n, Number(m[1]) + 1);
      }
      base = `${t}-${String(n).padStart(2, "0")}`;
    }
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    return id;
  }

  async add(input: { company?: unknown; role?: unknown; link?: unknown; version?: unknown }): Promise<Board> {
    return this.serial(async () => {
      const T = await this.tx();
      const company = cleanLine(input.company);
      const role = cleanLine(input.role);
      const link = cleanLine(input.link);
      if (!company) throw new UserError(T.needCompany);
      if (!role) throw new UserError(T.needRole);
      if (link && !/^https?:\/\/\S+$/i.test(link)) throw new UserError(T.badLink);
      const { doc, version } = await this.load();
      this.checkVersion(version, input.version, T);
      const ci = doc.header.indexOf("company"), ri = doc.header.indexOf("role");
      if (ci >= 0 && ri >= 0 && doc.rows.some((r) => (r[ci] || "").trim() === company && (r[ri] || "").trim() === role))
        throw new UserError(T.duplicate);

      const jobId = (await this.existingJob(company, role)) ?? this.newJobId(company, role, this.usedIds(doc));
      const values: Record<string, string> = {
        job_id: jobId,
        company,
        role,
        status: "todo",
        last_update: this.today(),
        link,
        resume_version: this.folder.exists(`targets/${jobId}.yaml`) ? `targets/${jobId}` : "",
      };
      // Add only the columns this row needs that the file lacks; never drop or reorder what is there.
      for (const [k, v] of Object.entries(values)) if (v && !doc.header.includes(k)) ensureColumn(doc, k);
      doc.rows.push(doc.header.map((h) => values[h] ?? ""));
      await this.save(doc, T);
      return this.board();
    });
  }

  async update(input: { index?: unknown; job_id?: unknown; version?: unknown; changes?: unknown }): Promise<Board> {
    return this.serial(async () => {
      const T = await this.tx();
      const { doc, version } = await this.load();
      this.checkVersion(version, input.version, T);
      const row = this.pick(doc, input.index, input.job_id, T);
      const changes = (input.changes && typeof input.changes === "object" ? input.changes : {}) as Record<string, unknown>;
      const today = this.today();
      const get = (k: string) => {
        const i = doc.header.indexOf(k);
        return i >= 0 ? row[i] ?? "" : "";
      };
      const set = (k: string, v: string) => {
        const i = ensureColumn(doc, k);
        row[i] = v;
      };

      const next: Partial<Record<Editable, string>> = {};
      for (const [k, raw] of Object.entries(changes)) {
        if (!(EDITABLE as readonly string[]).includes(k)) throw new UserError(T.fieldLocked);
        const v = cleanLine(raw);
        if ((k === "company" || k === "role") && !v) throw new UserError(k === "company" ? T.emptyCompany : T.emptyRole);
        if (k === "status" && !STATUS_CODES.has(v)) throw new UserError(T.badStatus);
        if (DATE_FIELDS.has(k) && v && !isValidDate(v)) throw new UserError(T.badDate);
        if (k === "link" && v && !/^https?:\/\/\S+$/i.test(v)) throw new UserError(T.badLink);
        if (k === "link" && !doc.header.includes("link") && !v) continue; // nothing to store, don't add the column
        next[k as Editable] = v;
      }

      const statusChanged = next.status !== undefined && next.status !== get("status");
      if (statusChanged && next.status === "applied" && !(next.applied_date ?? get("applied_date"))) next.applied_date = today;

      const writes: Record<string, string> = {};
      for (const [k, v] of Object.entries(next)) if (v !== get(k)) writes[k] = v as string;
      if (!Object.keys(writes).length) return this.board();
      // Only a status change restarts the clock (like the owner's tracker): adding a note or a date must not hide
      // the "no news for N days" reminder.
      if (statusChanged) writes.last_update = today;
      // Columns the file lacks are appended in the kit's order.
      for (const k of KIT_HEADER) if (k in writes) set(k, writes[k]);
      await this.save(doc, T);
      return this.board();
    });
  }

  async remove(input: { index?: unknown; job_id?: unknown; version?: unknown }): Promise<Board> {
    return this.serial(async () => {
      const T = await this.tx();
      const { doc, version } = await this.load();
      this.checkVersion(version, input.version, T);
      const row = this.pick(doc, input.index, input.job_id, T);
      const ji = doc.header.indexOf("job_id");
      const jobId = ji >= 0 ? (row[ji] || "").trim() : "";
      const fi = doc.header.indexOf("resume_file");
      if (this.hasSnapshot(jobId, this.submittedIds(), fi >= 0 ? row[fi] || "" : ""))
        throw new UserError(T.keepForSnapshot, 403);
      doc.rows.splice(doc.rows.indexOf(row), 1);
      await this.save(doc, T);
      return this.board();
    });
  }

  // ---- 「我投了這份，存一份」：resumes/<id>.html → submitted/<今天>_<id>.html，並記在進度表那一列的 resume_file

  /** The row this resume belongs to: job_id = id, otherwise resume_version = targets/<id>. */
  private rowForResume(doc: CsvDoc, id: string, T: ReturnType<typeof appsText>): number {
    const col = (k: string) => doc.header.indexOf(k);
    const ji = col("job_id"), vi = col("resume_version");
    const byJob = ji >= 0 ? doc.rows.flatMap((r, i) => ((r[ji] || "").trim() === id ? [i] : [])) : [];
    const hits = byJob.length ? byJob : vi >= 0 ? doc.rows.flatMap((r, i) => ((r[vi] || "").trim() === `targets/${id}` ? [i] : [])) : [];
    if (!hits.length) throw new UserError(T.noRowForResume, 404);
    if (hits.length > 1) throw new UserError(T.manyRowsForResume, 409);
    return hits[0];
  }

  private async archivePlan(input: { id?: unknown }, T: ReturnType<typeof appsText>) {
    const id = typeof input.id === "string" ? input.id : "";
    if (!/^[^/\\:*?"<>|]+$/.test(id) || id.includes("\u0000") || id.startsWith(".") || id.length > 120) throw new UserError(T.noResumeFile, 404);
    const from = `resumes/${id}.html`;
    if (!this.folder.exists(from)) throw new UserError(T.noResumeFileAskAi, 404);
    const { doc, version } = await this.load();
    const index = this.rowForResume(doc, id, T);
    const o = rowToObject(doc.header, doc.rows[index]);
    const to = `submitted/${this.today()}_${id}.html`;
    const existing = await this.folder.readArchived(to);
    return { id, from, to, doc, version, index, row: o, existing };
  }

  /** What the button will do; writes nothing. */
  async archivePreview(input: { id?: unknown }) {
    const p = await this.archivePlan(input, await this.tx());
    return {
      id: p.id, from: p.from, to: p.to, index: p.index, job_id: p.row.job_id || "",
      company: p.row.company || "", role: p.row.role || "", status: p.row.status || "",
      already: (p.row.resume_file || "").trim(), exists: !!p.existing, version: p.version,
    };
  }

  async archive(input: { id?: unknown; to?: unknown; version?: unknown }): Promise<{ saved: string; board: Board }> {
    return this.serial(async () => {
      const T = await this.tx();
      const p = await this.archivePlan(input, T);
      if (input.to !== p.to) throw new UserError(T.dateMoved, 409);
      this.checkVersion(p.version, input.version, T);
      const already = (p.row.resume_file || "").trim();
      if (already) throw new UserError(T.alreadyHasCopy(already), 409);
      const current = await this.folder.readBytes(p.from);
      if (p.existing) {
        // Same bytes: an earlier save copied the file but couldn't write the applications file. Only record it.
        if (!current || !sameBytes(p.existing, current)) throw new UserError(T.savedToday(p.to), 409);
      } else {
        try {
          this.folder.archiveCopy(p.from, p.to);
        } catch (e: any) {
          if (e && e.code === "EEXIST") throw new UserError(T.savedToday(p.to), 409);
          throw e;
        }
      }
      const fi = ensureColumn(p.doc, "resume_file");
      p.doc.rows[p.index][fi] = p.to;
      // Saving the sent copy means it was sent: a 待投遞 row becomes 已投遞 (owner decision 2026-10-09).
      // Rows already further along (筆試、面試…) are never moved back.
      if ((p.row.status || "").trim() === "todo") {
        const today = this.today();
        p.doc.rows[p.index][ensureColumn(p.doc, "status")] = "applied";
        const ai = ensureColumn(p.doc, "applied_date");
        if (!(p.doc.rows[p.index][ai] || "").trim()) p.doc.rows[p.index][ai] = today;
        p.doc.rows[p.index][ensureColumn(p.doc, "last_update")] = today;
      }
      try {
        await this.save(p.doc, T);
      } catch (e: any) {
        const why = e instanceof UserError ? e.message : "";
        throw new UserError(T.savedButNotRecorded(p.to, why), e instanceof UserError ? e.status : 500);
      }
      return { saved: p.to, board: await this.board() };
    });
  }

  private pick(doc: CsvDoc, index: unknown, jobId: unknown, T: ReturnType<typeof appsText>): string[] {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= doc.rows.length)
      throw new UserError(T.rowGone, 409);
    const row = doc.rows[index];
    const ji = doc.header.indexOf("job_id");
    if (ji >= 0 && typeof jobId === "string" && (row[ji] || "") !== jobId)
      throw new UserError(T.rowGone, 409);
    return row;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function cleanLine(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
}
