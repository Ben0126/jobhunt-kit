// 申請進度：讀寫 data/applications.csv 的規則（和 playbooks/log-application.md 一致）。
import { createHash } from "node:crypto";
import { ensureColumn, parseCsv, rowToObject, serializeCsv, type CsvDoc } from "./csv.ts";
import { Folder } from "./folder.ts";

export const CSV_PATH = "data/applications.csv";

/** Header of the kit's applications.csv (jobhunt/scaffold/workspace-general/data/applications.csv). */
export const KIT_HEADER = [
  "job_id", "company", "role", "track", "tier", "resume_version", "status", "applied_date", "last_update",
  "next_action", "next_action_date", "contact", "source", "notes", "resume_file", "resume_commit", "resume_rev", "link",
];

export const STATUSES: { code: string; label: string }[] = [
  { code: "todo", label: "待投遞" },
  { code: "applied", label: "已投遞" },
  { code: "oa", label: "筆試測驗" },
  { code: "interview", label: "面試中" },
  { code: "offer", label: "錄取" },
  { code: "rejected", label: "未錄取" }, // not 「拒絕」: it could also read as "I turned them down" (that is withdrawn)
  { code: "ghosted", label: "無回應" },
  { code: "withdrawn", label: "放棄" },
];
const STATUS_CODES = new Set(STATUSES.map((s) => s.code));

export const EDITABLE = ["company", "role", "status", "applied_date", "next_action", "next_action_date", "notes", "link"] as const;
type Editable = (typeof EDITABLE)[number];
const DATE_FIELDS = new Set(["applied_date", "next_action_date"]);

export const FOLLOW_UP_DAYS = 7;

/** A problem to show the user as-is (plain Chinese). */
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
export type FollowUp = { index: number; company: string; role: string; kind: "applied" | "interview"; message: string };

export type Board = {
  version: string;
  today: string;
  statuses: typeof STATUSES;
  rows: Row[];
  followUps: FollowUp[];
};

function shortDate(s: string, today: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return y === Number(today.slice(0, 4)) ? `${m}/${d}` : `${y}/${m}/${d}`;
}

/** 「該追蹤了」：投了 7 天以上沒更新的「已投遞」；面試日期已過的「面試中」。 */
export function followUps(rows: Record<string, string>[], today: string): FollowUp[] {
  const out: FollowUp[] = [];
  rows.forEach((r, index) => {
    const status = (r.status || "").trim();
    if (status === "applied") {
      const ref = [r.last_update, r.applied_date].filter((d) => d && isValidDate(d)).sort().pop();
      if (!ref) return;
      const days = daysBetween(ref, today);
      if (days >= FOLLOW_UP_DAYS)
        out.push({
          index, company: r.company || "", role: r.role || "", kind: "applied",
          message: `已經 ${days} 天沒有消息。可以寫信問進度，或改成「無回應」。`,
        });
    } else if (status === "interview") {
      const d = r.next_action_date;
      if (d && isValidDate(d) && daysBetween(d, today) > 0)
        out.push({
          index, company: r.company || "", role: r.role || "", kind: "interview",
          message: `約好的日期（${shortDate(d, today)}）已經過了。結果如何？記得更新狀態。`,
        });
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

  private async save(doc: CsvDoc): Promise<void> {
    try {
      await this.folder.writeText(CSV_PATH, serializeCsv(doc));
    } catch (e: any) {
      if (e && (e.code === "EBUSY" || e.code === "EPERM" || e.code === "EACCES"))
        throw new UserError("進度表正被別的程式（例如 Excel）打開，請先關掉再試一次。", 423);
      throw e;
    }
  }

  private checkVersion(current: string, given: unknown) {
    if (given !== current) throw new UserError("進度表剛剛被改過（可能是 AI 改的）。畫面已經更新，請再改一次。", 409);
  }

  /** Names (without .json) of frozen snapshots in submitted/, e.g. "261008-01_2". */
  private submittedIds(): string[] {
    return this.folder.list("submitted", "file").filter((n) => /\.json$/i.test(n)).map((n) => n.replace(/\.json$/i, ""));
  }

  private hasSnapshot(jobId: string, submitted: string[]): boolean {
    return !!jobId && submitted.some((s) => s === jobId || s.startsWith(jobId + "_"));
  }

  async board(): Promise<Board> {
    const { doc, version } = await this.load();
    const today = this.today();
    const submitted = this.submittedIds();
    const objs = doc.rows.map((r) => rowToObject(doc.header, r));
    const rows = objs.map((o, i) => {
      const full: Row = { ...Object.fromEntries(KIT_HEADER.map((k) => [k, ""])), ...o, _index: i, _deletable: false } as Row;
      full._deletable = !this.hasSnapshot((o.job_id || "").trim(), submitted);
      return full;
    });
    return { version, today, statuses: STATUSES, rows, followUps: followUps(objs, today) };
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
      const company = cleanLine(input.company);
      const role = cleanLine(input.role);
      const link = cleanLine(input.link);
      if (!company) throw new UserError("請填公司名稱。");
      if (!role) throw new UserError("請填職稱。");
      if (link && !/^https?:\/\/\S+$/i.test(link)) throw new UserError("職缺網址要用 http:// 或 https:// 開頭。");
      const { doc, version } = await this.load();
      this.checkVersion(version, input.version);
      const ci = doc.header.indexOf("company"), ri = doc.header.indexOf("role");
      if (ci >= 0 && ri >= 0 && doc.rows.some((r) => (r[ci] || "").trim() === company && (r[ri] || "").trim() === role))
        throw new UserError("清單裡已經有這家公司的這個職缺了。");

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
      await this.save(doc);
      return this.board();
    });
  }

  async update(input: { index?: unknown; job_id?: unknown; version?: unknown; changes?: unknown }): Promise<Board> {
    return this.serial(async () => {
      const { doc, version } = await this.load();
      this.checkVersion(version, input.version);
      const row = this.pick(doc, input.index, input.job_id);
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
        if (!(EDITABLE as readonly string[]).includes(k)) throw new UserError("有欄位不能在這裡改。");
        const v = cleanLine(raw);
        if ((k === "company" || k === "role") && !v) throw new UserError(k === "company" ? "公司名稱不能空白。" : "職稱不能空白。");
        if (k === "status" && !STATUS_CODES.has(v)) throw new UserError("狀態不對，請從選單選。");
        if (DATE_FIELDS.has(k) && v && !isValidDate(v)) throw new UserError("日期格式不對，請用日期選單選。");
        if (k === "link" && v && !/^https?:\/\/\S+$/i.test(v)) throw new UserError("職缺網址要用 http:// 或 https:// 開頭。");
        if (k === "link" && !doc.header.includes("link") && !v) continue; // nothing to store, don't add the column
        next[k as Editable] = v;
      }

      const statusChanged = next.status !== undefined && next.status !== get("status");
      if (statusChanged && next.status === "applied" && !(next.applied_date ?? get("applied_date"))) next.applied_date = today;
      let datesChanged = false;
      for (const k of DATE_FIELDS) if (next[k as Editable] !== undefined && next[k as Editable] !== get(k)) datesChanged = true;

      const writes: Record<string, string> = {};
      for (const [k, v] of Object.entries(next)) if (v !== get(k)) writes[k] = v as string;
      if (!Object.keys(writes).length) return this.board();
      if (statusChanged || datesChanged) writes.last_update = today;
      // Columns the file lacks are appended in the kit's order.
      for (const k of KIT_HEADER) if (k in writes) set(k, writes[k]);
      await this.save(doc);
      return this.board();
    });
  }

  async remove(input: { index?: unknown; job_id?: unknown; version?: unknown }): Promise<Board> {
    return this.serial(async () => {
      const { doc, version } = await this.load();
      this.checkVersion(version, input.version);
      const row = this.pick(doc, input.index, input.job_id);
      const ji = doc.header.indexOf("job_id");
      const jobId = ji >= 0 ? (row[ji] || "").trim() : "";
      if (this.hasSnapshot(jobId, this.submittedIds()))
        throw new UserError("這一筆已經存過投遞當時的履歷，不能刪。不想再看到它，可以把狀態改成「放棄」。", 403);
      doc.rows.splice(doc.rows.indexOf(row), 1);
      await this.save(doc);
      return this.board();
    });
  }

  private pick(doc: CsvDoc, index: unknown, jobId: unknown): string[] {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= doc.rows.length)
      throw new UserError("找不到這一筆，畫面已經更新，請再試一次。", 409);
    const row = doc.rows[index];
    const ji = doc.header.indexOf("job_id");
    if (ji >= 0 && typeof jobId === "string" && (row[ji] || "") !== jobId)
      throw new UserError("找不到這一筆，畫面已經更新，請再試一次。", 409);
    return row;
  }
}

function cleanLine(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
}
