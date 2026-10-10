// P6 (command line side), the text tables: each language table has the same entries, the English one has no Chinese and no
// empty entry, and no sentence is typed into the code outside the tables (only the machine markers the program reads).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TABLES as CHECK } from "../src/check.text.ts";
import { TABLES as CLI } from "../src/cli.text.ts";
import { TABLES as DOCX } from "../src/docx.text.ts";

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
const SRC = join(import.meta.dir, "..", "src");

/** Every combination of sample arguments that a table function accepts without throwing, with what it returned. */
function calls(fn: (...a: any[]) => unknown): { args: unknown[]; out: unknown }[] {
  const samples: unknown[] = ["X", 3, ["X", "Y"], true];
  const n = fn.length;
  const out: { args: unknown[]; out: unknown }[] = [];
  const walk = (args: unknown[]) => {
    if (args.length === n) {
      try {
        out.push({ args, out: fn(...args) });
      } catch {}
      return;
    }
    for (const s of samples) walk([...args, s]);
  };
  walk([]);
  return out;
}

function flatten(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(flatten);
  if (v && typeof v === "object") return Object.values(v).flatMap(flatten);
  return [];
}

for (const [name, tables] of Object.entries({ "check.text.ts": CHECK, "docx.text.ts": DOCX, "cli.text.ts": CLI })) {
  const zh: any = tables["zh-TW"];
  const en: any = tables.en;

  test(`${name}: Chinese and English tables have the same entries, kinds and argument counts`, () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const k of Object.keys(zh)) {
      expect({ k, type: typeof en[k] }).toEqual({ k, type: typeof zh[k] });
      if (typeof zh[k] === "function") expect({ k, arity: en[k].length }).toEqual({ k, arity: zh[k].length });
      if (zh[k] && typeof zh[k] === "object") expect({ k, keys: Object.keys(en[k]).sort() }).toEqual({ k, keys: Object.keys(zh[k]).sort() });
    }
  });

  test(`${name}: every English entry says something and has no Chinese character (functions tried with sample arguments)`, () => {
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === "function") {
        const results = calls(v as any);
        expect({ k, tried: results.length > 0 }).toEqual({ k, tried: true });
        for (const r of results) {
          const text = flatten(r.out);
          expect({ k, args: r.args, empty: text.length === 0 || text.some((t) => !t.trim()) }).toEqual({ k, args: r.args, empty: false });
          expect({ k, args: r.args, cjk: text.filter((t) => CJK.test(t)) }).toEqual({ k, args: r.args, cjk: [] });
        }
      } else {
        const text = flatten(v);
        expect({ k, empty: text.some((t) => !t.trim()) }).toEqual({ k, empty: false });
        expect({ k, cjk: text.filter((t) => CJK.test(t)) }).toEqual({ k, cjk: [] });
      }
    }
  });

  test(`${name}: the Chinese table gives a Chinese sentence for every entry that is text`, () => {
    for (const [k, v] of Object.entries(zh)) {
      if (typeof v !== "string") continue;
      if (["sourceWord"].includes(k)) continue;
      expect({ k, zh: CJK.test(v) || /^[#\- ]*[A-Za-z0-9 ]+/.test(v) }).toEqual({ k, zh: true });
    }
  });
}

test("the English wording uses the glossary words of the US AGENTS.md (Targets file, Resume file, Resume data, for the AI, passed)", () => {
  const en = CHECK.en;
  expect([en.targetsFile, en.resumeFile, en.resumeData]).toEqual(["Targets file", "Resume file", "Resume data"]);
  expect(en.problemLine(1, "Targets file", "msg", undefined, "detail")).toBe("1. Targets file: msg. (for the AI: detail)");
  expect(en.problemLine(2, "Resume file", "msg.", "quote")).toBe('2. Resume file: msg. Quote: "quote"');
  expect(en.lineResult(0)).toBe("- Result: passed");
  expect(en.lineResult(1)).toBe("- Result: failed, 1 problem");
  expect(en.lineResult(2)).toBe("- Result: failed, 2 problems");
  expect(en.allPassed).toBe("All passed.");
  expect(en.leftoverSlot).toContain("{{"); // check.ts looks for "{{" to report a leftover placeholder once
  expect(en.numbersMissing(["5"])).toContain("not in your confirmed experience");
  expect(CHECK["zh-TW"].leftoverSlot).toContain("{{");
});

/** The strings in a source file that hold a Chinese character, comments left out (what a person could read on screen if it
 * were printed, or a marker the program matches). */
function chineseLiterals(file: string): string[] {
  const B = String.fromCharCode(92);
  const lit = new RegExp(`"(?:[^"${B}${B}${B}n]|${B}${B}.)*"|'(?:[^'${B}${B}${B}n]|${B}${B}.)*'|\`(?:[^\`${B}${B}]|${B}${B}.)*\``, "g");
  let src = readFileSync(join(SRC, file), "utf-8");
  src = src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/ .*$/, "")).join("\n");
  return [...src.matchAll(lit)].map((m) => m[0]).filter((s) => CJK.test(s));
}

// The allow-lists: the machine markers the code reads or splits on. A sentence a person reads goes into a *.text.ts table,
// never into this list.
const MARKERS: Record<string, string[]> = {
  "check.ts": [
    '"104/履歷欄位.md"', // the Taiwan 104 file's path
    '"；"', // finds a full-width semicolon in the text (twice)
    '"；"',
    '"學歷"', // source words (Education / Job goals in Chinese)
    '"求職方向"',
    "`(?:[-–—~～至到]|(?:${MONTHS})[a-z]*\\\\.?)\\\\s*$`", // a range dash before a year
    '"（"', // splitSkillItems: brackets and separators of a Chinese skills line
    '"）"',
    '"、"',
    '"，"',
    '"履歷欄位"', // a spelling of the 104 file name accepted on the command line
  ],
  "htmltext.ts": [],
  "profiles.ts": ['"學歷"', '"求職方向"'],
  "docx.ts": ['" ｜ "'], // the cell separator import-resume.md tells the AI about
  "main.ts": [],
  "launch.ts": [],
};

test("no sentence is typed into the code outside the text tables: only the listed machine markers hold Chinese", () => {
  for (const [file, allowed] of Object.entries(MARKERS)) {
    const found = chineseLiterals(file).sort();
    expect({ file, found }).toEqual({ file, found: [...allowed].sort() });
  }
});
