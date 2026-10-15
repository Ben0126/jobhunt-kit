// `jobhunt resume-sections`: move an older US folder's resume.yaml to the layout where Certifications and Training print
// as their own last section (the `credentials` section). New folders already have it; an old resume.yaml is the person's
// file, so this is a separate step: it shows the exact lines it would change, and writes only after `--yes`.
//
// Minimal text edit, never a rewrite: the `sections:` line gets `credentials` added, and the section titles say "Skills" and
// "Certifications". Every comment, every other line and the line endings stay as they are. The result is parsed again and must
// say exactly what the old file said plus those additions, or nothing is written.
import { copyFileSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliTextFor } from "./cli.text.ts";
import { readMarketSync } from "./market.ts";
import { readModeSync } from "./mode.ts";
import { programCommand } from "./selfupdate.ts";
import { programName } from "./update.ts";

export type SectionsPlan =
  | { ok: true; text: string; diff: { before: string; after: string }[]; notes: string[] }
  | { ok: false; reason: "already" | "no-sections" | "unsupported" | "unreadable" };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function planCredentials(oldText: string): SectionsPlan {
  let old: any;
  try {
    old = Bun.YAML.parse(oldText);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!isObj(old)) return { ok: false, reason: "unreadable" };
  if (old.sections === undefined) return { ok: false, reason: "no-sections" }; // default order: it has no Certifications section to add to
  if (!Array.isArray(old.sections) || !old.sections.every((s) => typeof s === "string")) return { ok: false, reason: "unsupported" };
  if (old.sections.includes("credentials")) return { ok: false, reason: "already" };

  const crlf = /\r\n/.test(oldText);
  const lines = oldText.replace(/\r\n/g, "\n").split("\n");
  const diff: { before: string; after: string }[] = [];
  const change = (i: number, to: string) => {
    diff.push({ before: lines[i], after: to });
    lines[i] = to;
  };

  const at = lines.findIndex((l) => /^sections\s*:/.test(l));
  const m = at < 0 ? null : /^(sections\s*:\s*\[)(.*?)(\])(\s*(?:#.*)?)$/.exec(lines[at]);
  if (!m) return { ok: false, reason: "unsupported" }; // a list written one item per line: leave it to a person
  change(at, `${m[1]}${m[2].trimEnd() ? `${m[2].trimEnd()}, ` : ""}credentials${m[3]}${m[4]}`);

  // titles: only a title that still holds the old words is changed; a title the person wrote is theirs
  const t = old.section_titles;
  if (isObj(t)) {
    const flow = lines.findIndex((l) => /^section_titles\s*:\s*\{.*\}\s*(#.*)?$/.test(l));
    const block = lines.findIndex((l) => /^section_titles\s*:\s*(#.*)?$/.test(l));
    if (flow >= 0) {
      let l = lines[flow];
      if (t.skills === "Skills & Certifications") l = l.replace(/(\bskills\s*:\s*)["']?Skills & Certifications["']?/, "$1Skills");
      if (!("credentials" in t)) l = l.replace(/\s*\}(\s*(?:#.*)?)$/, ", credentials: Certifications}$1");
      if (l !== lines[flow]) change(flow, l);
    } else if (block >= 0) {
      let end = block + 1;
      while (end < lines.length && /^(\s+\S|\s*(#.*)?$)/.test(lines[end]) && !/^\S/.test(lines[end])) end++;
      while (end > block + 1 && /^\s*(#.*)?$/.test(lines[end - 1])) end--; // blank and comment lines belong to what follows
      const sk = lines.slice(block + 1, end).findIndex((l) => /^\s+skills\s*:/.test(l));
      const indent = /^(\s+)\S/.exec(lines[block + 1])?.[1] ?? "  ";
      let insertAfter = end - 1;
      if (sk >= 0) {
        const i = block + 1 + sk;
        insertAfter = i;
        if (t.skills === "Skills & Certifications") change(i, lines[i].replace(/(skills\s*:\s*)["']?Skills & Certifications["']?/, "$1Skills"));
      }
      if (!("credentials" in t)) {
        diff.push({ before: "", after: `${indent}credentials: Certifications` });
        lines.splice(insertAfter + 1, 0, `${indent}credentials: Certifications`);
      }
    }
  }

  const text = lines.join(crlf ? "\r\n" : "\n");
  // The new file must say what the old one said, plus `credentials` and the two titles. Anything else changing = write nothing.
  let next: any;
  try {
    next = Bun.YAML.parse(text);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!isObj(next) || !same(next.sections, [...old.sections, "credentials"])) return { ok: false, reason: "unreadable" };
  for (const k of Object.keys(old)) if (k !== "sections" && k !== "section_titles" && !same(next[k], old[k])) return { ok: false, reason: "unreadable" };
  if (Object.keys(next).length !== Object.keys(old).length) return { ok: false, reason: "unreadable" };
  if (isObj(t)) {
    const nt = next.section_titles;
    if (!isObj(nt)) return { ok: false, reason: "unreadable" };
    for (const k of new Set([...Object.keys(t), ...Object.keys(nt)])) if (k !== "skills" && k !== "credentials" && !same(nt[k], t[k])) return { ok: false, reason: "unreadable" };
  }

  // a variant with its own section list keeps it (the Chinese one has no Certifications section); say which ones
  const notes: string[] = [];
  if (isObj(old.variants))
    for (const [name, spec] of Object.entries(old.variants))
      if (name !== "tw" && isObj(spec) && Array.isArray(spec.sections) && spec.sections.includes("skills") && !spec.sections.includes("credentials")) notes.push(name);
  return { ok: true, text, diff, notes };
}

/** `jobhunt resume-sections [--yes]`. No `--yes`: show what would change, change nothing. Exit codes: 0 done, shown or nothing to do; 2 could not. */
export function runResumeSections(argv: string[], dir: string | null, print: (s: string) => void = (s) => console.log(s)): number {
  const T = cliTextFor(dir ? readMarketSync(dir).language : "en");
  if (!dir) {
    print(T.notFolder1);
    return 2;
  }
  const args = argv.slice(argv.indexOf("resume-sections") + 1).filter((a, i, all) => !/^--(dir|folder)(=|$)/.test(a) && !/^--(dir|folder)$/.test(all[i - 1] ?? ""));
  const cmd = programCommand(programName() ?? "jobhunt");
  if (args.some((a) => a !== "--yes")) {
    print(T.sectionsUsage(cmd));
    return 2;
  }
  const yes = args.includes("--yes");
  const markets = readModeSync(dir);
  if (!(markets.markets.includes("us") || readMarketSync(dir).market === "us")) {
    print(T.sectionsNotUs);
    return 0;
  }
  const file = join(dir, "resume.yaml");
  let st;
  try {
    st = lstatSync(file);
  } catch {
    print(T.sectionsNoFile);
    return 2;
  }
  if (!st.isFile() || st.isSymbolicLink()) {
    print(T.sectionsNotPlain);
    return 2;
  }
  const plan = planCredentials(readFileSync(file, "utf-8"));
  if (!plan.ok) {
    print(plan.reason === "already" ? T.sectionsAlready : plan.reason === "no-sections" ? T.sectionsNoList : plan.reason === "unsupported" ? T.sectionsUnsupported : T.sectionsUnreadable);
    return plan.reason === "already" || plan.reason === "no-sections" ? 0 : 2;
  }
  print(T.sectionsPreview);
  for (const d of plan.diff) {
    if (d.before) print(`  - ${d.before}`);
    print(`  + ${d.after}`);
  }
  for (const n of plan.notes) print(T.sectionsNote(n));
  if (!yes) {
    print(T.sectionsNotYet(cmd));
    return 0;
  }
  try {
    mkdirSync(join(dir, ".jobhunt"), { recursive: true });
    const backup = join(dir, ".jobhunt", "resume.yaml.before-credentials");
    copyFileSync(file, backup);
    const tmp = `${file}.tmp-sections`;
    writeFileSync(tmp, plan.text);
    renameSync(tmp, file);
    print(T.sectionsDone(".jobhunt/resume.yaml.before-credentials"));
    return 0;
  } catch {
    print(T.sectionsFailed);
    return 2;
  }
}

