// jobhunt read：把 Word（.docx）舊履歷的文字印給 AI 讀。測試檔大多在這裡用 ziptools.ts 現做；
// 另有一份用 .NET 的 System.IO.Compression 打包的（fixture-docx/），免得只測到自己寫 ZIP 的習慣。
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { docxText, ID_MASK, LIMITS, maskIdNumbers, MESSAGES, parseXml, runRead } from "../src/docx.ts";
import { cleanup, emptyTemp } from "./helpers.ts";
import { makeDocx, makeZip, para } from "./ziptools.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

/** A minimal job-hunt folder (AGENTS.md + inbox/) in a temp dir. */
function folder(): string {
  const dir = emptyTemp();
  dirs.push(dir);
  writeFileSync(join(dir, "AGENTS.md"), "# test\n");
  mkdirSync(join(dir, "inbox"));
  return dir;
}

function read(dir: string, ...args: string[]): { code: number; out: string } {
  const lines: string[] = [];
  const code = runRead(["--dir", dir, "read", ...args], dir, (s) => lines.push(s));
  return { code, out: lines.join("\n") };
}

/** Puts bytes at inbox/<name> and reads them; returns the printed text without the header line. */
function readBytes(bytes: Uint8Array | string, name = "舊履歷.docx"): { code: number; out: string; body: string } {
  const dir = folder();
  writeFileSync(join(dir, "inbox", name), bytes);
  const r = read(dir, `inbox/${name}`);
  return { ...r, body: r.out.split("\n").slice(1).join("\n") };
}

const text = (p: Parameters<typeof makeDocx>[0]) => docxText(makeDocx(p));

// ---------------------------------------------------------------- what gets printed

test("段落和中文：一段一行，第一行是固定的標題，結束碼 0", () => {
  const r = readBytes(makeDocx({ body: para("王小明") + para("學歷：", "範例大學 企管系") + "<w:p/>" + "<w:p/>" + para("經歷") }));
  expect(r.code).toBe(0);
  expect(r.out.split("\n")[0]).toBe("＝＝ 舊履歷.docx 的文字（只給 AI 讀，沒有存成檔案）＝＝");
  expect(r.body).toBe("王小明\n學歷：範例大學 企管系\n\n經歷");
});

test("w:tab 變成 tab、w:br 換行；段落屬性裡的定位點（w:tabs）不算", () => {
  const body = `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="2000"/></w:tabs></w:pPr><w:r><w:t>Excel</w:t><w:tab/><w:t>樞紐分析</w:t><w:br/><w:t>Word</w:t></w:r></w:p>`;
  expect(text({ body })).toBe("Excel\t樞紐分析\nWord");
});

test("表格：一列一行，格子用「 ｜ 」分開；空格子、追蹤修訂刪掉的列不印；一格兩段用空白接", () => {
  const cell = (...ps: string[]) => `<w:tc><w:tcPr/>${ps.map((t) => para(t)).join("") || "<w:p/>"}</w:tc>`;
  const body =
    "<w:tbl><w:tblPr/><w:tblGrid/>" +
    `<w:tr>${cell("2023-07 – 2024-06")}${cell("範例超市")}${cell()}${cell("門市工讀生", "週末班")}</w:tr>` +
    `<w:tr><w:trPr><w:del w:id="9" w:author="x"/></w:trPr>${cell("刪掉的列")}</w:tr>` +
    `<w:tr>${cell()}${cell()}</w:tr>` +
    `<w:tr>${cell("語言")}${cell("英文 多益 650")}</w:tr>` +
    "</w:tbl>" +
    para("表格後面");
  expect(text({ body })).toBe("2023-07 – 2024-06 ｜ 範例超市 ｜ 門市工讀生 週末班\n語言 ｜ 英文 多益 650\n表格後面");
});

test("清單：有編號（numPr）或樣式帶編號的段落前面加「• 」；numId 0 不算", () => {
  const styles =
    '<w:style w:type="paragraph" w:styleId="ListBullet"><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="ListBullet"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Normal"/>';
  const body =
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>收銀和補貨</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr><w:r><w:t>不是清單</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Child"/></w:pPr><w:r><w:t>樣式帶編號</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>一般段落</w:t></w:r></w:p>`;
  expect(text({ body, styles })).toBe("• 收銀和補貨\n不是清單\n• 樣式帶編號\n一般段落");
});

test("頁首（常放電話）印在最前面、頁尾在最後；一模一樣的頁首只印一次；PAGE 欄位的指令不印", () => {
  const header = para("王小明　手機 0912-345-678");
  const footer = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const t = text({ body: para("自傳"), headers: [header, header, ""], footers: [footer] });
  expect(t).toBe("王小明　手機 0912-345-678\n\n自傳\n\n1");
});

test("文字方塊：mc:AlternateContent 只印 Choice 那一份，不重複印 Fallback；舊式 VML 文字方塊也讀得到", () => {
  const box = (s: string) => `<w:txbxContent>${para(s)}</w:txbxContent>`;
  const body =
    para("前面") +
    `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx>${box("證照：丙級")}</wps:txbx></wps:wsp></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><v:shape><v:textbox>${box("證照：丙級")}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>` +
    `<w:p><w:r><w:t>旁邊的字</w:t></w:r><w:r><w:pict><v:shape><v:textbox>${box("舊式方塊")}</v:textbox></v:shape></w:pict></w:r></w:p>` +
    para("後面");
  const t = text({ body });
  expect(t).toBe("前面\n證照：丙級\n旁邊的字\n舊式方塊\n後面");
  expect(t.split("證照：丙級").length - 1).toBe(1);
});

test("追蹤修訂：插入的字保留、刪除的字不印", () => {
  const body =
    `<w:p><w:r><w:t>協助排班</w:t></w:r>` +
    `<w:ins w:id="1" w:author="a"><w:r><w:t>和盤點</w:t></w:r></w:ins>` +
    `<w:del w:id="2" w:author="a"><w:r><w:delText>，管理全店 20 人</w:delText></w:r></w:del></w:p>` +
    `<w:del w:id="3" w:author="a"><w:p><w:r><w:t>整段刪掉</w:t></w:r></w:p></w:del>` +
    `<w:p><w:moveFrom w:id="4" w:author="a"><w:r><w:t>搬走前</w:t></w:r></w:moveFrom><w:moveTo w:id="5" w:author="a"><w:r><w:t>搬過來</w:t></w:r></w:moveTo></w:p>`;
  expect(text({ body })).toBe("協助排班和盤點\n搬過來");
});

test("兩欄排版（整頁一列兩格的表格）：每格一段一段印、格子之間空一行，標題和清單不會擠成一行", () => {
  const cell = (inner: string) => `<w:tc><w:tcPr/>${inner}</w:tc>`;
  const li = (t: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const left = para("專長") + li("中文打字 70 字") + li("Canva 設計");
  const right = para("學歷") + para("範例大學 大眾傳播學系（2020-2024）") + para("經歷") + li("社群小編實習｜範例公司") + li("每週發佈 5 則貼文") + para("自傳") + para("我從小喜歡寫東西。");
  const body = para("王小明") + `<w:tbl><w:tblPr/><w:tblGrid/><w:tr>${cell(left)}${cell(right)}</w:tr></w:tbl>` + para("表格後面");
  expect(text({ body })).toBe(
    [
      "王小明",
      "",
      "專長",
      "• 中文打字 70 字",
      "• Canva 設計",
      "",
      "學歷",
      "範例大學 大眾傳播學系（2020-2024）",
      "經歷",
      "• 社群小編實習｜範例公司",
      "• 每週發佈 5 則貼文",
      "自傳",
      "我從小喜歡寫東西。",
      "",
      "表格後面",
    ].join("\n"),
  );
});

test("XML 字元：&amp; &lt; &gt; &quot; &apos; 和 &#x4E2D; &#20013; 都還原", () => {
  const body = para("R&amp;D 社 &lt;志工&gt; &quot;引號&quot; &apos;單&apos; &#x4E2D;&#20013;");
  expect(text({ body })).toBe(`R&D 社 <志工> "引號" '單' 中中`);
});

test("stored（沒壓縮）的 ZIP 也讀得到", () => {
  expect(text({ body: para("沒壓縮"), method: 0 })).toBe("沒壓縮");
});

test("副檔名是 .doc、其實是 .docx 的檔案照樣讀", () => {
  const r = readBytes(makeDocx({ body: para("其實是 docx") }), "舊履歷.doc");
  expect(r.code).toBe(0);
  expect(r.body).toBe("其實是 docx");
});

// ---------------------------------------------------------------- ID numbers

test("身分證字號遮住（半形、全形、小寫、拆在兩個 run、舊式兩個英文字母），最後一行講遮了幾個；電話和太短的不遮", () => {
  const body =
    para("身分證：A123456789") +
    para("全形：Ｂ２２３４５６７８９") +
    para("小寫 c187654321") +
    `<w:p><w:r><w:t>拆開 D2234</w:t></w:r><w:r><w:t>56789</w:t></w:r></w:p>` +
    para("舊式 AB12345678") +
    para("手機 0912345678、學號 A12345678、訂單 X323456789");
  const r = readBytes(makeDocx({ body }));
  expect(r.code).toBe(0);
  for (const id of ["A123456789", "Ｂ２２３４５６７８９", "c187654321", "D2234", "AB12345678"]) expect(r.out).not.toContain(id);
  expect(r.body.split("\n").slice(0, 5).every((l) => l.endsWith(ID_MASK))).toBe(true);
  expect(r.body.split("\n")[1]).toBe(`全形：${ID_MASK}`); // the rest of the line stays as written
  expect(r.out).toContain("手機 0912345678、學號 A12345678、訂單 X323456789");
  const lines = r.out.split("\n");
  expect(lines[lines.length - 1]).toBe(MESSAGES.masked(5));
  expect(lines.filter((l) => l.includes("遮住")).length).toBe(6); // 5 masks + the one summary line, nothing else about privacy
});

test("沒有身分證字號就不印遮住的那一行", () => {
  const r = readBytes(makeDocx({ body: para("沒有個資") }));
  expect(r.out).not.toContain("遮住");
});

test("maskIdNumbers：中間夾了看不見的字元也遮得到，和 rules.js 的判斷一致", () => {
  const m = maskIdNumbers("身分證 A1234​56789 結束");
  expect(m).toEqual({ text: `身分證 ${ID_MASK} 結束`, count: 1 });
  // Look-alike digits rules.js still reads as an ID (① → 1): only that line is normalized and masked.
  expect(maskIdNumbers("其他行：（不變）\n怪字：A①23456789")).toEqual({ text: `其他行：（不變）\n怪字:${ID_MASK}`, count: 1 });
});

// ---------------------------------------------------------------- the independent fixture

test("另一套工具（.NET System.IO.Compression）打包的 .docx：整份輸出逐字符合", () => {
  const bytes = readFileSync(join(import.meta.dir, "fixture-docx", "範例舊履歷.docx"));
  const r = readBytes(bytes, "範例舊履歷.docx");
  expect(r.code).toBe(0);
  expect(r.out).toBe(
    [
      "＝＝ 範例舊履歷.docx 的文字（只給 AI 讀，沒有存成檔案）＝＝",
      "陳小華\t手機 0912-000-111 ｜ chen.example@example.com",
      "",
      "陳小華 履歷",
      "求職方向：行政助理",
      "",
      "學歷",
      "2021-09 – 2025-06 ｜ 範例科技大學 ｜ 企業管理系 學士",
      "經歷",
      "• 範例超市 門市工讀生（2023-07 – 2024-06）",
      "• 協助整理排班表，每週 3 天，也幫忙盤點",
      "專長\tExcel（樞紐分析）、R&D 社 <志工>、中文打字 60 字",
      "證照：電腦軟體應用丙級",
      `身分證字號：${ID_MASK}`,
      "地址：範例市範例區",
      "",
      "第 1 頁",
      "",
      MESSAGES.masked(1),
    ].join("\n"),
  );
});

// ---------------------------------------------------------------- where the file may be

test("資料夾外面的檔案不讀（../、絕對路徑、不存在的也一樣），結束碼 2", () => {
  const dir = folder();
  const outside = emptyTemp();
  dirs.push(outside);
  writeFileSync(join(outside, "x.docx"), makeDocx({ body: para("外面的") }));
  for (const p of [relative(dir, join(outside, "x.docx")), join(outside, "x.docx"), join(outside, "nope.docx"), "../nope.docx"]) {
    const r = read(dir, p);
    expect({ p, code: r.code, out: r.out }).toEqual({ p, code: 2, out: MESSAGES.outside });
  }
});

test("用捷徑（symlink／junction）指到資料夾外面也不讀", () => {
  const dir = folder();
  const outside = emptyTemp();
  dirs.push(outside);
  writeFileSync(join(outside, "x.docx"), makeDocx({ body: para("外面的") }));
  symlinkSync(outside, join(dir, "inbox", "link"), process.platform === "win32" ? "junction" : "dir");
  expect(statSync(join(dir, "inbox", "link", "x.docx")).isFile()).toBe(true); // the link itself works
  const r = read(dir, "inbox/link/x.docx");
  expect(r).toEqual({ code: 2, out: MESSAGES.outside });
});

test("找不到檔案、給的是資料夾、沒給檔名或給兩個、不是求職資料夾 → 白話說明，結束碼 2", () => {
  const dir = folder();
  expect(read(dir, "inbox/沒有這個.docx")).toEqual({ code: 2, out: MESSAGES.notFound("inbox/沒有這個.docx") });
  expect(read(dir, "inbox")).toEqual({ code: 2, out: MESSAGES.isDir("inbox") });
  expect(read(dir)).toEqual({ code: 2, out: MESSAGES.usage });
  expect(read(dir, "a.docx", "b.docx")).toEqual({ code: 2, out: MESSAGES.usage });
  expect(read(dir, "--x", "a.docx").code).toBe(2);
  const notFolder = emptyTemp();
  dirs.push(notFolder);
  writeFileSync(join(notFolder, "a.docx"), makeDocx({ body: para("x") }));
  const r = read(notFolder, "a.docx");
  expect(r.code).toBe(2);
  expect(r.out).toContain("不是求職資料夾");
});

// ---------------------------------------------------------------- other formats

const CFB = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(504).fill(0)]);
const withUtf16 = (b: Uint8Array, word: string) => new Uint8Array(Buffer.concat([Buffer.from(b), Buffer.from(word, "utf16le"), Buffer.alloc(64)]));

test("舊版 .doc → 請他在 Word 另存新檔成 .docx 或 PDF，結束碼 2", () => {
  expect(readBytes(CFB, "舊履歷.doc")).toMatchObject({ code: 2, out: MESSAGES.doc });
  expect(readBytes("{\\rtf1 not really word}", "舊履歷.doc")).toMatchObject({ code: 2, out: MESSAGES.doc });
  expect(MESSAGES.doc).toContain("另存新檔");
});

test("PDF（副檔名或內容）→ 說 AI 可以直接讀 PDF，結束碼 2", () => {
  expect(readBytes("%PDF-1.7\n...", "舊履歷.pdf")).toMatchObject({ code: 2, out: MESSAGES.pdf });
  expect(readBytes("%PDF-1.7\n...", "其實是pdf.docx")).toMatchObject({ code: 2, out: MESSAGES.pdf });
  expect(MESSAGES.pdf).toContain("直接讀");
});

test("有密碼的 .docx（其實是 CFB 檔，有 EncryptedPackage）→ 請他拿掉密碼，結束碼 2", () => {
  const r = readBytes(withUtf16(CFB, "EncryptedPackage"));
  expect(r).toMatchObject({ code: 2, out: MESSAGES.encrypted });
  expect(r.out).toContain("密碼");
  // CFB without the marker (a .doc renamed to .docx, or encryption we don't recognise): still about the password, plus 另存新檔.
  const r2 = readBytes(CFB);
  expect(r2).toMatchObject({ code: 2, out: MESSAGES.cfbDocx });
  expect(r2.out).toContain("密碼");
});

test("其他副檔名 → 只讀 .docx，結束碼 2", () => {
  expect(readBytes("hello", "舊履歷.txt")).toMatchObject({ code: 2, out: MESSAGES.other });
  expect(readBytes("x", "舊履歷.pages")).toMatchObject({ code: 2, out: MESSAGES.pages });
});

test("壞掉的 .docx（亂碼、只有一半、CRC 不對、不是 Word、XML 壞了）→ 白話說明，結束碼 2，不會當掉", () => {
  const good = makeDocx({ body: para("好的") });
  const cases: [string, Uint8Array | string][] = [
    ["garbage", "這不是 Word 檔"],
    ["half", good.subarray(0, Math.floor(good.length / 2))],
    ["crc", makeDocx({ body: para("好的"), override: { "word/document.xml": { crc: 12345 } } })],
    ["no document part", makeZip([{ name: "xl/workbook.xml", data: "<workbook/>" }])],
    ["broken xml", makeDocx({ body: '<w:p><w:r><w:t attr="unterminated</w:t>' })],
    ["empty zip", makeZip([])],
  ];
  for (const [what, bytes] of cases) {
    const r = readBytes(bytes);
    expect({ what, ...r }).toMatchObject({ what, code: 2, out: MESSAGES.corrupt });
  }
});

// ---------------------------------------------------------------- zip bombs and size limits

test("zip bomb：壓縮比太高、宣稱太大、宣稱很小但解開很大、項目太多 → 不讀，結束碼 2", () => {
  const started = Date.now();
  const padding = " ".repeat(5 * 1024 * 1024); // 5 MB of layout whitespace: valid XML, ratio about 1000
  const bombs: [string, Uint8Array][] = [
    ["ratio", makeDocx({ body: para("x") + padding })],
    ["declared too big", makeDocx({ body: para("x"), override: { "word/document.xml": { declaredSize: LIMITS.entry + 1 } } })],
    ["lies about size", makeZip([{ name: "word/document.xml", data: Buffer.alloc(30 * 1024 * 1024, 32), declaredSize: 100 }])],
    ["too many entries", makeZip(Array.from({ length: LIMITS.entries + 1 }, (_, i) => ({ name: `f${i}`, data: "", method: 0 as const })))],
  ];
  for (const [what, bytes] of bombs) {
    const r = readBytes(bytes);
    expect({ what, ...r }).toMatchObject({ what, code: 2, out: MESSAGES.tooBig });
  }
  expect(Date.now() - started).toBeLessThan(15000);
});

test("所有讀到的部分加起來超過上限也不讀（頁首很多份）", () => {
  const saved = LIMITS.total;
  LIMITS.total = 4000;
  try {
    const big = para("頁首".repeat(300));
    const r = readBytes(makeDocx({ body: para("x"), headers: [big, big + para("2"), big + para("3"), big + para("4")] }));
    expect(r).toMatchObject({ code: 2, out: MESSAGES.tooBig });
  } finally {
    LIMITS.total = saved;
  }
});

test("很多 <!...> 宣告的惡意 XML 不會讓程式卡住（花的時間跟長度成正比，不是平方）", () => {
  const xml = `<w:document xmlns:w="${"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}">${"<!abcdefgh>".repeat(200_000)}<w:body/></w:document>`;
  const started = performance.now();
  expect(parseXml(xml).name).toBe("document");
  expect(performance.now() - started).toBeLessThan(1500); // before the fix: about 7 s for 200k
  // A real DOCTYPE with an internal subset is still skipped whole, its entities not expanded.
  const dt = parseXml('<!DOCTYPE d [ <!ENTITY x "boom"> ]><d>&x;<!x></d>');
  expect(dt.kids).toEqual(["&x;"]);
});

test("檔案被別的程式鎖住或沒權限讀 → 白話說明，結束碼 2，不會當掉印出程式碼", () => {
  const dir = folder();
  writeFileSync(join(dir, "inbox", "舊履歷.docx"), makeDocx({ body: para("x") }));
  for (const code of ["EBUSY", "EPERM", "EACCES", "EIO"]) {
    const fail = () => {
      throw Object.assign(new Error(`${code}: resource busy or locked, open`), { code });
    };
    for (const io of [{ readFileSync: fail }, { statSync: fail }, { realpathSync: fail }]) {
      const lines: string[] = [];
      const exit = runRead(["read", "inbox/舊履歷.docx"], dir, (s) => lines.push(s), io as any);
      expect({ code, which: Object.keys(io)[0], exit, out: lines.join("\n") }).toEqual({ code, which: Object.keys(io)[0], exit: 2, out: MESSAGES.cannotOpen });
    }
  }
});

test.skipIf(process.platform !== "win32")("Windows：檔案真的被獨佔鎖住（像 OneDrive 同步中）→ 白話說明，結束碼 2", async () => {
  const dir = folder();
  const file = join(dir, "inbox", "舊履歷.docx");
  writeFileSync(file, makeDocx({ body: para("x") }));
  const ps = Bun.spawn(
    ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `$f=[IO.File]::Open($env:LOCKME,'Open','ReadWrite','None'); [Console]::Out.WriteLine('locked'); [Console]::Out.Flush(); [void][Console]::In.ReadLine(); $f.Close()`],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, LOCKME: file } },
  );
  try {
    const reader = ps.stdout.getReader();
    let seen = "";
    while (!seen.includes("locked")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("powershell exited before locking");
      seen += new TextDecoder().decode(value);
    }
    const lines: string[] = [];
    const exit = runRead(["read", "inbox/舊履歷.docx"], dir, (s) => lines.push(s));
    expect({ exit, out: lines.join("\n") }).toEqual({ exit: 2, out: MESSAGES.cannotOpen });
  } finally {
    ps.stdin.write("\n");
    ps.stdin.end();
    await ps.exited;
  }
  expect(read(dir, "inbox/舊履歷.docx").code).toBe(0); // unlocked: reads again
}, 20000);

test("整份是圖片、沒有字 → 說沒讀到文字，結束碼 0", () => {
  const r = readBytes(makeDocx({ body: "<w:p/><w:p><w:r><w:drawing/></w:r></w:p>" }));
  expect(r.code).toBe(0);
  expect(r.body).toBe(MESSAGES.empty);
});

// ---------------------------------------------------------------- through the real entry point

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name))])).sort();
}

async function main(dir: string, ...args: string[]) {
  const p = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "main.ts"), "--dir", dir, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", cwd: dir });
  const timer = setTimeout(() => p.kill(), 10000);
  const [out] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { code, out };
}

test("main.ts 的 read：印到 stdout（UTF-8）、結束碼 0、資料夾裡什麼都沒多；Windows 的反斜線路徑也可以", async () => {
  const dir = folder();
  writeFileSync(join(dir, "inbox", "舊履歷.docx"), makeDocx({ body: para("王小明 履歷") }));
  const before = listFiles(dir);
  const r = await main(dir, "read", process.platform === "win32" ? "inbox\\舊履歷.docx" : "inbox/舊履歷.docx");
  expect(r.code).toBe(0);
  expect(r.out).toBe("＝＝ 舊履歷.docx 的文字（只給 AI 讀，沒有存成檔案）＝＝\n王小明 履歷\n");
  expect(listFiles(dir)).toEqual(before);
  writeFileSync(join(dir, "inbox", "x.pdf"), "%PDF-1.7");
  const pdf = await main(dir, "read", "inbox/x.pdf");
  expect(pdf).toEqual({ code: 2, out: MESSAGES.pdf + "\n" });
});

test("找不到檔案時，訊息裡檔名的身分證字號也要遮住", () => {
  const dir = folder();
  const r = read(dir, "inbox/A123456789舊履歷.docx");
  expect(r.code).toBe(2);
  expect(r.out).not.toContain("A123456789");
  expect(r.out).toContain(ID_MASK);
});

test("Word 裡設成隱藏的文字不印（w:vanish）；明寫關掉的（val=0／false）照印", () => {
  const hidden = (t: string, val = "") => `<w:r><w:rPr><w:vanish${val ? ` w:val="${val}"` : ""}/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const body = `<w:p><w:r><w:t xml:space="preserve">看得到</w:t></w:r>${hidden("藏起來的備註")}</w:p>`
    + `<w:p>${hidden("不隱藏A", "0")}${hidden("不隱藏B", "false")}</w:p>`;
  const out = text({ body });
  expect(out).toContain("看得到");
  expect(out).not.toContain("藏起來的備註");
  expect(out).toContain("不隱藏A");
  expect(out).toContain("不隱藏B");
});
