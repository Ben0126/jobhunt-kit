// Codex (OpenAI) reads the same kit as Claude Code. Three things have to stay true for it:
//  1. AGENTS.md fits in what Codex loads (project_doc_max_bytes, 32 KiB by default; it silently stops adding text after that).
//  2. Skills are kept once (.claude/skills); the release build copies them to .agents/skills, where Codex looks.
//  3. The two commands .claude/settings.json pre-approves (check, read) are pre-approved in .codex/rules too, and nothing more.
// The rule syntax itself was checked with `codex execpolicy check` (codex-cli 0.162.1); that tool isn't run here.
import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { replaceable } from "../src/selfupdate.ts";

const SCAFFOLD = join(import.meta.dir, "..", "..", "jobhunt", "scaffold");
const KITS: [string, "tw" | "us"][] = [["workspace-general", "tw"], ["workspace-us", "us"]];

test("AGENTS.md 小於 Codex 預設載入上限（32 KiB）並留餘地給別的指示檔", () => {
  for (const [kit] of KITS) {
    const bytes = statSync(join(SCAFFOLD, kit, "AGENTS.md")).size;
    expect(bytes, `${kit}/AGENTS.md is ${bytes} bytes`).toBeLessThan(29 * 1024);
  }
});

test("技能只在 .claude/skills 維護一份；.agents/skills 是發布時複製出來的（release.yml），原始碼裡不放", () => {
  for (const [kit] of KITS) expect(existsSync(join(SCAFFOLD, kit, ".agents")), kit).toBe(false);
  const wf = readFileSync(join(import.meta.dir, "..", "..", "..", ".github", "workflows", "release.yml"), "utf-8");
  expect(wf).toContain('cp -R "pkg/$d/.claude/skills" "pkg/$d/.agents/skills"');
  expect(wf).toContain('".agents/skills/start/SKILL.md"'); // and the zip check fails if the copy did not happen
});

test(".codex/rules 預先允許的指令，和 .claude/settings.json 的 check／read 一樣，沒有多的", () => {
  for (const [kit] of KITS) {
    const rules = readFileSync(join(SCAFFOLD, kit, ".codex", "rules", "jobhunt.rules"), "utf-8");
    // every rule: the program, the one sub-command, and an explicit "allow"
    const found = [...rules.matchAll(/pattern = \["((?:[^"\\]|\\.)*)", "(\w+)"\],\s*decision = "(\w+)"/g)].map((m) => [m[1].replaceAll("\\\\", "\\"), m[2], m[3]]);
    expect(found.every((f) => f[2] === "allow"), kit).toBe(true);
    expect(new Set(found.map((f) => f[1]))).toEqual(new Set(["check", "read"]));
    expect(found.length).toBe(8); // 4 program names x (check, read)
    // the programs are the ones the Claude settings allow
    const settings: string[] = JSON.parse(readFileSync(join(SCAFFOLD, kit, ".claude", "settings.json"), "utf-8")).permissions.allow;
    for (const [prog, sub] of found) {
      const claude = settings.some((r) => r === `PowerShell(${prog} ${sub})` || r === `PowerShell(${prog} ${sub} *)` || r === `Bash(${prog} ${sub})` || r === `Bash(${prog} ${sub} *)`);
      expect(claude, `${prog} ${sub} is allowed for Codex but not for Claude Code`).toBe(true);
    }
  }
});

test("一鍵更新會換 .agents 和 .codex 裡的檔（和 .claude 一樣），不會碰別的", () => {
  for (const [, market] of KITS) {
    expect(replaceable(".agents/skills/start/SKILL.md", market, "jobhunt.exe")).toBe(true);
    expect(replaceable(".codex/rules/jobhunt.rules", market, "jobhunt.exe")).toBe(true);
    expect(replaceable(".codex/", market, "jobhunt.exe")).toBe(false);
    expect(replaceable(".codex/../resume.yaml", market, "jobhunt.exe")).toBe(false);
  }
});
