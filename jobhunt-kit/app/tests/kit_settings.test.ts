// The kit's .claude/settings.json must let the AI open a finished resume file without a permission question. AGENTS.md tells
// it to run the command with quotes (Windows: Start-Process "resumes\<id>.html"; Mac: open "resumes/<id>.html"), and
// Claude Code matches an allow rule against the whole command text, quotes included: `Start-Process *.html` does NOT
// cover `Start-Process "resumes\x.html"` (checked with claude.exe 2.1.296 on 2026-10-10; `Start-Process "*.html"` does).
// Here `*` matches any text and the rest must match exactly, the way those rules behaved in that run.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCAFFOLD = join(import.meta.dir, "..", "..", "jobhunt", "scaffold");
const KITS = ["workspace-general", "workspace-us"];

const allowRules = (kit: string): string[] =>
  JSON.parse(readFileSync(join(SCAFFOLD, kit, ".claude", "settings.json"), "utf-8")).permissions.allow;

const allowed = (rules: string[], tool: string, command: string) =>
  rules.some((r) => {
    const m = r.match(/^(\w+)\((.*)\)$/);
    if (!m || m[1] !== tool) return false;
    const re = new RegExp("^" + m[2].split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
    return re.test(command);
  });

/** The open-the-resume commands AGENTS.md shows, with <id> filled in. */
const openCommands = (kit: string) => {
  const text = readFileSync(join(SCAFFOLD, kit, "AGENTS.md"), "utf-8");
  const win = text.match(/`(Start-Process "resumes\\<id>\.html")`/);
  const mac = text.match(/`(open "resumes\/<id>\.html")`/);
  if (!win || !mac) throw new Error(`${kit}/AGENTS.md no longer shows both open commands; update this test`);
  return { win: win[1].replace("<id>", "261010-01"), mac: mac[1].replace("<id>", "261010-01") };
};

for (const kit of KITS) {
  test(`${kit}: opening the resume the way AGENTS.md says needs no permission question`, () => {
    const rules = allowRules(kit);
    const { win, mac } = openCommands(kit);
    expect(allowed(rules, "PowerShell", win)).toBe(true);
    expect(allowed(rules, "Bash", mac)).toBe(true);
  });

  test(`${kit}: the open rules stay limited to .html files`, () => {
    const rules = allowRules(kit);
    expect(allowed(rules, "PowerShell", 'Start-Process "jobhunt.exe"')).toBe(false);
    expect(allowed(rules, "PowerShell", 'Start-Process "x.html" ; Remove-Item me')).toBe(false);
    expect(allowed(rules, "Bash", 'open "/Applications/Terminal.app"')).toBe(false);
  });
}
