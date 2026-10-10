// US kit: English numbers, dates and placeholders for the checker (market us only). The shared rules.js knows digits
// and "May 2024" but not "five hundred", "$1.2M", "05/2024" or "[Company Name]". Everything here runs on BOTH sides of
// the comparison (the resume text and the confirmed facts in resume.yaml), so a spelling never matters on its own.
import * as R from "../../web/js/core/rules.js";

const INVISIBLE = /[­​-‏⁠-⁤﻿]/g;

// ---------------------------------------------------------------- dates

const MONTH_WORD =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_YEAR = new RegExp(String.raw`(?<![A-Za-z])(${MONTH_WORD})\.?\s+((?:19|20)[0-9]{2})(?![0-9])`, "gi"); // May 2024, Sept. 2024
const SLASH_YEAR = /(?<![0-9/.-])(0?[1-9]|1[0-2])\s?\/\s?((?:19|20)[0-9]{2})(?![0-9])/g; // 05/2024, 5/2024
const QUARTER = /(?<![A-Za-z0-9])Q[1-4](?![0-9])/g; // Q3: a quarter, not a number

export type YearMonth = { year: string; month: string; index: number; length: number; text: string };

/** Month-and-year dates written the American way (May 2024, Sept. 2024, 05/2024), with `month` as "01".."12". */
export function englishYearMonths(t: string): YearMonth[] {
  const out: YearMonth[] = [];
  for (const m of t.matchAll(MONTH_YEAR)) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    out.push({ year: m[2], month: String(month).padStart(2, "0"), index: m.index!, length: m[0].length, text: m[0] });
  }
  for (const m of t.matchAll(SLASH_YEAR)) out.push({ year: m[2], month: m[1].padStart(2, "0"), index: m.index!, length: m[0].length, text: m[0] });
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- number words

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
type Kind = "unit" | "teen" | "tens" | "hundred" | "scale";
const kindOf = (w: string): Kind => (w in UNITS ? "unit" : w in TEENS ? "teen" : w in TENS ? "tens" : w === "hundred" ? "hundred" : "scale");
const ALL_WORDS = [...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), "hundred", ...Object.keys(SCALES)];
// "five hundred and twelve": "and" joins the run only right after hundred / thousand / ...
const WORD_RUN = new RegExp(
  String.raw`(?<![A-Za-z])(?:${ALL_WORDS.join("|")})(?:(?:[-\s]+|(?<=hundred|thousand|million|billion)\s+and\s+)(?:${ALL_WORDS.join("|")}))*(?![A-Za-z])`,
  "gi",
);
// "one" alone is mostly a pronoun ("one of the", "no one"); it only counts before a counted thing.
const ONE_COUNTED = /^[-\s]+(?:year|month|week|day|hour|semester|quarter|person|member|student|customer|client|team|project|store|location|department|site|branch)/i;

/** Which token may follow which inside one number ("two hundred fifty", "twenty-five", "two thousand five hundred"). */
function follows(prev: Kind, cur: Kind): boolean {
  switch (prev) {
    case "unit": return cur === "hundred" || cur === "scale";
    case "teen": return cur === "scale" || cur === "hundred"; // eleven hundred = 1100
    case "tens": return cur === "unit" || cur === "scale";
    case "hundred": return cur !== "hundred";
    case "scale": return cur !== "scale";
  }
}

/** "five hundred" → "500", "twenty-five" → "25"; a run that is not one number ("ten two") becomes several. */
function wordsToDigits(run: string, after: string): string {
  const tokens = run.toLowerCase().split(/[-\s]+/).filter((w) => w !== "and");
  if (tokens.length === 1 && tokens[0] === "one" && !ONE_COUNTED.test(after)) return run;
  const out: string[] = [];
  let total = 0, cur = 0, prev: Kind | null = null;
  const flush = () => {
    if (prev) out.push(String(total + cur));
    total = cur = 0;
    prev = null;
  };
  for (const w of tokens) {
    const k = kindOf(w);
    if (prev && !follows(prev, k)) flush();
    if (k === "unit") cur += UNITS[w];
    else if (k === "teen") cur += TEENS[w];
    else if (k === "tens") cur += TENS[w];
    else if (k === "hundred") cur = (cur || 1) * 100;
    else {
      total += (cur || 1) * SCALES[w];
      cur = 0;
    }
    prev = k;
  }
  flush();
  return out.join(" ");
}

/** "1.2" shifted k places right: shiftDecimal("1.2", 6) = "1200000". */
function shiftDecimal(num: string, k: number): string {
  let [i, f = ""] = num.replace(/,/g, "").split(".");
  if (f.length <= k) {
    i += f + "0".repeat(k - f.length);
    f = "";
  } else {
    i += f.slice(0, k);
    f = f.slice(k);
  }
  i = i.replace(/^0+(?=\d)/, "");
  f = f.replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

const MAGNITUDE = /(?<![0-9.,])([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s?(thousand|million|billion|MM|M|bn|B)(?![A-Za-z0-9])/g;
const MAG_SHIFT: Record<string, number> = { thousand: 3, million: 6, billion: 9, MM: 6, M: 6, bn: 9, B: 9 };

/**
 * The text as the number rules should read it: month-year dates and quarters taken out, number words and magnitudes
 * written as digits ($1.2M, 1.2 million, five hundred, twenty-five, 15 percent), twice / doubled / halved as 2x / 50%.
 * 15K and $1,200,000 and 50% are already read by rules.js.
 */
export function normEnglish(text: string): string {
  let t = String(text).replace(INVISIBLE, "").normalize("NFKC");
  t = t.replace(MONTH_YEAR, " ").replace(SLASH_YEAR, " ").replace(QUARTER, " ");
  t = t.replace(WORD_RUN, (run, offset: number, str: string) =>
    /^(?:hundred|thousand|million|billion)/i.test(run) && /[0-9]\s?$/.test(str.slice(0, offset)) ? run : wordsToDigits(run, str.slice(offset + run.length)), // "1.2 million" is the digits' own
  );
  t = t.replace(/([0-9])-percent(?![A-Za-z])/gi, "$1 percent");
  t = t.replace(MAGNITUDE, (_, num: string, unit: string) => shiftDecimal(num, MAG_SHIFT[unit]));
  // "twice a week" counts events, it does not say "2x"; only "twice as / the / more ..." and "doubled" do
  t = t.replace(/(?<![A-Za-z])(?:twice(?=\s+(?:as|the|that|what|more|fewer|less)(?![A-Za-z]))|doubled(?![A-Za-z]))/gi, "2x").replace(/(?<![A-Za-z])tripled(?![A-Za-z])/gi, "3x");
  t = t.replace(/(?<![A-Za-z])(?:halved|(?:in|by) half)(?![A-Za-z])/gi, "50%");
  return t;
}

// ---------------------------------------------------------------- "50+", "over 50", "more than 50"

const MORE_THAN = [
  /(?<![A-Za-z])(?:over|more than|greater than|exceeding|upwards? of|in excess of)\s+\$?\s?([0-9][0-9,]*(?:\.[0-9]+)?\s?(?:%|k(?![A-Za-z])|x(?![A-Za-z0-9]))?)/gi,
  /(?<![0-9.,])([0-9][0-9,]*(?:\.[0-9]+)?\s?(?:%|k(?![A-Za-z])|x(?![A-Za-z0-9]))?)(?:\s?\+|[-\s]plus(?![A-Za-z]))/gi,
  /(?<![0-9.,])([0-9][0-9,]*(?:\.[0-9]+)?\s?(?:%|k(?![A-Za-z])|x(?![A-Za-z0-9]))?)\s+or\s+more(?![A-Za-z])/gi,
];

const VAGUE = /(?<![A-Za-z])(hundreds|thousands|millions|billions|dozens|tens)\s+of(?![A-Za-z])/gi;

/** "hundreds of", "dozens of" ...: amounts with no number in them. rules.js reads the Chinese ones (幾百, 破千) as
 * numbers; here they are kept as written, so they pass only when the confirmed facts say the same. */
export function vagueAmounts(text: string): string[] {
  return [...new Set([...String(text).replace(INVISIBLE, "").normalize("NFKC").matchAll(VAGUE)].map((m) => `${m[1].toLowerCase()} of`))];
}

/** "More than N" claims in a text, as { n: the number the way R.numbers writes it, quote: what was written }. */
export function moreThanClaims(text: string): { n: string; quote: string }[] {
  const t = normEnglish(text);
  const out: { n: string; quote: string }[] = [];
  for (const re of MORE_THAN)
    for (const m of t.matchAll(re)) {
      // "over 3 months" is a stretch of time ("raised $5,000 over 3 months"), not "more than 3"
      if (/^over\s/i.test(m[0]) && /^\s*(?:days?|weeks?|months?|years?|semesters?|quarters?|terms?)(?![A-Za-z])/i.test(t.slice(m.index! + m[0].length))) continue;
      const n = [...R.numbers(m[1])][0];
      if (n) out.push({ n, quote: m[0].trim() });
    }
  return out;
}

/** Every string of resume.yaml that states a fact (ids and source codes label things, they say nothing). */
export function factText(node: unknown): string {
  const strings = (x: unknown): string[] =>
    typeof x === "string" ? [x] : Array.isArray(x) ? x.flatMap(strings) : x && typeof x === "object" ? Object.entries(x).filter(([k]) => !R.MARKER_KEYS.includes(k)).flatMap(([, v]) => strings(v)) : [];
  return strings(node).join("\n");
}

// ---------------------------------------------------------------- placeholders

const SLOT_WORDS =
  "company|employer|organization|school|university|college|institution|job|title|position|role|date|dates|phone|email|city|state|address|name|degree|major|gpa|location|bullet|detail|skill|month|year|manager|number|url|link";
/** What the AI forgets to fill in: [Company Name], {Your Name}, <Job Title>, Lorem ipsum, "Company Name". (TBD, TODO, XXX are rules.js's.) */
export const EN_PLACEHOLDERS = [
  new RegExp(
    [
      String.raw`[\[{<]\s*(?:your|insert|enter|add)?\s*(?:full\s+)?(?:${SLOT_WORDS})s?(?:\s+(?:name|title|here|number|address))*\s*[\]}>](?!\()`,
      String.raw`(?<![A-Za-z])lorem\s+ipsum(?![A-Za-z])`,
    ].join("|"),
    "gi",
  ),
  // capitalised, so "updated the company name in the CRM" is not one
  /(?<![A-Za-z])(?:(?:Your|Company|Employer|School|University) Name(?: Here)?|Insert [A-Za-z ]{2,30} here)(?![A-Za-z])/g,
];
