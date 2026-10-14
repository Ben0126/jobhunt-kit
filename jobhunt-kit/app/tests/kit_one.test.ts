// 合一版的資料夾：kitbuild.ts 組出來的樣子，和 `jobhunt mode` / 開始畫面依模式裝規則（src/kitinstall.ts）。
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleKit } from "../kitbuild.ts";
import { Folder } from "../src/folder.ts";
import { installMode, isOneKit, KitError, runMode } from "../src/kitinstall.ts";
import { readMode } from "../src/mode.ts";
import { startServer } from "../src/server.ts";
import { cleanup } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

function kit(): string {
  const d = join(mkdtempSync(join(tmpdir(), "jobhunt-one-")), "job-hunt-kit");
  dirs.push(join(d, ".."));
  assembleKit(d);
  return d;
}
const read = (d: string, rel: string) => readFileSync(join(d, ...rel.split("/")), "utf-8");
const ls = (d: string, rel: string) => (existsSync(join(d, rel)) ? readdirSync(join(d, rel)).sort() : null);

test("組出來的資料夾：最上層是「設定用」的短規則，三套規則都在 .kit，範本四個都有；還沒有 playbooks 和 resume.yaml", () => {
  const d = kit();
  expect(isOneKit(d)).toBe(true);
  expect(read(d, "AGENTS.md")).toContain("Job-search folder: setup");
  expect(read(d, "AGENTS.md")).toContain(".\\jobhunt.exe mode us");
  expect(ls(d, "playbooks")).toBeNull();
  expect(existsSync(join(d, "resume.yaml"))).toBe(false);
  expect(ls(d, "templates")).toEqual(["resume-en.html", "resume-tw-classic.html", "resume-tw.html", "resume-us.html"]);
  expect(ls(d, ".kit")).toEqual(["both", "tw", "us"]);
  const scaffold = join(import.meta.dir, "..", "..", "jobhunt", "scaffold");
  // the tested rule sets, unchanged
  expect(read(d, ".kit/us/AGENTS.md")).toBe(readFileSync(join(scaffold, "workspace-us", "AGENTS.md"), "utf-8"));
  expect(read(d, ".kit/tw/AGENTS.md")).toBe(readFileSync(join(scaffold, "workspace-general", "AGENTS.md"), "utf-8"));
  // both = the US rules + the Taiwan section; playbooks = the US ones + taiwan.md + 104 from the Taiwan kit with a note on top
  const both = read(d, ".kit/both/AGENTS.md");
  expect(both.startsWith(read(d, ".kit/us/AGENTS.md").trimEnd())).toBe(true);
  expect(both).toContain("## Taiwan too");
  expect(ls(d, ".kit/both/playbooks")).toEqual([...ls(d, ".kit/us/playbooks")!, "fill-104.md", "taiwan.md"].sort());
  expect(read(d, ".kit/both/playbooks/fill-104.md")).toContain("先完整讀 `playbooks/taiwan.md`");
  expect(read(d, ".kit/both/playbooks/fill-104.md")).toContain(readFileSync(join(scaffold, "workspace-general", "playbooks", "fill-104.md"), "utf-8"));
  expect(read(d, ".kit/both/resume.yaml")).toContain("tw: {title: 中文履歷");
  // every rule set fits what Codex loads (32 KiB), with room
  for (const m of ["us", "tw", "both"]) expect(statSync(join(d, ".kit", m, "AGENTS.md")).size, m).toBeLessThan(29 * 1024);
  // the installer is pre-approved for the AI, like check and read
  const allow: string[] = JSON.parse(read(d, ".claude/settings.json")).permissions.allow;
  expect(allow).toContain("PowerShell(.\\jobhunt.exe mode *)");
  expect(allow).toContain("Bash(./jobhunt-mac-arm64 mode *)");
  expect(read(d, ".codex/rules/jobhunt.rules")).toContain('pattern = [".\\\\jobhunt.exe", "mode"]');
  expect(read(d, "jobhunt.yaml")).not.toMatch(/^market:/m);
});

test("installMode：裝上那一套（AGENTS.md、playbooks、兩個 skills 資料夾），建 resume.yaml 和需要的資料夾，記下模式", async () => {
  const d = kit();
  const r = installMode(d, ["us"]);
  expect(r).toMatchObject({ mode: "us", markets: ["us"], created: ["resume.yaml", "profiles/"] });
  expect(read(d, "AGENTS.md")).toBe(read(d, ".kit/us/AGENTS.md"));
  expect(ls(d, "playbooks")).toEqual(ls(d, ".kit/us/playbooks"));
  expect(ls(d, ".claude/skills")).toEqual(ls(d, ".kit/us/skills"));
  expect(ls(d, ".agents/skills")).toEqual(ls(d, ".kit/us/skills")); // Codex finds them here
  expect(read(d, "resume.yaml")).toBe(read(d, ".kit/us/resume.yaml"));
  expect(existsSync(join(d, "104"))).toBe(false);
  expect(await readMode(new Folder(d))).toEqual({ markets: ["us"], set: true, source: "mode" });
});

test("加市場：美國 → 兩邊；playbooks 整組換掉、他的 resume.yaml 不動、補上 104 資料夾", () => {
  const d = kit();
  installMode(d, ["us"]);
  writeFileSync(join(d, "resume.yaml"), "basics: {name: Mine}\n");
  writeFileSync(join(d, "playbooks", "stale.md"), "old");
  const r = installMode(d, ["us", "tw"]);
  expect(r).toMatchObject({ mode: "both", created: ["104/"] });
  expect(read(d, "AGENTS.md")).toBe(read(d, ".kit/both/AGENTS.md"));
  expect(ls(d, "playbooks")).toEqual(ls(d, ".kit/both/playbooks"));
  expect(read(d, "resume.yaml")).toBe("basics: {name: Mine}\n");
  expect(existsSync(join(d, "104", ".gitkeep"))).toBe(true);
  expect(read(d, "me/mode.yaml")).toContain("markets: [us, tw]");
});

test("只能加、不能拿掉：兩邊 → 美國、台灣 → 美國都拒絕，什麼都不動", () => {
  const d = kit();
  installMode(d, ["us", "tw"]);
  const before = read(d, "AGENTS.md");
  expect(() => installMode(d, ["us"])).toThrow(KitError);
  expect(read(d, "AGENTS.md")).toBe(before);
  const t = kit();
  installMode(t, ["tw"]);
  try {
    installMode(t, ["us"]);
    throw new Error("should refuse");
  } catch (e) {
    expect((e as KitError).code).toBe("narrow");
  }
  expect(installMode(t, ["tw", "us"]).mode).toBe("both"); // adding is fine
});

test("不是合一版、或要寫的地方不是一般資料夾 → 拒絕", () => {
  const plainDir = mkdtempSync(join(tmpdir(), "jobhunt-old-"));
  dirs.push(plainDir);
  expect(() => installMode(plainDir, ["us"])).toThrow(KitError);
  const d = kit();
  writeFileSync(join(d, "playbooks"), "a file where a folder should be");
  try {
    installMode(d, ["us"]);
    throw new Error("should refuse");
  } catch (e) {
    expect((e as KitError).code).toBe("notPlain");
  }
});

test("jobhunt mode：沒給選擇就說目前是什麼；裝好結束碼 0；亂寫、拿掉市場結束碼 2", () => {
  const d = kit();
  const out: string[] = [];
  const run = (...a: string[]) => runMode(["mode", ...a], d, (s) => out.push(s));
  expect(run()).toBe(0);
  expect(out.pop()).toContain("does not know yet");
  expect(run("mars")).toBe(2);
  expect(out.pop()).toContain('Unknown choice "mars"');
  expect(run("both")).toBe(0);
  expect(out.pop()).toContain("installed");
  expect(run()).toBe(0);
  expect(out.pop()).toContain("the United States and Taiwan");
  expect(run("us")).toBe(2);
  expect(out.pop()).toContain("can be added, not removed");
});

test("jobhunt mode tw（第一次選，AI 幫忙裝）：程式畫面和檢查結果改成中文；us、both 和之後再選都不動語言", () => {
  const lang = (d: string) => /^language: (\S+)/m.exec(read(d, "jobhunt.yaml"))?.[1];
  const out: string[] = [];
  const tw = kit();
  expect(runMode(["mode", "tw"], tw, (s) => out.push(s))).toBe(0);
  expect(lang(tw)).toBe("zh-TW");
  expect(out.pop()).toContain("台灣");
  expect(read(tw, "jobhunt.yaml")).toContain("language: zh-TW           # language of the program's pages");
  for (const m of ["us", "both"]) {
    const d = kit();
    expect(runMode(["mode", m], d, () => {})).toBe(0);
    expect(lang(d)).toBe("en");
  }
  // already chosen (us), then adding Taiwan: the language they have stays
  const later = kit();
  runMode(["mode", "us"], later, () => {});
  expect(runMode(["mode", "both"], later, () => {})).toBe(0);
  expect(lang(later)).toBe("en");
});

test("開始畫面（POST /api/mode）在合一版裡也會裝規則；拿掉市場回 409", async () => {
  const d = kit();
  const s = startServer({ folder: new Folder(d) });
  stops.push(s.stop);
  const post = (b: unknown) => fetch(`http://127.0.0.1:${s.port}/api/mode`, { method: "POST", headers: { "x-jobhunt-token": s.token, "content-type": "application/json" }, body: JSON.stringify(b) });
  expect((await post({ markets: ["tw"] })).status).toBe(200);
  expect(read(d, "AGENTS.md")).toBe(read(d, ".kit/tw/AGENTS.md"));
  expect(existsSync(join(d, "104"))).toBe(true);
  const r = await post({ markets: ["us"] });
  expect(r.status).toBe(409);
  expect(((await r.json()) as any).code).toBe("narrow");
});
