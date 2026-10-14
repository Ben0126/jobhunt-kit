// 職缺的領域分類（src/fields.ts）：每個科系都該有地方放，不只是工程。標題決定；自己加的關鍵字最優先。
import { expect, test } from "bun:test";
import { FIELDS, fieldLabel, fieldOf, fieldOrder } from "../src/fields.ts";

// title, source category, the field it should land in
const CASES: [string, string, string][] = [
  // technology
  ["Software Engineer Intern", "Software", "software"],
  ["Machine Learning Engineer Intern - E-Commerce User Growth", "", "software"], // a business word inside software work
  ["Data Analyst Intern", "AI/ML/Data", "software"],
  ["IT Support Intern", "", "software"],
  ["IT Business Analyst Intern", "", "software"],
  ["Sparse Linear Algebra Libraries Intern", "", "other"], // "libraries" is not a library job
  ["Oncology Drug Safety Co-op", "", "science"],
  ["Library Assistant (Entry Level)", "", "education"],
  ["Cybersecurity Analyst Intern", "", "software"],
  ["FPGA Design Intern", "Hardware", "hardware"],
  ["Embedded Software Engineer", "Software", "hardware"],
  ["Electrical Engineering Intern", "", "hardware"],
  ["Mechanical Engineering Intern", "", "engineering"],
  ["Civil Engineer Co-op", "", "engineering"],
  ["Manufacturing Engineering Intern", "", "engineering"],
  ["Chemical Engineer Intern", "", "engineering"],
  // life and physical science, health
  ["Research Assistant Intern", "", "science"],
  ["Laboratory Technician (New Grad)", "", "science"],
  ["Environmental Scientist - Entry Level", "", "science"],
  ["Pharmacy Intern - Grad", "", "health"],
  ["Clinical Research Coordinator", "", "health"],
  ["Registered Nurse - New Grad Program", "", "health"],
  ["Public Health Analyst Intern", "", "health"],
  // business, finance, law, people
  ["Business Analyst Intern", "Product", "business"],
  ["Management Consulting Summer Analyst", "", "business"],
  ["Financial Analyst Intern", "", "finance"],
  ["Audit Associate - Fall Intern", "", "finance"],
  ["Wealth – Summer Analyst, New York", "", "finance"],
  ["Summer Associate", "Quant", "finance"],
  ["HR Intern", "", "people"],
  ["Talent Acquisition Coordinator", "", "people"],
  ["Paralegal Intern", "", "people"],
  ["Compliance Analyst - New Grad", "", "people"],
  // marketing, design, media, operations
  ["Marketing Intern", "", "marketing"],
  ["Social Media Intern", "", "marketing"],
  ["Sales Development Representative - New Grad", "", "marketing"],
  ["Communications Intern", "", "marketing"],
  ["Product Manager Intern", "Product", "design"],
  ["UX Designer Intern", "", "design"],
  ["Graphic Design Intern", "", "design"],
  ["Editorial Intern", "", "media"],
  ["Video Production Intern", "", "media"],
  ["Supply Chain Intern", "", "operations"],
  ["Store Executive Intern (Store Leadership)", "", "operations"],
  ["Customer Service Associate", "", "operations"],
  ["Administrative Assistant Intern", "", "operations"],
  // education, public service
  ["Teaching Assistant (Entry Level)", "", "education"],
  ["Nonprofit Program Coordinator Intern", "", "education"],
  ["Policy Analyst Intern", "", "education"],
  ["Social Work Intern", "", "education"],
  // nothing in the title: the source's category, then "other"
  ["Summer Intern", "Hardware", "hardware"],
  ["Mystery Intern", "", "other"],
];

test("領域分類：各個科系的職稱都有地方放（工程、理科、醫護、商管、財務、法律人資、行銷、設計、媒體、營運、教育公共）", () => {
  const wrong = CASES.filter(([title, cat, want]) => fieldOf(title, cat) !== want).map(([title, cat, want]) => `${title} [${cat}] -> ${fieldOf(title, cat)} (wanted ${want})`);
  expect(wrong).toEqual([]);
  // every built-in field is reachable (no dead rule) and has both names
  const reached = new Set(CASES.map(([title, cat]) => fieldOf(title, cat)));
  for (const f of FIELDS) expect(reached.has(f.id), `no case lands in ${f.id}`).toBe(true);
  expect(reached.has("other")).toBe(true);
  for (const f of FIELDS) expect([f.en, f.zh, f.shortEn, f.shortZh].every((x) => x.length > 0)).toBe(true);
});

test("自己加的關鍵字最優先：可以加進內建領域，也可以自己開新領域", () => {
  expect(fieldOf("Quant Dev Intern", "", {})).not.toBe("software");
  expect(fieldOf("Quant Dev Intern", "", { software: ["quant dev"] })).toBe("software");
  expect(fieldOf("LSAT Tutor", "", { "pre-law": ["lsat"] })).toBe("pre-law");
  expect(fieldOf("Marketing Intern", "", { "pre-law": [] })).toBe("marketing"); // an empty list does nothing
  // characters with meaning in a regex are plain text
  expect(fieldOf("C++ Intern (.NET)", "", { software: ["c++", ".net"] })).toBe("software");
});

test("名稱和順序：內建的照清單順序、自己開的排後面、other 最後；英文和中文都有名稱；自己開的就用它自己的名字", () => {
  expect(fieldOrder(["other", "zeta", "finance", "software", "alpha"])).toEqual(["software", "finance", "alpha", "zeta", "other"]);
  expect(fieldLabel("hardware", "en")).toBe("Electrical & hardware");
  expect(fieldLabel("hardware", "zh-TW")).toBe("電機與硬體");
  expect(fieldLabel("hardware", "en", true)).toBe("Hardware");
  expect(fieldLabel("pre-law", "en")).toBe("pre-law");
  expect(fieldLabel("other", "zh-TW", true)).toBe("其他");
});
