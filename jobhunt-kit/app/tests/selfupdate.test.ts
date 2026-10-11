// One-click update (src/selfupdate.ts): only the program and the instruction files are replaced, the user's files are
// never touched (byte for byte), every failure puts the folder back exactly as it was, and undo restores the backup.
// GitHub is a fake fetch; the "program" is a small text file and `--version` is a stand-in function.
import { afterEach, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyUpdate, cleanupAfterUpdate, mergeSettings, planView, prepareUpdate, readBackup, replaceable, undoUpdate, UpdateFailure,
  type Prepared,
} from "../src/selfupdate.ts";
import { cleanup } from "./helpers.ts";
import { fakeGitHub, read, releaseZip, SCAFFOLD, snapshot, userFolder as makeUserFolder, walk } from "./updatekit.ts";

const dirs: string[] = [];
const userFolder = (kit?: string, program?: string) => {
  const d = makeUserFolder(kit, program);
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      chmodSync(join(d, "playbooks"), 0o755);
    } catch {}
    for (const f of walk(d)) {
      try {
        chmodSync(join(d, f), 0o644);
      } catch {}
    }
    cleanup(d);
  }
});

const env = (dir: string, fetch: any, version = "0.9") => ({ dir, version, platform: "win32", arch: "x64", fetch });
const okVersion = () => "0.10";
const USER_FILES = ["resume.yaml", "data/applications.csv", "me/stories/S-001.md", "jobs/261001-01/posting.md", ".claude/settings.local.json"];

async function failure(p: Promise<unknown> | (() => unknown)): Promise<UpdateFailure> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof UpdateFailure) return e;
    throw e;
  }
  throw new Error("expected an UpdateFailure");
}

test("which paths may ever be replaced", () => {
  expect(replaceable("AGENTS.md", "us", "jobhunt.exe")).toBe(true);
  expect(replaceable("playbooks/x.md", "us", "jobhunt.exe")).toBe(true);
  expect(replaceable(".claude/skills/a/SKILL.md", "tw", "jobhunt.exe")).toBe(true);
  expect(replaceable("jobhunt.exe", "us", "jobhunt.exe")).toBe(true);
  expect(replaceable("開始使用.md", "tw", "jobhunt.exe")).toBe(true);
  for (const bad of ["resume.yaml", "data/applications.csv", "me/profile.md", "profiles/linkedin.md", "jobs/a/b.md", "submitted/a.html",
    ".claude/settings.local.json", "jobhunt-mac-arm64", "playbooks/../resume.yaml", "playbooks/", "playbooks\\x.md", "/AGENTS.md", "開始使用.md", "C:/x"])
    expect([bad, replaceable(bad, "us", "jobhunt.exe")]).toEqual([bad, false]);
});

test("the list shows only changed program and instruction files; the blank templates in the zip are never picked", async () => {
  const dir = userFolder();
  const gh = fakeGitHub(releaseZip());
  const p = await prepareUpdate(env(dir, gh.fetch));
  expect(gh.calls).toEqual([
    "https://api.github.com/repos/Ben0126/jobhunt-kit/releases/latest",
    "https://github.com/Ben0126/jobhunt-kit/releases/download/v0.10/job-hunt-us-windows.zip",
  ]);
  const view = planView(p);
  expect(view.from).toBe("0.9");
  expect(view.to).toBe("v0.10");
  expect(view.files).toEqual([
    { path: "AGENTS.md", isNew: false },
    { path: "playbooks/brand-new.md", isNew: true },
    { path: "jobhunt.exe", isNew: false },
  ]);
  expect(view.settingsAdded).toEqual(["kit_format", "new_setting"]);
});

test("update: user files byte-identical, instruction files and program replaced, old ones backed up", async () => {
  const dir = userFolder();
  const before = snapshot(dir);
  const p = await prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch));
  expect(snapshot(dir)).toEqual(before); // preparing writes nothing
  const ran: string[] = [];
  applyUpdate(dir, p, { platform: "win32", runVersion: (exe) => (ran.push(exe), "0.10") });
  expect(ran).toEqual([join(dir, "jobhunt.exe")]);
  for (const f of USER_FILES) expect([f, read(dir, f)]).toEqual([f, Buffer.from(before[f], "base64").toString("utf-8")]);
  expect(read(dir, "AGENTS.md")).toEndWith("\nNEW RULE\n");
  expect(read(dir, "playbooks/brand-new.md")).toBe("new playbook\n");
  expect(read(dir, "jobhunt.exe")).toBe("NEW PROGRAM");
  // jobhunt.yaml: the user's `update_check: false` stays, the missing settings are added
  const yaml = Bun.YAML.parse(read(dir, "jobhunt.yaml")) as any;
  expect(yaml.update_check).toBe(false);
  expect(yaml.new_setting).toBe(7);
  expect(yaml.kit_format).toBe("folder-v0");
  // Windows: the running program was renamed aside, not overwritten
  expect(read(dir, "jobhunt.exe.old")).toBe("OLD PROGRAM");
  // backup of what was replaced
  expect(read(dir, ".jobhunt/backup/files/jobhunt.exe")).toBe("OLD PROGRAM");
  expect(read(dir, ".jobhunt/backup/files/AGENTS.md")).toBe(Buffer.from(before["AGENTS.md"], "base64").toString("utf-8"));
  expect(readBackup(dir)?.to).toBe("v0.10");
  // nothing staged is left behind
  expect(walk(dir).filter((f) => f.endsWith(".jobhunt-new"))).toEqual([]);
  cleanupAfterUpdate(dir, "jobhunt.exe");
  expect(existsSync(join(dir, "jobhunt.exe.old"))).toBe(false);
});

test("Mac: the new program is made executable", async () => {
  if (process.platform === "win32") return; // no exec bit on Windows
  const dir = userFolder("workspace-us", "jobhunt-mac-arm64");
  const gh = fakeGitHub(releaseZip("workspace-us", "job-hunt-us", "jobhunt-mac-arm64"), { asset: "job-hunt-us-mac-apple.zip" });
  const p = await prepareUpdate({ dir, version: "0.9", platform: "darwin", arch: "arm64", fetch: gh.fetch });
  applyUpdate(dir, p, { platform: "darwin", runVersion: okVersion });
  expect(statSync(join(dir, "jobhunt-mac-arm64")).mode & 0o111).toBe(0o111);
  expect(existsSync(join(dir, "jobhunt-mac-arm64.old"))).toBe(false);
});

test("Taiwan folder: Taiwan zip, Chinese file names", async () => {
  const dir = userFolder("workspace-general");
  writeFileSync(join(dir, "開始使用.md"), "舊的說明\n"); // the folder has an older start guide than the zip
  const gh = fakeGitHub(releaseZip("workspace-general", "job-hunt"), { asset: "job-hunt-windows.zip" });
  const p = await prepareUpdate(env(dir, gh.fetch));
  expect(gh.calls[1]).toEndWith("/job-hunt-windows.zip");
  expect(planView(p).files.map((f) => f.path)).toEqual(["AGENTS.md", "playbooks/brand-new.md", "開始使用.md", "jobhunt.exe"]);
  applyUpdate(dir, p, { platform: "win32", runVersion: okVersion });
  expect(read(dir, "開始使用.md")).toBe(readFileSync(join(SCAFFOLD, "workspace-general", "開始使用.md"), "utf-8"));
});

test("already up to date, development build, offline, missing download: nothing is written", async () => {
  const dir = userFolder();
  const before = snapshot(dir);
  const zip = releaseZip();
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(zip, { tag: "v0.9" }).fetch)))).code).toBe("latest");
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(zip).fetch, "dev")))).code).toBe("dev");
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(zip, { status: 404 }).fetch)))).code).toBe("offline");
  expect((await failure(prepareUpdate(env(dir, async () => { throw new Error("no network"); })))).code).toBe("offline");
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(zip, { asset: "job-hunt-us-mac-apple.zip" }).fetch)))).code).toBe("noAsset");
  expect(snapshot(dir)).toEqual(before);
});

test("a download that doesn't match GitHub's fingerprint, or isn't this kit, is refused", async () => {
  const dir = userFolder();
  const zip = releaseZip();
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(zip, { digest: "sha256:" + "0".repeat(64) }).fetch)))).code).toBe("badDownload");
  const truncated = zip.slice(0, zip.length - 100);
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(truncated, { digest: null }).fetch)))).code).toBe("badDownload");
  // the Taiwan zip offered to a US folder (wrong top folder: no program, no AGENTS.md found)
  const tw = releaseZip("workspace-general", "job-hunt");
  expect((await failure(prepareUpdate(env(dir, fakeGitHub(tw).fetch)))).code).toBe("badDownload");
});

test("entries that try to reach the user's files are ignored", async () => {
  const dir = userFolder();
  const before = snapshot(dir);
  const zip = releaseZip("workspace-us", "job-hunt-us", "jobhunt.exe", [
    { name: "job-hunt-us/playbooks/../resume.yaml", data: "EVIL" },
    { name: "job-hunt-us/../resume.yaml", data: "EVIL" },
    { name: "resume.yaml", data: "EVIL" },
    { name: "job-hunt-us/me/profile.md", data: "EVIL" },
  ]);
  const p = await prepareUpdate(env(dir, fakeGitHub(zip).fetch));
  applyUpdate(dir, p, { platform: "win32", runVersion: okVersion });
  for (const f of USER_FILES) expect(read(dir, f)).toBe(Buffer.from(before[f], "base64").toString("utf-8"));
  expect(existsSync(join(dir, "me", "profile.md")) ? read(dir, "me/profile.md") : "").not.toContain("EVIL");
});

test("the new program doesn't start: everything is put back exactly", async () => {
  const dir = userFolder();
  const before = snapshot(dir);
  const p = await prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch));
  const e = await failure(() => applyUpdate(dir, p, { platform: "win32", runVersion: () => null }));
  expect(e.code).toBe("verifyFailed");
  expect(snapshot(dir)).toEqual(before);
  expect(existsSync(join(dir, ".jobhunt", "backup"))).toBe(false);
  expect(existsSync(join(dir, ".jobhunt", "update.lock"))).toBe(false);
});

test("a file that can't be replaced halfway: everything is put back exactly", async () => {
  const dir = userFolder();
  const p = await prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch));
  // AGENTS.md is swapped first; the new playbook can't be created (read-only file on Windows / read-only folder elsewhere)
  if (process.platform === "win32") {
    writeFileSync(join(dir, "playbooks", "brand-new.md"), "x");
    p.files.find((f) => f.path === "playbooks/brand-new.md")!.isNew = false;
    chmodSync(join(dir, "playbooks", "brand-new.md"), 0o444);
  } else chmodSync(join(dir, "playbooks"), 0o555);
  const before = snapshot(dir);
  const e = await failure(() => applyUpdate(dir, p, { platform: "win32", runVersion: okVersion }));
  expect(e.code).toBe("restored");
  expect(snapshot(dir)).toEqual(before);
  expect(existsSync(join(dir, ".jobhunt", "backup"))).toBe(false);
});

test("jobhunt.yaml edited after the list was shown: nothing is changed", async () => {
  const dir = userFolder();
  const p = await prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch));
  writeFileSync(join(dir, "jobhunt.yaml"), read(dir, "jobhunt.yaml") + "# edited\n");
  const before = snapshot(dir);
  expect((await failure(() => applyUpdate(dir, p, { platform: "win32", runVersion: okVersion }))).code).toBe("restored");
  expect(snapshot(dir)).toEqual(before);
});

test("a shortcut (symlink) where an instruction file should be: refused before anything is written", async () => {
  const dir = userFolder();
  try {
    symlinkSync(join(dir, "resume.yaml"), join(dir, "CLAUDE.md.link"));
  } catch {
    return; // Windows without developer mode can't make symlinks
  }
  const { renameSync, unlinkSync } = await import("node:fs");
  unlinkSync(join(dir, "AGENTS.md"));
  renameSync(join(dir, "CLAUDE.md.link"), join(dir, "AGENTS.md"));
  const before = snapshot(dir);
  const e = await failure(prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch)));
  expect(e.code).toBe("notPlainFile");
  expect(e.detail.path).toBe("AGENTS.md");
  expect(snapshot(dir)).toEqual(before);
});

test("undo puts back every replaced file and removes the added ones", async () => {
  const dir = userFolder();
  const before = snapshot(dir);
  const p: Prepared = await prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch));
  applyUpdate(dir, p, { platform: "win32", runVersion: okVersion });
  expect((await failure(() => undoUpdate(dir, { version: "0.9", platform: "win32" }))).code).toBe("undoWrongVersion");
  cleanupAfterUpdate(dir, "jobhunt.exe");
  expect(undoUpdate(dir, { version: "0.10", platform: "win32" })).toBe("0.9");
  cleanupAfterUpdate(dir, "jobhunt.exe");
  expect(snapshot(dir)).toEqual(before);
  expect(existsSync(join(dir, ".jobhunt", "backup"))).toBe(false);
  expect((await failure(() => undoUpdate(dir, { version: "0.10", platform: "win32" }))).code).toBe("undoNone");
});

test("a hand-edited backup record can't make undo touch the user's files", () => {
  const dir = userFolder();
  mkdirSync(join(dir, ".jobhunt", "backup", "files"), { recursive: true });
  writeFileSync(join(dir, ".jobhunt", "backup", "files", "resume.yaml"), "EVIL");
  for (const files of [[{ path: "resume.yaml", existed: true, program: false }], [{ path: "resume.yaml", existed: true, program: true }], [{ path: "../x", existed: false, program: false }]]) {
    writeFileSync(join(dir, ".jobhunt", "backup", "backup.json"), JSON.stringify({ from: "0.9", to: "v0.10", files }));
    expect(readBackup(dir)).toBeNull();
  }
  expect(read(dir, "resume.yaml")).not.toBe("EVIL");
});

test("another update already running", async () => {
  const dir = userFolder();
  const p = await prepareUpdate(env(dir, fakeGitHub(releaseZip()).fetch));
  mkdirSync(join(dir, ".jobhunt"), { recursive: true });
  writeFileSync(join(dir, ".jobhunt", "update.lock"), "");
  const before = snapshot(dir);
  expect((await failure(() => applyUpdate(dir, p, { platform: "win32", runVersion: okVersion }))).code).toBe("busy");
  expect(snapshot(dir)).toEqual(before);
});

test("settings merge keeps every line of the user's file", () => {
  const user = "language: en\nupdate_check: false   # mine\n";
  const kit = "# header\n\nlanguage: en\n# about paper\npaper: letter\nupdate_check: true\n\nresume:\n  source: resume.yaml\n  voice:\n    extra_words:\n      - a\n";
  const m = mergeSettings(user, kit)!;
  expect(m.added).toEqual(["paper", "resume"]);
  expect(m.text.startsWith(user)).toBe(true);
  expect(m.text).toContain("# about paper\npaper: letter\n");
  const y = Bun.YAML.parse(m.text) as any;
  expect(y.update_check).toBe(false);
  expect(y.resume.voice.extra_words).toEqual(["a"]);
  expect(mergeSettings(kit, kit)).toBeNull();
  expect(mergeSettings("language: [", kit)).toBeNull();
  const crlf = mergeSettings("language: en\r\n", "language: en\npaper: a4\n")!;
  expect(crlf.text).toBe("language: en\r\n\r\npaper: a4\r\n");
});

test("the local stand-in for GitHub is only accepted on this computer", async () => {
  const { testServerFromEnv } = await import("../src/update.ts");
  expect(testServerFromEnv({ JOBHUNT_UPDATE_SERVER: "http://127.0.0.1:8765" })).toBe("http://127.0.0.1:8765");
  for (const bad of ["http://evil.example:8765", "http://127.0.0.1:8765@evil.example", "https://127.0.0.1:8765", "http://127.0.0.1:8765/x", "", undefined])
    expect(testServerFromEnv({ JOBHUNT_UPDATE_SERVER: bad })).toBeNull();
});
