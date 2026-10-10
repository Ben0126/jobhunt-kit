// Personal ID numbers other than the Taiwan ones (those stay in rules.js idNumbers). Used in every market, by the
// checker (check.ts) and the Word reader (docx.ts): a resume must never carry one, and a pasted old resume must not
// hand one to the AI.
//
// What counts (text is matched after NFKC and with invisible characters removed, so full-width digits work):
//   SSN / ITIN   123-45-6789 or 123 45 6789 (3-2-4 digits, same separator twice). Nine digits in a row are NOT an SSN:
//                student numbers and phone numbers look like that.
//   SEVIS        N + 10 digits.
//   A-number     A + 9 digits, A-12345678 / A-123456789 (with the hyphen), A123-456-789, or any A-number written
//                right after a label ("A-Number: A12345678", "Alien registration number 12345678").
//                A bare A + 8 digits (A12345678) is left alone: that is the shape of many university student numbers.
//   China ID     18 characters: area digit 1-9, 5 digits, a birth date 19xx/20xx-MM-DD, 3 digits, check digit or X.
//                The check digit is not verified: a mistyped ID is still personal data.
const B = "(?<![A-Za-z0-9])";
// SEVIS and A-numbers are upper case by definition: a lower-case "n0912345678@gmail.com" is a mailbox, not a SEVIS ID.
const NOT_MAIL = "(?![0-9A-Za-z@])";
const SSN = new RegExp(`${B}[0-9]{3}( ?[-.] ?| )[0-9]{2}\\1[0-9]{4}(?![0-9])`, "g");
const SEVIS = new RegExp(`${B}N[0-9]{10}${NOT_MAIL}`, "g");
const A_NUMBER = new RegExp(`${B}A(?:[0-9]{9}|-[0-9]{8,9}|[0-9]{3}-[0-9]{3}-[0-9]{2,3})${NOT_MAIL}`, "g");
// Labels are spelled out by case: the article in "handled a number 12345678 calls" is not a label.
const A_LABELLED = /(?<=(?:\bA-?[Nn]umber|\bA Number|\b[Aa]lien\s+(?:[Rr]egistration\s+)?[Nn]umber|\bUSCIS(?:\s+[Nn]umber)?|\buscis\s+number)\s*[:#]*\s*)(?:A?-?[0-9]{3}-[0-9]{3}-[0-9]{2,3}|A?-?[0-9]{7,9})(?![0-9])/g;
const CN_ID = new RegExp(`${B}[1-9][0-9]{5}(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx](?![0-9A-Za-z])`, "g");
const PATTERNS = [CN_ID, SSN, SEVIS, A_NUMBER, A_LABELLED];

const INVISIBLE = /[­​-‏⁠-⁤﻿]/g;
const DASH = /[‐-―−]/g; // en-dash, minus sign and friends → "-"
const flat = (s: string) => s.replace(INVISIBLE, "").normalize("NFKC").replace(DASH, "-");

/** The ID-number-looking pieces of `text`, as they read after NFKC (not masked). Nothing for Taiwan IDs. */
export function extraIdMatches(text: string): string[] {
  const t = flat(text);
  return PATTERNS.flatMap((re) => [...t.matchAll(re)].sort((a, b) => a.index! - b.index!).map((m) => m[0]));
}

/** Replace each ID number with fn(match). A line that has one is normalized (NFKC) first, so full-width digits and
 * look-alikes are caught; lines without one keep their own characters. */
export function replaceExtraIds(text: string, fn: (m: string) => string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!extraIdMatches(line).length) return line;
      let t = flat(line);
      for (const re of PATTERNS) t = t.replace(re, (m) => fn(m));
      return t;
    })
    .join("\n");
}

/** `123-45-6789` → `***-**-****`, `N0012345678` → `N**********`: keeps the shape and the leading letter, nothing else. */
export function starMask(m: string): string {
  return m.replace(/[0-9A-Za-z]/g, (c, i) => (i === 0 && /[A-Za-z]/.test(c) ? c.toUpperCase() : "*"));
}
