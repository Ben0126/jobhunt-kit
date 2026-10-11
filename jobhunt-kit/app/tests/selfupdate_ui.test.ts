// One-click update from the page (POST /api/update/prepare, /api/update/apply) and from the command line
// (`jobhunt update`, `--yes`, `--undo`). The update itself is tested in selfupdate.test.ts; here: the list is shown before
// anything changes, apply needs that list, the app closes after updating, and the messages are in the folder's language.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Folder } from "../src/folder.ts";
import { applyUpdate, prepareUpdate, runUpdate } from "../src/selfupdate.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup } from "./helpers.ts";
import { fakeGitHub, read, releaseZip, snapshot, userFolder } from "./updatekit.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

function setup(kit = "workspace-us") {
  const us = kit === "workspace-us";
  const dir = userFolder(kit);
  dirs.push(dir);
  const gh = fakeGitHub(releaseZip(kit, us ? "job-hunt-us" : "job-hunt"), { asset: us ? "job-hunt-us-windows.zip" : "job-hunt-windows.zip" });
  return { dir, gh };
}

function serve(dir: string, gh: ReturnType<typeof fakeGitHub>, runVersion: () => string | null = () => "0.10") {
  let closed = 0;
  const s = startServer({
    folder: new Folder(dir),
    selfUpdate: {
      prepare: () => prepareUpdate({ dir, version: "0.9", platform: "win32", arch: "x64", fetch: gh.fetch }),
      apply: (p) => applyUpdate(dir, p, { platform: "win32", runVersion }),
    },
    onUpdated: () => closed++,
  });
  stops.push(s.stop);
  return { s, closed: () => closed };
}

const post = (s: Running, path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", headers: { "x-jobhunt-token": s.token, "content-type": "application/json" }, body: JSON.stringify(body) });

test("page: the list comes first (nothing written), then apply replaces exactly that and the app closes", async () => {
  const { dir, gh } = setup();
  const { s, closed } = serve(dir, gh);
  const before = snapshot(dir);
  const r = await post(s, "/api/update/prepare");
  expect(r.status).toBe(200);
  const plan: any = await r.json();
  expect(plan.to).toBe("v0.10");
  expect(plan.files.map((f: any) => f.path)).toEqual(["AGENTS.md", "playbooks/brand-new.md", "jobhunt.exe"]);
  expect(plan.text.title).toBe("Update from v0.9 to v0.10");
  expect(plan.text.keep).toContain("resume.yaml, data/applications.csv");
  expect(plan.text.settings).toContain("new_setting");
  expect(snapshot(dir)).toEqual(before);

  // apply needs the version the user saw
  const wrong = await post(s, "/api/update/apply", { to: "v0.11" });
  expect(wrong.status).toBe(409);
  expect(((await wrong.json()) as any).error).toContain('Click "Update now" again');
  expect(snapshot(dir)).toEqual(before);

  const ok = await post(s, "/api/update/apply", { to: "v0.10" });
  expect(await ok.json()).toEqual({ ok: true, to: "v0.10" });
  expect(read(dir, "jobhunt.exe")).toBe("NEW PROGRAM");
  expect(read(dir, "resume.yaml")).toBe(Buffer.from(before["resume.yaml"], "base64").toString("utf-8"));
  await Bun.sleep(1000);
  expect(closed()).toBe(1);

  // the list is used up: a second apply is refused
  expect((await post(s, "/api/update/apply", { to: "v0.10" })).status).toBe(409);
});

test("page: apply without a list first is refused; failures come back as plain Chinese in a Taiwan folder", async () => {
  const { dir, gh } = setup("workspace-general");
  const { s, closed } = serve(dir, gh, () => null);
  const before = snapshot(dir);
  const none = await post(s, "/api/update/apply", { to: "v0.10" });
  expect(none.status).toBe(409);
  expect(((await none.json()) as any).error).toContain("一鍵更新");
  const plan: any = await (await post(s, "/api/update/prepare")).json();
  expect(plan.text.title).toBe("從 v0.9 更新到 v0.10");
  const bad = await post(s, "/api/update/apply", { to: plan.to });
  expect(bad.status).toBe(409);
  const j: any = await bad.json();
  expect(j.code).toBe("verifyFailed");
  expect(j.error).toBe("新程式打不開，已經全部還原成原來的版本。");
  expect(snapshot(dir)).toEqual(before);
  await Bun.sleep(1000);
  expect(closed()).toBe(0);
});

test("page: the update endpoints need the page's token", async () => {
  const { dir, gh } = setup();
  const { s } = serve(dir, gh);
  const r = await fetch(`http://127.0.0.1:${s.port}/api/update/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(r.status).toBe(401);
  expect(gh.calls).toEqual([]);
});

function cli(dir: string, gh: ReturnType<typeof fakeGitHub>, args: string[], version = "0.9", runVersion: () => string | null = () => "0.10") {
  const out: string[] = [];
  return runUpdate(["update", ...args], dir, {
    version,
    print: (l) => out.push(l),
    env: { platform: "win32", arch: "x64", fetch: gh.fetch },
    apply: { runVersion },
  }).then((code) => ({ code, out: out.join("\n") }));
}

test("command line: `update` only lists; `--yes` updates; `--undo` goes back", async () => {
  const { dir, gh } = setup();
  const before = snapshot(dir);
  const list = await cli(dir, gh, []);
  expect(list.code).toBe(0);
  expect(list.out).toContain("Update from v0.9 to v0.10");
  expect(list.out).toContain("  playbooks/brand-new.md (new file)");
  expect(list.out).toContain("To update, run: .\\jobhunt.exe update --yes");
  expect(snapshot(dir)).toEqual(before);

  const yes = await cli(dir, gh, ["--yes"]);
  expect(yes.code).toBe(0);
  expect(yes.out).toContain("Update finished: you now have v0.10.");
  expect(yes.out).toContain(".\\jobhunt.exe update --undo");
  expect(read(dir, "jobhunt.exe")).toBe("NEW PROGRAM");

  const undo = await cli(dir, gh, ["--undo"], "0.10");
  expect(undo.code).toBe(0);
  expect(undo.out).toContain("Went back to v0.9.");
  const after = snapshot(dir);
  delete after["jobhunt.exe.old"]; // Windows: the program renamed aside, removed on the next start
  expect(after).toEqual(before);
});

test("command line: already up to date is exit 0, offline is 1, a wrong option is 2; Taiwan folder speaks Chinese", async () => {
  const { dir } = setup("workspace-general");
  const zip = releaseZip("workspace-general", "job-hunt");
  const latest = await cli(dir, fakeGitHub(zip, { tag: "v0.9", asset: "job-hunt-windows.zip" }), []);
  expect(latest).toEqual({ code: 0, out: "已經是最新版（v0.9），不用更新。" });
  const offline = await cli(dir, fakeGitHub(zip, { status: 500, asset: "job-hunt-windows.zip" }), []);
  expect(offline.code).toBe(1);
  expect(offline.out).toContain("連不到 GitHub");
  const bad = await cli(dir, fakeGitHub(zip), ["--now"]);
  expect(bad.code).toBe(2);
  expect(bad.out).toContain("update --yes");
  expect(existsSync(join(dir, ".jobhunt", "backup"))).toBe(false);
});

test("command line: not a job-search folder", async () => {
  const out: string[] = [];
  expect(await runUpdate(["update"], null, { version: "0.9", print: (l) => out.push(l) })).toBe(2);
  expect(out.length).toBeGreaterThan(0);
});

test("the page code: the manual steps are still there, folded under the one-click button", () => {
  const js = readFileSync(join(import.meta.dir, "..", "ui", "app.js"), "utf-8");
  const show = js.slice(js.indexOf("function showUpdate"), js.indexOf("async function checkUpdate"));
  expect(show).toContain('"/api/update/prepare"');
  expect(show).toContain('"/api/update/apply", { to }');
  expect(show).toMatch(/h\(\s*"details",\s*\{ class: "manual" \}/);
  expect(show).toContain("T.updateSteps(u.programName)");
  expect(show).toContain("T.updateWarn");
});

test("the page never hands null to replaceChildren (it would print the word null; seen in the update list, 2026-10-10)", () => {
  const js = readFileSync(join(import.meta.dir, "..", "ui", "app.js"), "utf-8");
  let at = 0;
  const calls: string[] = [];
  while ((at = js.indexOf("replaceChildren(", at)) >= 0) {
    let i = at + "replaceChildren(".length, depth = 1;
    const start = i;
    for (; i < js.length && depth; i++) depth += js[i] === "(" ? 1 : js[i] === ")" ? -1 : 0;
    calls.push(js.slice(start, i - 1));
    at = i;
  }
  expect(calls.length).toBeGreaterThan(3);
  // a top-level argument that can be null: "cond ? x : null" not wrapped in h(...)
  const topLevel = (args: string) => {
    let depth = 0, out = "";
    for (const c of args) {
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (depth === 0) out += c;
    }
    return out;
  };
  for (const c of calls) expect([c.slice(0, 60), /:\s*null\b/.test(topLevel(c))]).toEqual([c.slice(0, 60), false]);
});
