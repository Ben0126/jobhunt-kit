// Put together the one-for-all kit folder (docs/plan-dual-market.zh-TW.md) from the sources in the repository:
//   jobhunt/scaffold/kit/              the folder's own top level: setup AGENTS.md, start guides, jobhunt.yaml, settings, empty folders
//   jobhunt/scaffold/workspace-us/     the US rule set (AGENTS.md, playbooks, skills, resume.yaml) -> .kit/us
//   jobhunt/scaffold/workspace-general the Taiwan rule set                                         -> .kit/tw
//   jobhunt/scaffold/kit/both/         what "both" adds to the US set (an AGENTS.md section, playbooks, skills, resume.yaml) -> .kit/both
// and every template of both kits in templates/. Nothing is written twice in the repository: the two tested rule sets stay
// where they are and are copied in here.
//
//   bun kitbuild.ts <out folder>     (release.yml: pkg/job-hunt-kit; the program file is added next to it there)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCAFFOLD = join(import.meta.dir, "..", "jobhunt", "scaffold");
export const KIT_SRC = join(SCAFFOLD, "kit");
const US = join(SCAFFOLD, "workspace-us");
const TW = join(SCAFFOLD, "workspace-general");
const BOTH = join(KIT_SRC, "both");

/** Folders a mode needs that only some modes have: made by the installer when missing. */
const DIRS: Record<string, string[]> = { us: ["profiles"], tw: ["104"], both: ["profiles", "104"] };

function copyDir(from: string, to: string): void {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function ruleSet(out: string, name: string, src: string, extra?: string): void {
  const dir = join(out, ".kit", name);
  mkdirSync(dir, { recursive: true });
  let agents = readFileSync(join(src, "AGENTS.md"), "utf-8");
  if (extra) agents = agents.replace(/\s*$/, "\n\n") + readFileSync(join(extra, "AGENTS-add.md"), "utf-8");
  writeFileSync(join(dir, "AGENTS.md"), agents);
  copyDir(join(src, "playbooks"), join(dir, "playbooks"));
  copyDir(join(src, ".claude", "skills"), join(dir, "skills"));
  if (extra) {
    copyDir(join(extra, "playbooks"), join(dir, "playbooks"));
    copyDir(join(extra, "skills"), join(dir, "skills"));
    // 104 comes from the Taiwan kit as it is, with a short note on top pointing to taiwan.md's table of what its references mean here
    const header = readFileSync(join(extra, "fill-104-header.md"), "utf-8");
    writeFileSync(join(dir, "playbooks", "fill-104.md"), header + readFileSync(join(TW, "playbooks", "fill-104.md"), "utf-8"));
  }
  const resume = extra && existsSync(join(extra, "resume.yaml")) ? join(extra, "resume.yaml") : join(src, "resume.yaml");
  writeFileSync(join(dir, "resume.yaml"), readFileSync(resume));
  writeFileSync(join(dir, "set.json"), JSON.stringify({ mode: name, dirs: DIRS[name] }, null, 2) + "\n");
}

/** Build the kit into `out` (emptied first). */
export function assembleKit(out: string): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // top level, without the "both" sources
  for (const e of readdirSync(KIT_SRC, { withFileTypes: true })) {
    if (e.name === "both") continue; // only the both rule set uses it
    cpSync(join(KIT_SRC, e.name), join(out, e.name), { recursive: true });
  }
  copyDir(join(TW, "templates"), join(out, "templates"));
  copyDir(join(US, "templates"), join(out, "templates"));
  ruleSet(out, "us", US);
  ruleSet(out, "tw", TW);
  ruleSet(out, "both", US, BOTH);
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: bun kitbuild.ts <out folder>");
    process.exit(2);
  }
  assembleKit(out);
  console.log(`kit assembled in ${out}`);
}
