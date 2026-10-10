// checks/<id>.md is shared: the AI writes its own sections (「## 客製履歷」「## 履歷檔」…), the program writes only
// 「## 程式檢查」. Replacing a section never touches the others; the file's BOM and line endings are kept.

export const SECTION = "## 程式檢查";
export const SECTION_EN = "## Program check"; // the English kit's heading: read in every market, so a folder can be switched either way
export const FIRST_LINE = "# AI 手動檢查（不是程式檢查）"; // fixed first line of every checks file (AGENTS.md)
export const FIRST_LINE_EN = "# AI manual check (not the program check)";

/** `doc` with the 「## 程式檢查」 section replaced by `section` (which starts with that heading), or added at the end. */
export function replaceSection(doc: string | null, section: string, intro: string[] = [], us = false): string {
  const body = section.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (doc == null || doc.replace(/^﻿/, "").trim() === "") {
    return [us ? FIRST_LINE_EN : FIRST_LINE, "", ...intro.flatMap((l) => [l, ""]), body, ""].join("\n");
  }
  const bom = doc.startsWith("﻿") ? "﻿" : "";
  const eol = doc.includes("\r\n") ? "\r\n" : "\n";
  const lines = doc.slice(bom.length).split(/\r?\n/);
  const newLines = body.split("\n");

  let start = -1;
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fence = !fence;
    if (!fence && [SECTION, SECTION_EN].includes(lines[i].trim())) {
      start = i;
      break;
    }
  }
  let out: string[];
  if (start < 0) {
    const kept = [...lines];
    while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
    out = [...kept, "", ...newLines, ""];
  } else {
    let end = lines.length;
    fence = false;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) fence = !fence;
      if (!fence && /^#{1,2}\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const after = lines.slice(end);
    out = [...lines.slice(0, start), ...newLines, ...(after.length ? ["", ...after] : [""])];
  }
  return bom + out.join(eol);
}
