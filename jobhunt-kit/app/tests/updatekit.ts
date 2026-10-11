// Shared by the one-click update tests: a user's folder made from the real kit, a release zip, and a fake GitHub.
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyTemp } from "./helpers.ts";
import { makeZip, type ZipInput } from "./ziptools.ts";

export const SCAFFOLD = join(import.meta.dir, "..", "..", "jobhunt", "scaffold");

/** Every file under dir, relative, forward slashes. */
export function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else out.push(r);
  }
  return out.sort();
}
export const snapshot = (dir: string) => Object.fromEntries(walk(dir).filter((f) => !f.startsWith(".jobhunt/")).map((f) => [f, readFileSync(join(dir, f)).toString("base64")]));
export const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf-8");

/** A user's US folder: the kit plus their own data and an old "program". */
export function userFolder(kit = "workspace-us", program = "jobhunt.exe"): string {
  const dir = emptyTemp();
  cpSync(join(SCAFFOLD, kit), dir, { recursive: true });
  writeFileSync(join(dir, program), "OLD PROGRAM");
  writeFileSync(join(dir, "resume.yaml"), "basics:\n  name: Real Person\n");
  writeFileSync(join(dir, "data", "applications.csv"), "id,company\n261001-01,Acme\n");
  mkdirSync(join(dir, "me", "stories"), { recursive: true });
  writeFileSync(join(dir, "me", "stories", "S-001.md"), "confirmed story\n");
  mkdirSync(join(dir, "jobs", "261001-01"), { recursive: true });
  writeFileSync(join(dir, "jobs", "261001-01", "posting.md"), "posting\n");
  writeFileSync(join(dir, ".claude", "settings.local.json"), '{"mine":true}\n');
  // the user switched the reminder off and has no `kit_format` line (an older folder)
  writeFileSync(join(dir, "jobhunt.yaml"), read(dir, "jobhunt.yaml").replace(/^kit_format:.*\n/m, "").replace("update_check: true", "update_check: false"));
  return dir;
}

/** The release zip: the same kit with a changed AGENTS.md, one new playbook, a new program, blank user-data templates,
 * and a jobhunt.yaml with one new setting. */
export function releaseZip(kit = "workspace-us", top = "job-hunt-us", program = "jobhunt.exe", extra: ZipInput[] = []): Uint8Array {
  const src = join(SCAFFOLD, kit);
  const entries: ZipInput[] = [];
  for (const f of walk(src)) {
    let data: string | Uint8Array = readFileSync(join(src, f));
    if (f === "AGENTS.md") data = readFileSync(join(src, f), "utf-8") + "\nNEW RULE\n";
    if (f === "resume.yaml" || f === "data/applications.csv") data = "BLANK TEMPLATE\n";
    if (f === "jobhunt.yaml") data = readFileSync(join(src, f), "utf-8") + "\n# a new setting\nnew_setting: 7\n";
    entries.push({ name: `${top}/${f}`, data });
  }
  entries.push({ name: `${top}/playbooks/brand-new.md`, data: "new playbook\n" });
  entries.push({ name: `${top}/${program}`, data: "NEW PROGRAM" });
  return makeZip([...entries, ...extra]);
}

export function fakeGitHub(zip: Uint8Array, o: { tag?: string; asset?: string; digest?: string | null; status?: number } = {}) {
  const calls: string[] = [];
  const digest = o.digest === undefined ? "sha256:" + new Bun.CryptoHasher("sha256").update(zip).digest("hex") : o.digest;
  const fetch = async (url: string) => {
    calls.push(url);
    if (url.includes("/releases/latest"))
      return Response.json({ tag_name: o.tag ?? "v0.10", draft: false, prerelease: false, assets: [{ name: o.asset ?? "job-hunt-us-windows.zip", size: zip.length, digest }] });
    if (o.status) return new Response("no", { status: o.status });
    return new Response(zip);
  };
  return { fetch, calls };
}

