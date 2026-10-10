// Visa and work-authorization words. In the US kit they stay out of the resume file and profiles/*.md (the status lives
// in me/work-auth.md, and answers to the two application questions are given in the form, not printed on the resume).
//
// Words: F-1, OPT, CPT, H-1B, visa, sponsorship, green card, work authorization (and "employment authorization", which
// is what EAD stands for), I-20, EAD. Word-bounded, with these choices so ordinary resume text is not blocked:
//   OPT / CPT / EAD  upper case only ("opt for", "opt-in" and "option" are plain English). "CPT" followed or preceded by
//                    a medical-coding word (CPT codes, CPT/ICD-10 coding) is billing, not a work permit.
//   F1               only when "visa", "status" or "student" follows ("F1 score" is not a visa). F-1 with the hyphen always.
//   I-20             with the hyphen only (a bare "I20" is a road).
//   visa             not when it is a card or a company: Visa and Mastercard, Visa card/debit/credit/gift/payment, Visa Inc.
//   sponsorship      only next to a visa word (visa, H-1B, OPT, work authorization ...) or after "require / need"
//                    ("secured sponsorships from local businesses" is fundraising). "sponsor" alone is never matched.
//   Visa             a company is fine when it is one of the user's own employers (resume.yaml org, passed as `employers`).
const DASH = /[‐-―−]/g;
const MASTERCARD = "(?:master\\s?card|amex|american\\s+express|discover)";
const VISA_CONTEXT = String.raw`(?:visas?|h-?1-?b|opt|cpt|f-?1|ead|green\s?cards?|(?:work|employment)\s+authori[sz]ations?|immigration|employment-based|stem)`;
const RULES: RegExp[] = [
  /(?<![A-Za-z0-9])F-1(?![0-9A-Za-z])/gi,
  /(?<![A-Za-z0-9])F1(?=\s+(?:visa|status|student)\b)/gi,
  /\bOPT\b(?!-(?:in|out)\b)/g,
  /\bCPT\b(?![\s/,&-]*(?:and\s+)?(?:codes?\b|coding\b|billing\b|ICD|HCPCS))(?!-?4\b|®)(?<!(?:ICD|HCPCS)[-\w]*[\s/,&]+(?:(?:and|or)\s+)?CPT)(?<!Procedural Terminology\s*\(CPT)/g,
  /\bH-?1-?B\b/gi,
  new RegExp(
    `\\bvisas?\\b(?!\\s+(?:inc\\b|cards?\\b|debit\\b|credit\\b|gift\\b|payments?\\b|network\\b|checkout\\b))(?!\\s*(?:[,/&]|and\\b|or\\b)\\s*${MASTERCARD})(?<!${MASTERCARD}\\s*(?:[,/&]|and|or)\\s*visa)`,
    "gi",
  ),
  new RegExp(String.raw`\bsponsorships?\b(?=[^.;\n]{0,40}\b${VISA_CONTEXT}\b)|(?<=\b${VISA_CONTEXT}\b[^.;\n]{0,40})\bsponsorships?\b`, "gi"),
  /(?<=\b(?:requires?|requiring|needs?|needing)\s+(?:\w+\s+){0,2})\bsponsorships?\b|\bsponsorships?(?=\s+(?:is\s+)?(?:required|needed)\b)/gi,
  /\bgreen\s?cards?\b/gi,
  /\b(?:work|employment)\s+authori[sz]ations?\b/gi,
  /(?<![A-Za-z0-9])I-20(?![0-9A-Za-z])/g,
  /\bEAD\b/g,
];

/** The visa-related words found in `text` (as written, in order). `employers`: the user's own employers; a "Visa" inside one of them is a company. */
export function visaWords(text: string, employers: string[] = []): string[] {
  return visaMatches(text, employers).matches.map((m) => m[0]);
}

/** `text` (NFKC, dashes unified) with every visa word that visaWords reports replaced by spaces, so a later check does not
 * read the digit of "F-1" or "H-1B" as a number. */
export function maskVisaWords(text: string, employers: string[] = []): string {
  const { t, matches } = visaMatches(text, employers);
  let out = t;
  for (const m of matches) out = out.slice(0, m.index!) + " ".repeat(m[0].length) + out.slice(m.index! + m[0].length);
  return out;
}

function visaMatches(text: string, employers: string[]): { t: string; matches: RegExpMatchArray[] } {
  const t = String(text).normalize("NFKC").replace(DASH, "-");
  const own: [number, number][] = [];
  for (const name of employers.map((e) => e.normalize("NFKC")).filter((e) => /\bvisa\b/i.test(e))) // exact case: "visa extension" is not the company
    for (let i = t.indexOf(name); i >= 0; i = t.indexOf(name, i + 1)) own.push([i, i + name.length]);
  const seen = new Set<string>();
  const matches = RULES.flatMap((re) => [...t.matchAll(re)])
    .filter((m) => !own.some(([a, b]) => m.index! >= a && m.index! + m[0].length <= b))
    .sort((a, b) => a.index! - b.index!)
    .filter((m) => !seen.has(`${m.index}:${m[0]}`) && !!seen.add(`${m.index}:${m[0]}`))
    .map((m) => m);
  return { t, matches };
}
