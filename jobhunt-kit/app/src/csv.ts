// CSV read/write that keeps the file the way the user (or the AI, or Python) left it:
// header order, unknown columns, ragged rows, BOM and line endings all survive a round trip.

export type CsvDoc = {
  header: string[];
  rows: string[][]; // raw cells, aligned to header; may be longer than header (extra cells kept)
  bom: boolean;
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
};

export function parseCsv(text: string): CsvDoc {
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  const firstNl = text.indexOf("\n");
  const eol: "\n" | "\r\n" = firstNl > 0 && text[firstNl - 1] === "\r" ? "\r\n" : "\n";
  const trailingNewline = text.endsWith("\n");

  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellStarted = false; // distinguishes an empty line from a line with one empty cell
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      cellStarted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      cellStarted = true;
    } else if (c === "\r" && text[i + 1] === "\n") {
      // handled by the \n branch
    } else if (c === "\n") {
      if (cellStarted || cell !== "" || row.length) {
        row.push(cell);
        records.push(row);
      }
      row = [];
      cell = "";
      cellStarted = false;
    } else {
      cell += c;
      cellStarted = true;
    }
  }
  if (cellStarted || cell !== "" || row.length) {
    row.push(cell);
    records.push(row);
  }
  const header = records.shift() ?? [];
  const rows = records.map((r) => {
    const out = r.slice();
    while (out.length < header.length) out.push("");
    return out;
  });
  return { header, rows, bom, eol, trailingNewline };
}

function quote(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function serializeCsv(doc: CsvDoc): string {
  const lines = [doc.header, ...doc.rows].map((r) => {
    const cells = r.slice();
    while (cells.length < doc.header.length) cells.push("");
    return cells.map(quote).join(",");
  });
  let out = lines.join(doc.eol);
  if (doc.trailingNewline || doc.rows.length) out += doc.eol;
  return (doc.bom ? "﻿" : "") + out;
}

/** Column index for a field; appends the column at the end of the header when missing. */
export function ensureColumn(doc: CsvDoc, name: string): number {
  let i = doc.header.indexOf(name);
  if (i >= 0) return i;
  // Extra cells beyond the old header would be silently re-labelled; pad them out of the way first.
  doc.header.push(name);
  i = doc.header.length - 1;
  for (const r of doc.rows) {
    while (r.length < doc.header.length - 1) r.push("");
    if (r.length > i) r.splice(i, 0, "");
    else r.push("");
  }
  return i;
}

export function rowToObject(header: string[], row: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  header.forEach((h, i) => {
    if (h !== "" && !(h in o)) o[h] = row[i] ?? "";
  });
  return o;
}
