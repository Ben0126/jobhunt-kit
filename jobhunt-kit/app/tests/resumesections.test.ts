// `jobhunt resume-sections`: an older US folder's resume.yaml gets the `credentials` section, by a minimal text edit that is
// shown first and written only after --yes.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planCredentials, runResumeSections } from "../src/resumesections.ts";
import * as R from "../../web/js/core/rules.js";
import { cleanup, emptyTemp } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

// resume.yaml as the US kit wrote it before 2026-10-14
const OLD = `# resume.yaml: comment kept
basics:
  name: Jane Doe
variants:
  en: {title: English, major: 1}

sections: [summary, skills, education, experience, projects]   # skills before education

section_titles:
  summary: Summary
  education: Education
  experience: Experience
  projects: Projects & Activities
  skills: Skills & Certifications

# Skills: comment kept
skills:
  - {label: Software, items: [Excel], sources: [S-004], variants: [en]}
  - {label: Certifications, items: [CPR certified], sources: [S-006], variants: [en]}
`;

test("an old resume.yaml: credentials is added to sections, the titles become Skills / Certifications, nothing else moves", () => {
  const p = planCredentials(OLD);
  if (!p.ok) throw new Error(p.reason);
  expect(p.text).toContain("sections: [summary, skills, education, experience, projects, credentials]   # skills before education");
  expect(p.text).toContain("  skills: Skills\n  credentials: Certifications\n");
  expect(p.text).not.toContain("Skills & Certifications");
  // every other line is byte for byte the old one
  const oldLines = OLD.split("\n"), newLines = p.text.split("\n");
  expect(newLines.filter((l) => !oldLines.includes(l))).toEqual(["sections: [summary, skills, education, experience, projects, credentials]   # skills before education", "  skills: Skills", "  credentials: Certifications"]);
  expect(p.diff.length).toBe(3);
  // and the resume now resolves with the split
  const doc = R.resolve(Bun.YAML.parse(p.text), "en");
  expect(doc.sections.map((s: any) => s.kind)).toEqual(["skills", "credentials"]);
});

test("line endings (CRLF) are kept", () => {
  const p = planCredentials(OLD.replace(/\n/g, "\r\n"));
  if (!p.ok) throw new Error(p.reason);
  expect(p.text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  expect(p.text).toContain("credentials]   # skills before education\r\n");
});

test("nothing to do, or not safe to do: the reason says which", () => {
  const done = planCredentials(OLD.replace("projects]", "projects, credentials]"));
  expect(done).toEqual({ ok: false, reason: "already" });
  expect(planCredentials(OLD.replace(/^sections:.*\n/m, ""))).toEqual({ ok: false, reason: "no-sections" });
  expect(planCredentials(OLD.replace(/^sections:.*\n/m, "sections:\n  - summary\n  - skills\n"))).toEqual({ ok: false, reason: "unsupported" });
  expect(planCredentials("basics: [unclosed")).toEqual({ ok: false, reason: "unreadable" });
});

test("a skills title the person wrote is left alone; credentials title is still added; flow-style titles work", () => {
  const custom = planCredentials(OLD.replace("skills: Skills & Certifications", "skills: What I can do"));
  if (!custom.ok) throw new Error(custom.reason);
  expect(custom.text).toContain("  skills: What I can do\n  credentials: Certifications\n");
  const flow = planCredentials(OLD.replace(/section_titles:\n(  .*\n)+/, "section_titles: {summary: Summary, skills: Skills & Certifications}\n"));
  if (!flow.ok) throw new Error(flow.reason);
  expect(flow.text).toContain("section_titles: {summary: Summary, skills: Skills, credentials: Certifications}");
  const none = planCredentials(OLD.replace(/section_titles:\n(  .*\n)+\n/, ""));
  if (!none.ok) throw new Error(none.reason);
  expect(none.text).not.toContain("section_titles");
});

test("a variant with its own section list is left alone and named (the Chinese one is not mentioned)", () => {
  const both = OLD.replace("variants:\n  en: {title: English, major: 1}", "variants:\n  en: {title: English, major: 1}\n  tw: {title: Chinese, major: 2, sections: [summary, skills]}\n  alt: {title: Alt, major: 3, sections: [summary, skills]}");
  const p = planCredentials(both);
  if (!p.ok) throw new Error(p.reason);
  expect(p.notes).toEqual(["alt"]);
});

const folder = (market: "us" | "tw", yaml = OLD) => {
  const d = emptyTemp();
  dirs.push(d);
  writeFileSync(join(d, "jobhunt.yaml"), market === "us" ? "market: us\nlanguage: en\npaper: letter\n" : "market: tw\nlanguage: zh-TW\npaper: a4\n");
  writeFileSync(join(d, "AGENTS.md"), "x");
  writeFileSync(join(d, "resume.yaml"), yaml);
  return d;
};
const run = (d: string, ...args: string[]) => {
  const out: string[] = [];
  const code = runResumeSections(["resume-sections", ...args], d, (s) => out.push(s));
  return { code, out: out.join("\n") };
};

test("without --yes it only shows the lines and changes nothing; with --yes it writes and keeps a copy; a second run says it is done", () => {
  const d = folder("us");
  const dry = run(d);
  expect(dry.code).toBe(0);
  expect(dry.out).toContain("  - sections: [summary, skills, education, experience, projects]   # skills before education");
  expect(dry.out).toContain("  + sections: [summary, skills, education, experience, projects, credentials]   # skills before education");
  expect(dry.out).toContain("resume-sections --yes");
  expect(readFileSync(join(d, "resume.yaml"), "utf-8")).toBe(OLD);
  expect(existsSync(join(d, ".jobhunt", "resume.yaml.before-credentials"))).toBe(false);

  const go = run(d, "--yes");
  expect(go.code).toBe(0);
  expect(readFileSync(join(d, "resume.yaml"), "utf-8")).toContain("projects, credentials]");
  expect(readFileSync(join(d, ".jobhunt", "resume.yaml.before-credentials"), "utf-8")).toBe(OLD);
  expect(existsSync(join(d, "resume.yaml.tmp-sections"))).toBe(false);

  const again = run(d, "--yes");
  expect(again.code).toBe(0);
  expect(again.out).toContain("already has the new layout");
  expect(readFileSync(join(d, ".jobhunt", "resume.yaml.before-credentials"), "utf-8")).toBe(OLD); // the copy is not overwritten by the no-op
});

test("a Taiwan-only folder is not touched; an unknown option prints the usage; a missing resume.yaml says so", () => {
  const tw = folder("tw");
  const r = run(tw, "--yes");
  expect(r.code).toBe(0);
  expect(readFileSync(join(tw, "resume.yaml"), "utf-8")).toBe(OLD);
  const us = folder("us");
  expect(run(us, "--force").code).toBe(2);
  const empty = emptyTemp();
  dirs.push(empty);
  writeFileSync(join(empty, "jobhunt.yaml"), "market: us\nlanguage: en\npaper: letter\n");
  expect(run(empty).code).toBe(2);
});

test("an unreadable or one-item-per-line resume.yaml: exit 2 and the file is not changed", () => {
  const d = folder("us", OLD.replace(/^sections:.*\n/m, "sections:\n  - summary\n  - skills\n"));
  const before = readFileSync(join(d, "resume.yaml"), "utf-8");
  const r = run(d, "--yes");
  expect(r.code).toBe(2);
  expect(readFileSync(join(d, "resume.yaml"), "utf-8")).toBe(before);
});
