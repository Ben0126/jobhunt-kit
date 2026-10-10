// "A newer version exists" reminder (src/update.ts, GET /api/update, ui/app.js banner, --version, build.ts).
// Nothing here may touch the network: every check gets an injected fetch and clock.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Folder } from "../src/folder.ts";
import { startServer } from "../src/server.ts";
import {
  assetName, CHECK_EVERY_MS, createUpdateChecker, downloadUrl, isNewer, LATEST_RELEASE_API, parseVersion, programName, updateCheckEnabled,
} from "../src/update.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const APP = join(import.meta.dir, "..");
const US_KIT = join(APP, "..", "jobhunt", "scaffold", "workspace-us");

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

const tw = () => {
  const d = copyFixture();
  dirs.push(d);
  return d;
};
const withYaml = (yaml: string) => {
  const d = tw();
  writeFileSync(join(d, "jobhunt.yaml"), yaml);
  return d;
};

/** A fake GitHub: counts the calls and keeps what each one sent. */
function fakeGithub(body: unknown, opts: { status?: number; throws?: boolean; text?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (opts.throws) throw new Error("offline");
    return new Response(opts.text ?? JSON.stringify(body), { status: opts.status ?? 200 });
  };
  return { calls, fetch };
}
const release = (tag: string, extra: object = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });

const T0 = Date.parse("2026-10-10T08:00:00Z");
const checker = (dir: string, gh: ReturnType<typeof fakeGithub>, over: Partial<Parameters<typeof createUpdateChecker>[0]> = {}) =>
  createUpdateChecker({ folder: new Folder(dir), version: "0.7", fetch: gh.fetch, now: () => T0, platform: "win32", arch: "x64", ...over });

// ------------------------------------------------------------------ versions

test("版本比較是數字一段一段比：v0.10 比 v0.9 新；一樣、比較舊、看不懂都不算新", () => {
  expect(isNewer("v0.10", "0.9")).toBe(true);
  expect(isNewer("v0.7.1", "0.7")).toBe(true);
  expect(isNewer("v1.0", "0.99.9")).toBe(true);
  expect(isNewer("v0.7", "0.7")).toBe(false);
  expect(isNewer("v0.6", "0.7")).toBe(false);
  expect(isNewer("v0.8-rc1", "0.7")).toBe(false);
  expect(isNewer("v0.8", "dev")).toBe(false);
  expect(isNewer(undefined, "0.7")).toBe(false);
  expect(parseVersion("dev")).toBeNull();
  expect(parseVersion("v0.7")).toEqual([0, 7, 0]);
});

test("要下載哪個 zip、要換哪個程式檔：台灣／美國 × Windows／Mac Apple／Mac Intel；Linux 沒有", () => {
  expect(assetName("tw", "win32", "x64")).toBe("job-hunt-windows.zip");
  expect(assetName("tw", "darwin", "arm64")).toBe("job-hunt-mac-apple.zip");
  expect(assetName("tw", "darwin", "x64")).toBe("job-hunt-mac-intel.zip");
  expect(assetName("us", "win32", "x64")).toBe("job-hunt-us-windows.zip");
  expect(assetName("us", "darwin", "arm64")).toBe("job-hunt-us-mac-apple.zip");
  expect(assetName("us", "darwin", "x64")).toBe("job-hunt-us-mac-intel.zip");
  expect(assetName("us", "linux", "x64")).toBeNull();
  expect(programName("win32", "x64")).toBe("jobhunt.exe");
  expect(programName("darwin", "arm64")).toBe("jobhunt-mac-arm64");
  expect(programName("darwin", "x64")).toBe("jobhunt-mac-x64");
  expect(programName("linux", "x64")).toBeNull();
  expect(downloadUrl("job-hunt-us-windows.zip")).toBe("https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-us-windows.zip");
});

test("update_check: false（也接受 no／off）才會關掉；沒寫、寫 true、壞掉都是開著", () => {
  expect(updateCheckEnabled({ update_check: false })).toBe(false);
  expect(updateCheckEnabled({ update_check: "false" })).toBe(false);
  expect(updateCheckEnabled({ update_check: "Off" })).toBe(false);
  expect(updateCheckEnabled({ update_check: true })).toBe(true);
  expect(updateCheckEnabled({})).toBe(true);
  expect(updateCheckEnabled(null)).toBe(true);
});

// ------------------------------------------------------------------ the check

test("有新版：只打一次 GitHub 的 latest 網址（沒有查詢參數），帶固定 User-Agent 和逾時；回傳正確的 zip 與程式檔", async () => {
  const dir = tw();
  const gh = fakeGithub(release("v0.8"));
  const n = await checker(dir, gh).get();
  expect(n).toEqual({
    version: "v0.8",
    notesUrl: "https://github.com/Ben0126/jobhunt-kit/releases/tag/v0.8",
    downloadUrl: "https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-windows.zip",
    zipName: "job-hunt-windows.zip",
    programName: "jobhunt.exe",
  });
  expect(gh.calls.length).toBe(1);
  expect(gh.calls[0].url).toBe(LATEST_RELEASE_API);
  expect(gh.calls[0].url).not.toContain("?");
  expect((gh.calls[0].init.headers as Record<string, string>)["User-Agent"]).toBe("jobhunt-kit/0.7");
  expect(gh.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  expect(gh.calls[0].init.method ?? "GET").toBe("GET");
  expect(gh.calls[0].init.body).toBeUndefined();
  expect(Object.keys(gh.calls[0].init.headers as object).sort()).toEqual(["Accept", "User-Agent"]);
});

test("美國資料夾拿美國版的 zip；Mac 拿對應晶片的 zip 和程式檔", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jobhunt-upd-"));
  dirs.push(dir);
  const { cpSync } = await import("node:fs");
  cpSync(US_KIT, dir, { recursive: true });
  const n = await checker(dir, fakeGithub(release("v0.8")), { platform: "darwin", arch: "arm64" }).get();
  expect(n?.zipName).toBe("job-hunt-us-mac-apple.zip");
  expect(n?.downloadUrl).toBe("https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-us-mac-apple.zip");
  expect(n?.programName).toBe("jobhunt-mac-arm64");
  const n2 = await checker(tw(), fakeGithub(release("v0.8")), { platform: "darwin", arch: "x64" }).get();
  expect(n2?.zipName).toBe("job-hunt-mac-intel.zip");
  expect(n2?.programName).toBe("jobhunt-mac-x64");
});

test("沒有比較新、或是測試版／草稿／看不懂的標籤：不提醒", async () => {
  for (const body of [release("v0.7"), release("v0.6"), release("v0.9", { prerelease: true }), release("v0.9", { draft: true }), release("v0.9-rc1"), {}, null, "nope"]) {
    expect(await checker(tw(), fakeGithub(body)).get()).toBeNull();
  }
});

test("一天最多問一次：24 小時內（重開程式也一樣）讀快取、不再連線；超過 24 小時才再問", async () => {
  const dir = tw();
  const gh = fakeGithub(release("v0.8"));
  expect((await checker(dir, gh).get())?.version).toBe("v0.8");
  expect(existsSync(join(dir, ".jobhunt", "update.json"))).toBe(true);
  const saved = JSON.parse(readFileSync(join(dir, ".jobhunt", "update.json"), "utf-8"));
  expect(saved).toEqual({ checked_at: new Date(T0).toISOString(), latest: "v0.8" });

  // same process, and a fresh process (new checker) 23 hours later: cache only
  const c = checker(dir, gh);
  expect((await checker(dir, gh, { now: () => T0 + CHECK_EVERY_MS - 3600_000 }).get())?.version).toBe("v0.8");
  expect((await c.get())?.version).toBe("v0.8");
  expect(gh.calls.length).toBe(1);

  // 25 hours later: asks again, and a newer release replaces the old answer
  const gh2 = fakeGithub(release("v0.9"));
  expect((await checker(dir, gh2, { now: () => T0 + CHECK_EVERY_MS + 3600_000 }).get())?.version).toBe("v0.9");
  expect(gh2.calls.length).toBe(1);
});

test("使用者已經更新到最新：快取裡的舊答案不再提醒，也不用連線", async () => {
  const dir = tw();
  await checker(dir, fakeGithub(release("v0.8"))).get();
  const gh = fakeGithub(release("v0.8"));
  expect(await checker(dir, gh, { version: "0.8" }).get()).toBeNull();
  expect(gh.calls.length).toBe(0);
});

test("連不上、逾時、回 500、回傳壞掉：不丟錯、不提醒，而且這一天內不再重試", async () => {
  for (const o of [{ throws: true }, { status: 500 }, { text: "<html>not json" }, { status: 403 }]) {
    const dir = tw();
    const gh = fakeGithub(release("v0.8"), o);
    const c = checker(dir, gh);
    expect(await c.get()).toBeNull();
    expect(await checker(dir, gh, { now: () => T0 + 1000 }).get()).toBeNull();
    expect(gh.calls.length).toBe(1);
  }
});

test("失敗的那次不會洗掉先前知道的新版", async () => {
  const dir = tw();
  await checker(dir, fakeGithub(release("v0.8"))).get();
  const bad = fakeGithub(null, { throws: true });
  const n = await checker(dir, bad, { now: () => T0 + CHECK_EVERY_MS + 1000 }).get();
  expect(bad.calls.length).toBe(1);
  expect(n?.version).toBe("v0.8");
});

test("資料夾寫不進去也不出錯，同一個程式裡仍然一天只問一次", async () => {
  const dir = tw();
  writeFileSync(join(dir, ".jobhunt"), "a file where the folder should be"); // mkdir/write will fail
  const gh = fakeGithub(release("v0.8"));
  const c = checker(dir, gh);
  expect((await c.get())?.version).toBe("v0.8");
  expect((await c.get())?.version).toBe("v0.8");
  expect(gh.calls.length).toBe(1);
});

test("jobhunt.yaml 寫 update_check: false：完全不連線、也不留快取檔", async () => {
  for (const flag of ["false", "off", "no"]) {
    const dir = withYaml(`language: zh-TW\nmarket: tw\nupdate_check: ${flag}\n`);
    const gh = fakeGithub(release("v0.8"));
    expect(await checker(dir, gh).get()).toBeNull();
    expect(gh.calls.length).toBe(0);
    expect(existsSync(join(dir, ".jobhunt", "update.json"))).toBe(false);
  }
  // true leaves it on (a yaml that cannot be read stays silent: see the review-fix tests at the end)
  expect((await checker(withYaml("update_check: true\n"), fakeGithub(release("v0.8"))).get())?.version).toBe("v0.8");
});

test("沒有嵌入版本的開發版（dev）：不連線、不提醒；Linux 這種沒有發行檔的系統也不提醒", async () => {
  const gh = fakeGithub(release("v9.9"));
  expect(await checker(tw(), gh, { version: "dev" }).get()).toBeNull();
  expect(await checker(tw(), gh, { version: "0.7", platform: "linux" }).get()).toBeNull();
  expect(gh.calls.length).toBe(0);
});

test(".jobhunt/update.json 不在任何一張白名單裡：AI 和介面都讀不到、寫不到、列不出", () => {
  for (const mode of ["read", "write", "list", "archive"] as const) {
    expect(Folder.allowed(".jobhunt/update.json", mode)).toBe(false);
    expect(Folder.allowed(".jobhunt", mode)).toBe(false);
  }
});

// ------------------------------------------------------------------ the local server

const get = (s: { port: number; token: string }, path: string, token = s.token) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { headers: { "x-jobhunt-token": token } });

test("GET /api/update：有新版就回網址和檔名；沒有就只回 available:false；要有通行碼", async () => {
  const dir = tw();
  const s = startServer({ folder: new Folder(dir), update: checker(dir, fakeGithub(release("v0.8"))) });
  stops.push(s.stop);
  const r = await get(s, "/api/update");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    available: true,
    version: "v0.8",
    notesUrl: "https://github.com/Ben0126/jobhunt-kit/releases/tag/v0.8",
    downloadUrl: "https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-windows.zip",
    zipName: "job-hunt-windows.zip",
    programName: "jobhunt.exe",
  });
  expect((await get(s, "/api/update", "wrong")).status).toBe(401);

  const dir2 = tw();
  const s2 = startServer({ folder: new Folder(dir2), update: checker(dir2, fakeGithub(release("v0.7"))) });
  stops.push(s2.stop);
  expect(await (await get(s2, "/api/update")).json()).toEqual({ available: false });
});

test("沒有注入檢查器時（測試、開發版）：/api/update 回 available:false，而且不連線", async () => {
  const dir = tw();
  const real = globalThis.fetch;
  let outside = 0;
  // only calls to the update address would count; the test's own calls go to 127.0.0.1
  globalThis.fetch = ((url: any, init: any) => {
    if (String(url).startsWith("https://api.github.com")) outside++;
    return real(url, init);
  }) as typeof fetch;
  try {
    const s = startServer({ folder: new Folder(dir) });
    stops.push(s.stop);
    expect(await (await get(s, "/api/update")).json()).toEqual({ available: false });
  } finally {
    globalThis.fetch = real;
  }
  expect(outside).toBe(0);
});

test("/api/info 和 /api/ping 報的版本是嵌入的版本（開發版是 dev，不再是寫死的 0.1.0）", async () => {
  const dir = tw();
  const s = startServer({ folder: new Folder(dir) });
  stops.push(s.stop);
  expect((await (await get(s, "/api/ping")).json()).version).toBe("dev");
  expect((await (await get(s, "/api/info")).json()).version).toBe("dev");
});

// ------------------------------------------------------------------ the page, the AI-facing commands, the build

test("提醒只出現在介面：check／read 的程式碼不碰 update.ts；首頁 HTML 沒有橫幅（橫幅是 app.js 在有新版時才加的）", () => {
  for (const f of ["check.ts", "check.text.ts", "docx.ts", "docx.text.ts", "blocks104.ts", "checksfile.ts"])
    expect(readFileSync(join(APP, "src", f), "utf-8")).not.toMatch(/update\.ts|update-banner|\/api\/update/);
  for (const f of ["index.html", "index-en.html"]) expect(readFileSync(join(APP, "ui", f), "utf-8")).not.toContain("update-banner");
});

function uiText() {
  const js = readFileSync(join(APP, "ui", "app.js"), "utf-8");
  const block = js.slice(js.indexOf("// <ui-text>"), js.indexOf("// </ui-text>"));
  return new Function(`${block}\nreturn TEXT;`)() as Record<"zh-TW" | "en", any>;
}

test("橫幅的字：中英文都有，講清楚下載哪個檔、只換哪個程式、絕對不要整包蓋過去", () => {
  const { "zh-TW": zh, en } = uiText();
  expect(zh.updateTitle("v0.8")).toBe("有新版本可以更新：v0.8");
  expect(en.updateTitle("v0.8")).toBe("A new version is available: v0.8");
  expect(zh.updateDownload("job-hunt-windows.zip")).toContain("job-hunt-windows.zip");
  expect(en.updateDownload("job-hunt-us-mac-apple.zip")).toContain("job-hunt-us-mac-apple.zip");
  expect(zh.updateSteps("jobhunt.exe").join("\n")).toContain("類型是「應用程式」的那個，完整檔名是 jobhunt.exe");
  expect(en.updateSteps("jobhunt.exe").join("\n")).toContain('type is "Application"');
  expect(en.updateSteps("jobhunt-mac-x64").join("\n")).toContain('"jobhunt-mac-x64"');
  expect(zh.updateSteps("x").join("\n")).toContain("另一個資料夾");
  expect(en.updateSteps("x").join("\n")).toContain("different folder");
  expect(zh.updateWarn).toContain("千萬不要");
  expect(en.updateWarn).toContain("Never unzip the whole file");
  expect(zh.updateOffHint).toContain("每天最多");
  expect(en.updateOffHint).toContain("at most once a day");
});

test("app.js 只有在 /api/update 說有新版時才加橫幅，而且是頁面載好之後才問", () => {
  const js = readFileSync(join(APP, "ui", "app.js"), "utf-8");
  expect(js).toMatch(/api\("GET", "\/api\/update"\)/);
  expect(js).toMatch(/if \(u && u\.available/);
  expect(js).toMatch(/showTab\(\);\s*if \(token\) checkUpdate\(\);/);
  expect(js).toContain('rel: "noopener noreferrer"');
});

async function run(cmd: string[], cwd = APP) {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out: out.replace(/\r/g, ""), err };
}

test("jobhunt --version：印出嵌入的版本；沒有嵌入就是 dev；打包時給的版本號真的會被包進去", async () => {
  const dev = await run([process.execPath, "src/main.ts", "--version"]);
  expect(dev.code).toBe(0);
  expect(dev.out).toBe("dev\n");

  const out = join(mkdtempSync(join(tmpdir(), "jobhunt-ver-")), "m.js");
  dirs.push(join(out, ".."));
  const b = await run([process.execPath, "build", "src/main.ts", "--target=bun", "--define", `__JOBHUNT_VERSION__=${JSON.stringify("0.8")}`, "--outfile", out]);
  expect(b.code).toBe(0);
  const baked = await run([process.execPath, out, "--version"]);
  expect(baked.out).toBe("0.8\n");
  rmSync(join(out, ".."), { recursive: true, force: true });
});

test("build.ts 的版本號：不像 0.8 的字（例如 abc）直接擋下，不會做出一個版本亂掉的程式", async () => {
  const r = await run([process.execPath, "build.ts", "--version", "abc"]);
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("版本號");
});

// ---- review fixes: off switch that cannot be broken by a small edit, self-contained off hint, Windows steps, release notes
const TW_KIT = join(APP, "..", "jobhunt", "scaffold", "workspace-general");

test("jobhunt.yaml 讀不出來（例如只刪了「#」留下行首空格）：不連線、不提醒、不留快取檔", async () => {
  for (const bad of [" update_check: false\n", "{{ broken", "language: zh-TW\n update_check: false\nresume:\n  source: resume.yaml\n"]) {
    const dir = withYaml(bad);
    const gh = fakeGithub(release("v0.8"));
    expect(await checker(dir, gh).get()).toBeNull();
    expect(gh.calls.length).toBe(0);
    expect(existsSync(join(dir, ".jobhunt", "update.json"))).toBe(false);
  }
});

test("兩個 kit 的 jobhunt.yaml 範本：update_check 是一行有效設定（true），只要把 true 改成 false 就關掉", async () => {
  for (const kit of [TW_KIT, US_KIT]) {
    const text = readFileSync(join(kit, "jobhunt.yaml"), "utf-8");
    expect(text).toMatch(/^update_check: true\b/m);
    expect((Bun.YAML.parse(text) as any).update_check).toBe(true);
    const off = text.replace(/^update_check: true/m, "update_check: false");
    expect(updateCheckEnabled(Bun.YAML.parse(off))).toBe(false);
    const dir = withYaml(off);
    const gh = fakeGithub(release("v0.8"));
    expect(await checker(dir, gh).get()).toBeNull();
    expect(gh.calls.length).toBe(0);
  }
});

test("兩份說明檔教的是「把 true 改成 false」，找不到這一行就自己加在最後", () => {
  const zh = readFileSync(join(TW_KIT, "開始使用.md"), "utf-8");
  const en = readFileSync(join(US_KIT, "START-HERE.md"), "utf-8");
  expect(zh).toContain("update_check: true");
  expect(zh).toMatch(/改成 false|改成「false」/);
  expect(zh).toContain("最後加一行");
  expect(en).toContain("update_check: true");
  expect(en).toMatch(/change true to false/i);
  expect(en).toMatch(/add (a|this) line at the (very )?end/i);
});

test("橫幅底部自己講怎麼關（不靠資料夾裡的說明檔，舊版資料夾沒有那一行）", () => {
  const js = readFileSync(join(APP, "ui", "app.js"), "utf-8");
  const offHints = [...js.matchAll(/updateOffHint:\s*"([^"]*)"/g)].map((m) => m[1]);
  expect(offHints.length).toBe(2);
  for (const h of offHints) expect(h).toContain("update_check: false");
  expect(offHints[0]).toContain("jobhunt.yaml");
  expect(offHints[0]).not.toContain("開始使用.md");
  expect(offHints[1]).not.toContain("START-HERE.md");
});

test("橫幅的 Windows 步驟：用「類型是應用程式」說明哪個檔，並提醒第一次打開的安全警告", () => {
  const js = readFileSync(join(APP, "ui", "app.js"), "utf-8");
  expect(js).toContain("updateWinNote");
  expect(js).toMatch(/programName === "jobhunt\.exe"/);
  const zh = /updateWinNote:\s*"([^"]*)"/.exec(js)![1];
  expect(zh).toContain("Windows 已保護您的電腦");
  expect(zh).toContain("仍要執行");
  expect(js).toMatch(/類型是「應用程式」/);
  expect(js).toMatch(/Type column says "Application"|type is "Application"/i);
});

test("release.yml 的發布說明：有「這次改了什麼」和「已經在用舊版」兩段（中英文），並警告不要整包蓋過去", () => {
  const y = readFileSync(join(APP, "..", "..", ".github", "workflows", "release.yml"), "utf-8");
  const notes = y.slice(y.indexOf("cat > notes.md"), y.indexOf("cat notes.md"));
  for (const s of ["## 這次改了什麼", "## 已經在用舊版？", "## What changed", "## Already using an older version?"]) expect(notes).toContain(s);
  expect(notes).toContain("不要把整個 zip");
  expect(notes).toMatch(/Do not unzip the whole zip over/i);
  expect(notes).not.toMatch(/`/); // unquoted heredoc: a backtick would run as a command
  // what changed in each version lives in release-notes/<tag>.{zh,en}.md (a variable's contents are not re-run as commands)
  expect(notes).toContain("${NOTES_ZH}");
  expect(notes).toContain("${NOTES_EN}");
  expect(y).toContain('test -s "$f"');
  const rn = join(APP, "..", "..", "release-notes");
  expect(readFileSync(join(rn, "v0.8.zh.md"), "utf-8")).toContain("每天最多問 GitHub 一次");
  expect(readFileSync(join(rn, "v0.8.en.md"), "utf-8")).toMatch(/at most once a day/);
});
