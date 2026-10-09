// 測試用的小 ZIP 寫入工具：做 .docx 測試檔（stored 和 deflated 都可以），也能故意寫錯大小或 CRC 來測防護。
// CRC 自己算（不用被測的程式），免得兩邊錯在一起。
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipInput = {
  name: string;
  data: string | Uint8Array;
  method?: 0 | 8; // default 8 (deflate)
  declaredSize?: number; // lie about the unpacked size
  crc?: number; // lie about the CRC
};

export function makeZip(entries: ZipInput[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf-8") : Buffer.from(e.data);
    const method = e.method ?? 8;
    const packed = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, "utf-8");
    const crc = e.crc ?? crc32(raw);
    const size = e.declaredSize ?? raw.length;
    const flags = 0x800; // UTF-8 names

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(packed.length, 18);
    lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, packed);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(packed.length, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS = `${W} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"`;

export type DocxParts = {
  body: string; // inner XML of <w:body>
  headers?: string[]; // inner XML of each <w:hdr>
  footers?: string[];
  styles?: string; // inner XML of <w:styles>
  method?: 0 | 8;
  override?: Partial<Record<string, Partial<ZipInput>>>; // per part name
  extra?: ZipInput[];
};

export function makeDocx(p: DocxParts): Uint8Array {
  const parts: ZipInput[] = [
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>' },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${p.body}</w:body></w:document>` },
  ];
  (p.headers ?? []).forEach((h, i) => parts.push({ name: `word/header${i + 1}.xml`, data: `<?xml version="1.0"?><w:hdr ${NS}>${h}</w:hdr>` }));
  (p.footers ?? []).forEach((f, i) => parts.push({ name: `word/footer${i + 1}.xml`, data: `<?xml version="1.0"?><w:ftr ${NS}>${f}</w:ftr>` }));
  if (p.styles) parts.push({ name: "word/styles.xml", data: `<?xml version="1.0"?><w:styles ${W}>${p.styles}</w:styles>` });
  return makeZip([...parts.map((e) => ({ method: p.method, ...e, ...(p.override?.[e.name] ?? {}) })), ...(p.extra ?? [])]);
}

/** <w:p> with one run per string. */
export const para = (...runs: string[]) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`;
