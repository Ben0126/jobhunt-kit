// Resume version numbers: V<major>.<minor>.<patch>, the same rules as the owner's own tracker
// (jobhunt/resume/versioning.py, jobtracker/build_pdf.py):
//
//   major  the `major` of the resume's variant in resume.yaml (a tailored resume follows its base_variant), so
//          "V2…" going to a job whose resume is a V1 line means the wrong file was grabbed.
//   minor  +1 when the words on the page (links included) changed.
//   patch  +1 when the words are the same and only the template / layout changed.
//   Same content as an earlier version -> that version's number again: two companies with the same number got the
//   same resume.
//
// A number is only REGISTERED (data/resume_versions.csv) when the resume is sent: "I applied, save a copy" does it,
// next to the copy and the row in the tracker. Until then the page shows the number the resume would get, as
// "V1.2.0-draft", and nothing is written, so editing and looking ten times does not use up ten numbers.
import { createHash } from "node:crypto";
import { parseCsv, rowToObject, serializeCsv, type CsvDoc } from "./csv.ts";
import type { Folder } from "./folder.ts";
import { stripComments, stylesOf, visibleLines } from "./htmltext.ts";

export const REGISTRY = "data/resume_versions.csv";
export const REGISTRY_HEADER = ["resume", "version", "text_sha", "layout_sha", "registered", "commit"];

export type RegRow = { resume: string; version: string; text_sha: string; layout_sha: string; registered: string; commit: string };
export type Fingerprint = { text: string; layout: string };

const sha = (parts: string[]) => createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);

/** (text hash, layout hash) of what is visible on the resume page. Comments, scripts and the yellow print tip are not part
 * of it (visibleLines skips them), so they never change a number. */
export function fingerprint(html: string): Fingerprint {
  const src = stripComments(html);
  const links = [...src.matchAll(/<a\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => m[1] ?? m[2] ?? m[3] ?? "").sort();
  const text = [...visibleLines(html).map((l) => l.text), ...links];
  // layout: which template's style the page carries and the shape of the markup (tag + class of every element)
  const markup = src
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<div\b[^>]*\bprint-tip\b[^>]*>[\s\S]*?<\/div\s*>/gi, ""); // screen-only parts are not the layout
  const shape = [...markup.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)]
    .filter((m) => !["script", "style", "title", "meta", "link", "head", "html"].includes(m[1].toLowerCase()))
    .map((m) => `${m[1].toLowerCase()}.${/\sclass\s*=\s*["']?([^"'>]*)/i.exec(` ${m[2]}`)?.[1]?.trim().replace(/\s+/g, ".") ?? ""}`);
  return { text: sha(text), layout: sha([...stylesOf(html), ...shape]) };
}

export function parseVersion(v: string): [number, number, number] {
  const m = /^V(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`bad version ${JSON.stringify(v)}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** history: this resume's registered rows, oldest first -> the version this content gets and whether it is a new number. */
export function pickVersion(history: RegRow[], major: number, text: string, layout: string): { version: string; isNew: boolean } {
  const rows = history.filter((r) => /^V\d+\.\d+\.\d+$/.test(r.version) && parseVersion(r.version)[0] === major);
  for (const r of rows) if (r.text_sha === text && r.layout_sha === layout) return { version: r.version, isNew: false };
  if (!rows.length) return { version: `V${major}.1.0`, isNew: true };
  const latest = rows[rows.length - 1];
  const [, minor] = parseVersion(latest.version);
  if (latest.text_sha === text) {
    const patches = rows.map((r) => parseVersion(r.version)).filter((v) => v[1] === minor).map((v) => v[2]);
    return { version: `V${major}.${minor}.${Math.max(...patches) + 1}`, isNew: true };
  }
  return { version: `V${major}.${Math.max(...rows.map((r) => parseVersion(r.version)[1])) + 1}.0`, isNew: true };
}

/** The `major` of a variant in resume.yaml; when it has none, its place in the list (1, 2, ...), like the other tools. */
export function majorOf(resume: any, variant: string): number | null {
  const variants = resume && typeof resume === "object" ? resume.variants : null;
  if (!variants || typeof variants !== "object" || !(variant in variants)) return null;
  const m = Number(variants[variant]?.major);
  return Number.isInteger(m) && m > 0 ? m : Object.keys(variants).indexOf(variant) + 1;
}

export async function readRegistry(folder: Folder): Promise<RegRow[]> {
  let text: string | null = null;
  try {
    text = await folder.readText(REGISTRY);
  } catch {}
  if (!text) return [];
  const doc = parseCsv(text);
  return doc.rows.map((r) => rowToObject(doc.header, r) as unknown as RegRow);
}

export const resumeKey = (id: string) => `targets/${id}`;

export type VersionInfo = { version: string; isNew: boolean; major: number; fingerprint: Fingerprint };

/** The number this resume file has (a registered one) or would get (a new one, to show as a draft). null: it has no
 * variant with a major (no targets file, broken resume.yaml). */
export async function versionFor(folder: Folder, id: string, html: string): Promise<VersionInfo | null> {
  let resume: any = null;
  let target: any = null;
  try {
    resume = await folder.readYaml("resume.yaml");
    for (const ext of ["yaml", "yml"]) {
      try {
        target = await folder.readYaml(`targets/${id}.${ext}`);
        break;
      } catch {}
    }
  } catch {
    return null;
  }
  const variant = target && typeof target === "object" ? String(target.base_variant ?? "") : "";
  const major = variant ? majorOf(resume, variant) : null;
  if (!major) return null;
  const fp = fingerprint(html);
  const history = (await readRegistry(folder)).filter((r) => r.resume === resumeKey(id));
  const p = pickVersion(history, major, fp.text, fp.layout);
  return { ...p, major, fingerprint: fp };
}

/** Add one row to the registry (creating it with its header). Only the archive step calls this. */
export async function register(folder: Folder, row: RegRow): Promise<void> {
  let doc: CsvDoc;
  let text: string | null = null;
  try {
    text = await folder.readText(REGISTRY);
  } catch {}
  if (text) doc = parseCsv(text);
  else doc = parseCsv(REGISTRY_HEADER.join(",") + "\n");
  doc.rows.push(doc.header.map((h) => (row as Record<string, string>)[h] ?? ""));
  await folder.writeText(REGISTRY, serializeCsv(doc));
}
