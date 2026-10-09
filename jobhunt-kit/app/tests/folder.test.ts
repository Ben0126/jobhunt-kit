import { afterEach, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirFlagRefused, Folder, isCompiledBinary, looksLikeJobhuntFolder, resolveDataDir } from "../src/folder.ts";
import { cleanup, copyFixture, emptyTemp } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));
const fx = () => {
  const d = copyFixture();
  dirs.push(d);
  return d;
};

test("讀取白名單：允許的檔案", () => {
  for (const p of [
    "data/applications.csv", "resume.yaml", "me/profile.md", "targets/261008-01.yaml", "resumes/261008-01.html",
    "104/履歷欄位.md", "jobs/261008-01/jd.md", "checks/_104.md",
    // 程式檢查要看經歷有沒有確認、設定裡的放行詞
    "me/stories/S-001.md", "jobhunt.yaml",
  ])
    expect(Folder.allowed(p, "read")).toBe(true);
});

test("讀取白名單：不允許的檔案和路徑把戲", () => {
  for (const p of [
    "AGENTS.md", "me/stories/S-001.txt", "me/stories/a/b.md", ".jobhunt/app.lock", "submitted/x.json", "inbox/a.png",
    "../secret.txt", "targets/../AGENTS.md", "targets/./a.yaml", "/etc/passwd", "C:/Windows/win.ini", "C:secret",
    "targets", "jobs/a/b/c.md", "", "targets/a\0.yaml", "targets\..\AGENTS.md",
  ])
    expect(Folder.allowed(p, "read")).toBe(false);
});

test("寫入白名單只有進度表和檢查結果", () => {
  expect(Folder.allowed("data/applications.csv", "write")).toBe(true);
  expect(Folder.allowed("checks/a.md", "write")).toBe(true);
  expect(Folder.allowed("checks/_104.md", "write")).toBe(true);
  for (const p of ["resume.yaml", "targets/a.yaml", "checks/a.txt", "checks/../AGENTS.md", "checks/a/b.md", "AGENTS.md", "data/other.csv", "104/履歷欄位.md", "me/stories/S-001.md"])
    expect(Folder.allowed(p, "write")).toBe(false);
});

test("寫白名單外的檔案會被擋，檔案不會出現", async () => {
  const d = fx();
  const f = new Folder(d);
  await expect(f.writeText("resume.yaml", "x")).rejects.toThrow();
  await expect(f.writeText("../escape.txt", "x")).rejects.toThrow();
  await expect(f.readText("AGENTS.md")).rejects.toThrow();
});

test("透過捷徑（symlink）跑到資料夾外面會被擋", async () => {
  const d = fx();
  const outside = emptyTemp();
  dirs.push(outside);
  writeFileSync(join(outside, "secret.yaml"), "secret: 1");
  try {
    symlinkSync(outside, join(d, "targets", "link"), "junction");
  } catch {
    return; // 這台機器不能建捷徑就略過這一題的前提（不是測試失敗）
  }
  const f = new Folder(d);
  await expect(f.readText("targets/link")).rejects.toThrow();
});

test("讀 YAML 和清單", async () => {
  const f = new Folder(fx());
  const t: any = await f.readYaml("targets/261008-01.yaml");
  expect(t.job_id).toBe("261008-01");
  expect(f.list("targets")).toEqual(["261008-01.yaml"]);
  expect(f.list("jobs", "dir")).toEqual(["261008-01"]);
  expect(f.list("submitted")).toEqual(["261005-01_1.json"]);
  expect(await f.readText("resumes/none.html")).toBeNull();
});

test("找資料夾：--dir 優先；編譯後用執行檔所在的資料夾；開發模式沒給就是 null", () => {
  expect(resolveDataDir(["--dir", "x"], "C:/bun/bun.exe")).toBe(join(process.cwd(), "x"));
  expect(resolveDataDir(["--folder=y"], "/usr/bin/bun")).toBe(join(process.cwd(), "y"));
  expect(resolveDataDir([], "D:/求職/jobhunt.exe")).toBe("D:/求職");
  expect(resolveDataDir([], "/Users/a/job-hunt/jobhunt-mac-arm64")).toBe("/Users/a/job-hunt");
  expect(resolveDataDir([], "C:/x/bun.exe")).toBeNull();
  expect(isCompiledBinary("/usr/local/bin/bun")).toBe(false);
  expect(isCompiledBinary("C:/x/jobhunt.exe")).toBe(true);
});

test("編譯好的程式：check 和 read 不接受 --dir/--folder（只能用程式所在的資料夾）；開發模式和打開介面照舊", () => {
  const exe = "D:/求職/jobhunt.exe";
  for (const argv of [["read", "--dir", "D:/other", "a.docx"], ["read", "--dir=D:/other", "a.docx"], ["read", "a.docx", "--folder", "x"], ["check", "--folder=x"]])
    expect({ argv, refused: dirFlagRefused(argv[0], argv, exe) }).toEqual({ argv, refused: true });
  expect(dirFlagRefused("read", ["read", "inbox/a.docx"], exe)).toBe(false);
  expect(dirFlagRefused("read", ["read", "inbox/--dir.docx"], exe)).toBe(false);
  expect(dirFlagRefused("read", ["--dir", "x", "read", "a.docx"], "C:/bun/bun.exe")).toBe(false);
  expect(dirFlagRefused("check", ["check", "--dir", "x"], "/usr/local/bin/bun")).toBe(false);
  expect(dirFlagRefused(undefined, ["--dir", "x", "--no-open"], exe)).toBe(false);
});

test("沒有 AGENTS.md 就不是求職資料夾", () => {
  const e = emptyTemp();
  dirs.push(e);
  expect(looksLikeJobhuntFolder(e)).toBe(false);
  expect(looksLikeJobhuntFolder(fx())).toBe(true);
  mkdirSync(join(e, "AGENTS.md"));
  expect(looksLikeJobhuntFolder(e)).toBe(false); // 同名資料夾不算
});
