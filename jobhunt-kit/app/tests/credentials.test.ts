// US resume: Certifications and Training (online courses, badges) print as their own last section, not inside Skills.
// The split is opt-in: only a resume.yaml whose section order lists `credentials` gets it, so older folders and the Taiwan variant keep one section.
import { expect, test } from "bun:test";
import * as R from "../../web/js/core/rules.js";
import { renderResume } from "../src/render.ts";
import tplUs from "../../jobhunt/scaffold/workspace-us/templates/resume-us.html" with { type: "text" };

const data = (sections: string[]) => ({
  basics: { name: "Jane Doe", email: "jane@example.com" },
  variants: { en: { title: "English" } },
  sections,
  section_titles: { skills: "Skills", credentials: "Certifications" },
  education: [{ school: "State University", degree: "B.A.", dates: "2026" }],
  skills: [
    { label: "Software", items: ["Excel"] },
    { label: "Certifications", items: ["CPR certified"] },
    { label: "Languages", items: ["Spanish (native)"] },
    { label: "Training", items: ["Google Sheets course"] },
  ],
});
const lines = (doc: any, kind: string) => doc.sections.find((s: any) => s.kind === kind)?.lines.map((l: any) => l.label);

test("credentials in the section order: Skills keeps Software and Languages; Certifications and Training move to the last section", () => {
  const doc = R.resolve(data(["summary", "skills", "education", "credentials"]), "en");
  expect(doc.sections.map((s: any) => s.kind)).toEqual(["skills", "education", "credentials"]);
  expect(lines(doc, "skills")).toEqual(["Software", "Languages"]);
  expect(lines(doc, "credentials")).toEqual(["Certifications", "Training"]);
});

test("no credentials in the order (older folders, the Taiwan variant): one skills section with every line, as before", () => {
  const doc = R.resolve(data(["summary", "skills", "education"]), "en");
  expect(lines(doc, "skills")).toEqual(["Software", "Certifications", "Languages", "Training"]);
  expect(doc.sections.some((s: any) => s.kind === "credentials")).toBe(false);
});

test("an empty Certifications line is not printed, and with no credential line at all there is no Certifications section", () => {
  const d: any = data(["skills", "education", "credentials"]);
  d.skills = d.skills.map((l: any) => (l.label === "Certifications" || l.label === "Training" ? { ...l, items: [] } : l));
  const doc = R.resolve(d, "en");
  expect(doc.sections.map((s: any) => s.kind)).toEqual(["skills", "education"]);
  expect(doc.sections[0].lines.length).toBe(2);
});

test("a resume made of only credential lines has no Skills section", () => {
  const d: any = data(["skills", "education", "credentials"]);
  d.skills = d.skills.filter((l: any) => l.label === "Certifications");
  expect(R.resolve(d, "en").sections.map((s: any) => s.kind)).toEqual(["education", "credentials"]);
});

test("program preview (US template): headings are Skills ... Certifications, Certifications is last, Training sits under it", () => {
  const html = renderResume("us", R.resolve(data(["summary", "skills", "education", "credentials"]), "en"));
  const heads = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
  expect(heads).toEqual(["Skills", "Education", "Certifications"]);
  const last = html.slice(html.indexOf("<h2>Certifications</h2>"));
  // the heading already says "Certifications": that line has no label of its own; Training keeps its label
  expect(last).toContain("<li>CPR certified</li>");
  expect(last).not.toContain("Certifications:");
  expect(last).toContain('<span class="label">Training:</span> Google Sheets course');
  expect(last).toContain('<ul class="skills">'); // the checker treats it like a skills line
  expect(html.slice(0, html.indexOf("<h2>Certifications</h2>"))).not.toContain("CPR certified");
});

test("program preview without the split keeps the old single heading", () => {
  const html = renderResume("us", R.resolve(data(["summary", "skills", "education"]), "en"));
  expect([...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Skills &amp; Certifications", "Education"]);
});

test("template resume-us.html: Skills, Education, Experience, Projects & Activities, then Certifications last", () => {
  const heads = [...tplUs.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
  expect(heads).toEqual(["Summary", "Skills", "Education", "Experience", "Projects &amp; Activities", "Certifications"]);
});
