// One-click update of the one-for-all kit: its own zip name, the new .kit, and the installed rules of the chosen mode follow
// the new .kit (AGENTS.md, playbooks, both skills folders); the person's files and the setup rules of an unchosen folder too.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleKit } from "../kitbuild.ts";
import { installMode } from "../src/kitinstall.ts";
import { applyUpdate, installedFrom, prepareUpdate, replaceable, UpdateFailure } from "../src/selfupdate.ts";
import { assetName } from "../src/update.ts";
import { cleanup } from "./helpers.ts";
import { fakeGitHub, snapshot, walk } from "./updatekit.ts";
import { makeZip, type ZipInput } from "./ziptools.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

function userKit(mode: ("us" | "tw")[] | null): string {
  const base = mkdtempSync(join(tmpdir(), "jobhunt-up1-"));
  dirs.push(base);
  const d = join(base, "job-hunt-kit");
  assembleKit(d);
  writeFileSync(join(d, "jobhunt.exe"), "OLD PROGRAM");
  if (mode) installMode(d, mode);
  writeFileSync(join(d, "resume.yaml"), "basics:\n  name: Real Person\n");
  writeFileSync(join(d, "me", "stories", "S-001.md"), "confirmed story\n");
  return d;
}

/** The next release: the same kit with a new line in every rule set's AGENTS.md and one new playbook in each set. */
function nextZip(): Uint8Array {
  const base = mkdtempSync(join(tmpdir(), "jobhunt-up1z-"));
  dirs.push(base);
  const d = join(base, "src");
  assembleKit(d);
  const entries: ZipInput[] = [];
  for (const f of walk(d)) {
    let data: string | Uint8Array = readFileSync(join(d, f));
    if (/^\.kit\/[a-z]+\/AGENTS\.md$/.test(f) || f === "AGENTS.md") data = readFileSync(join(d, f), "utf-8") + "\nNEW RULE\n";
    entries.push({ name: `job-hunt-kit/${f}`, data });
  }
  for (const m of ["us", "tw", "both"]) entries.push({ name: `job-hunt-kit/.kit/${m}/playbooks/brand-new.md`, data: `new ${m}\n` });
  entries.push({ name: "job-hunt-kit/resume.yaml", data: "BLANK TEMPLATE\n" });
  entries.push({ name: "job-hunt-kit/jobhunt.exe", data: "NEW PROGRAM" });
  return makeZip(entries);
}

test("asset and paths: the one-for-all kit has its own zip; installed rules come from .kit/<mode>", () => {
  expect(assetName("one", "win32", "x64")).toBe("jobhunt-kit-windows.zip");
  expect(assetName("one", "darwin", "arm64")).toBe("jobhunt-kit-mac-apple.zip");
  expect(replaceable(".kit/both/playbooks/taiwan.md", "one", "jobhunt.exe")).toBe(true);
  expect(replaceable("playbooks/taiwan.md", "one", "jobhunt.exe")).toBe(false); // only through installedFrom
  expect(replaceable(".claude/skills/start/SKILL.md", "one", "jobhunt.exe")).toBe(false);
  expect(replaceable(".claude/settings.json", "one", "jobhunt.exe")).toBe(true);
  expect(replaceable("resume.yaml", "one", "jobhunt.exe")).toBe(false);
  expect(installedFrom(".kit/both/AGENTS.md", "both")).toEqual(["AGENTS.md"]);
  expect(installedFrom(".kit/both/skills/start/SKILL.md", "both")).toEqual([".claude/skills/start/SKILL.md", ".agents/skills/start/SKILL.md"]);
  expect(installedFrom(".kit/us/AGENTS.md", "both")).toEqual([]);
});

test("a folder set to both: the update brings the new .kit and re-installs both's rules; the person's files stay byte for byte", async () => {
  const d = userKit(["us", "tw"]);
  const mine = snapshot(d);
  const gh = fakeGitHub(nextZip(), { asset: "jobhunt-kit-windows.zip" });
  const p = await prepareUpdate({ dir: d, version: "0.9", platform: "win32", arch: "x64", fetch: gh.fetch as any });
  const paths = p.files.map((f) => f.path);
  expect(paths).toContain("AGENTS.md");
  expect(paths).toContain("playbooks/brand-new.md");
  expect(paths).toContain(".kit/us/playbooks/brand-new.md");
  expect(paths).not.toContain("resume.yaml");
  applyUpdate(d, p, { platform: "win32", runVersion: () => "0.10" });
  expect(readFileSync(join(d, "AGENTS.md"), "utf-8")).toBe(readFileSync(join(d, ".kit", "both", "AGENTS.md"), "utf-8"));
  expect(readFileSync(join(d, "AGENTS.md"), "utf-8")).toContain("## Taiwan too");
  expect(readFileSync(join(d, "AGENTS.md"), "utf-8").trimEnd().endsWith("NEW RULE")).toBe(true);
  expect(readFileSync(join(d, "playbooks", "brand-new.md"), "utf-8")).toBe("new both\n");
  for (const f of ["resume.yaml", "me/stories/S-001.md", "me/mode.yaml"]) expect(snapshot(d)[f]).toBe(mine[f]);
});

test("a folder that has not chosen: the new setup rules, nothing installed", async () => {
  const d = userKit(null);
  const gh = fakeGitHub(nextZip(), { asset: "jobhunt-kit-windows.zip" });
  const p = await prepareUpdate({ dir: d, version: "0.9", platform: "win32", arch: "x64", fetch: gh.fetch as any });
  applyUpdate(d, p, { platform: "win32", runVersion: () => "0.10" });
  expect(readFileSync(join(d, "AGENTS.md"), "utf-8")).toContain("Job-search folder: setup");
  expect(readFileSync(join(d, "AGENTS.md"), "utf-8").trimEnd().endsWith("NEW RULE")).toBe(true);
  expect(p.files.some((f) => f.path.startsWith("playbooks/"))).toBe(false);
});

test("an old one-market zip is not a one-for-all kit: refused", async () => {
  const d = userKit(["us"]);
  const zip = makeZip([
    { name: "job-hunt-kit/jobhunt.yaml", data: "market: us\n" },
    { name: "job-hunt-kit/.kit/us/AGENTS.md", data: "x" },
    { name: "job-hunt-kit/jobhunt.exe", data: "NEW" },
  ]);
  const gh = fakeGitHub(zip, { asset: "jobhunt-kit-windows.zip" });
  await expect(prepareUpdate({ dir: d, version: "0.9", platform: "win32", arch: "x64", fetch: gh.fetch as any })).rejects.toThrow(UpdateFailure);
});
