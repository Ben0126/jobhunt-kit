// Every sentence `jobhunt read` prints (docx.ts), one table per jobhunt.yaml `language`. The Chinese table is word for word
// what the program always said. Machine markers (the " ｜ " between table cells) stay in docx.ts.
import type { Language } from "./market.ts";

const USAGE_WIN_ZH = ".\\jobhunt.exe read inbox\\舊履歷.docx";
const USAGE_MAC_ZH = "./jobhunt-mac-arm64 read inbox/舊履歷.docx";
const USAGE_WIN_EN = ".\\jobhunt.exe read inbox\\old-resume.docx";
const USAGE_MAC_EN = "./jobhunt-mac-arm64 read inbox/old-resume.docx";

const ZH = {
  idMask: "[已遮住身分證字號]",
  unknownArg: (a: string) => `不認得「${a}」。`,
  programAt: (dir: string) => `程式現在在：${dir}`,
  usage: `用法：jobhunt read <檔案>，例如 ${USAGE_WIN_ZH}（Mac：${USAGE_MAC_ZH}）。一次讀一個檔案，檔名有空白要加引號。`,
  notFolder: "這個資料夾看起來不是求職資料夾，沒有讀。請把程式放進求職資料夾（有 AGENTS.md 的那個）再執行。",
  /** `p` is already ID-masked. */
  notFound: (p: string) => `找不到「${p}」。請確認檔案放在求職資料夾的 inbox 裡，檔名打對（含 .docx）。`,
  outside: "只能讀求職資料夾裡面的檔案（建議放在 inbox）。這個檔案在資料夾外面，沒有讀。",
  isDir: (p: string) => `「${p}」是資料夾，不是檔案。`,
  doc: "這是舊版 Word 檔（.doc），程式讀不了。請用 Word 打開它，按「檔案」→「另存新檔」，存成 .docx（或 PDF），放進 inbox 再試一次。",
  pdf: "這是 PDF 檔，不用這個程式：AI 可以直接讀 PDF 檔案。",
  pages: "這是 Mac 的 Pages 檔，程式讀不了。請在 Pages 按「檔案」→「輸出至」→「Word」存成 .docx，放進 inbox 再試一次。",
  other: "這個程式只讀 Word 的 .docx 檔。PDF、文字檔請 AI 直接讀檔案；其他格式請用原本的程式另存成 .docx。",
  encrypted: "這個 Word 檔有密碼保護，程式讀不了。請用 Word 打開它（輸入密碼），把密碼拿掉，或另存一份沒有密碼的 .docx，再試一次。",
  cfbDocx: "這個 Word 檔有密碼保護，或其實是舊版 Word 格式，程式讀不了。請用 Word 打開它，按「檔案」→「另存新檔」，存成一份沒有密碼的 .docx，再試一次。",
  cannotOpen: "這個檔案現在打不開：可能正被別的程式用著（例如 OneDrive 正在同步、防毒軟體正在檢查、還沒下載完），或沒有權限讀。請等一下再試；還是不行，就把 Word 關掉，或在 Word 裡另存一份到 inbox 再讀那一份。",
  corrupt: "這個 Word 檔打不開，可能壞了或沒有存完整。請用 Word 打開它，按「檔案」→「另存新檔」存成新的 .docx 再試一次；還是不行，就把文字複製貼給 AI。",
  tooBig: "這個檔案太大或內容不正常，程式不讀。請用 Word 打開它，按「檔案」→「另存新檔」存成新的 .docx 再試一次；還是不行，就把文字複製貼給 AI。",
  empty: "（這個檔案裡沒有讀到文字，可能整份是圖片。請把文字複製貼給 AI，或把原本的檔案另存成 PDF 給 AI 讀。）",
  header: (name: string) => `＝＝ ${name} 的文字（只給 AI 讀，沒有存成檔案）＝＝`,
  masked: (n: number) => `（有 ${n} 個身分證字號已經遮住。）`,
};

export type DocxText = typeof ZH;

const EN: DocxText = {
  idMask: "[ID number hidden]",
  unknownArg: (a) => `Unknown option "${a}".`,
  programAt: (dir) => `The program is now in: ${dir}`,
  usage: `Usage: jobhunt read <file>, for example ${USAGE_WIN_EN} (Mac: ${USAGE_MAC_EN}). Read one file at a time. Put quotes around a file name that has spaces.`,
  notFolder: "This folder does not look like a job-search folder, so nothing was read. Put the program in your job-search folder (the one with AGENTS.md) and run it again.",
  notFound: (p) => `Could not find "${p}". Check that the file is in the inbox folder inside your job-search folder and that the name is right (including .docx).`,
  outside: "Only files inside your job-search folder can be read (the inbox folder is best). This file is outside the folder, so it was not read.",
  isDir: (p) => `"${p}" is a folder, not a file.`,
  doc: 'This is an old Word file (.doc) and the program cannot read it. Open it in Word, choose "File", then "Save As", save it as .docx (or PDF), put it in the inbox folder and try again.',
  pdf: "This is a PDF file. You do not need this program for it: the AI can read PDF files directly.",
  pages: 'This is a Mac Pages file and the program cannot read it. In Pages choose "File", then "Export To", then "Word", save it as .docx, put it in the inbox folder and try again.',
  other: "This program only reads Word .docx files. For PDF or text files, ask the AI to read the file directly. For other formats, use the program that made the file to save a copy as .docx.",
  encrypted: "This Word file is password protected and the program cannot read it. Open it in Word (enter the password), remove the password or save a copy without one as .docx, then try again.",
  cfbDocx: 'This Word file is password protected, or it is really an old Word format, and the program cannot read it. Open it in Word, choose "File", then "Save As", save a copy without a password as .docx, then try again.',
  cannotOpen: "This file cannot be opened right now. Another program may be using it (for example OneDrive is syncing, antivirus is scanning, or the download is not finished), or you may not have permission to read it. Wait a moment and try again. If it still fails, close Word, or save a copy into the inbox folder in Word and read that copy.",
  corrupt: 'This Word file cannot be opened. It may be damaged or not fully saved. Open it in Word, choose "File", then "Save As" to make a new .docx and try again. If it still fails, copy and paste the text to the AI.',
  tooBig: 'This file is too big or its content looks wrong, so the program will not read it. Open it in Word, choose "File", then "Save As" to make a new .docx and try again. If it still fails, copy and paste the text to the AI.',
  empty: "(No text was found in this file. It may be all pictures. Copy and paste the text to the AI, or save the original file as a PDF for the AI to read.)",
  header: (name) => `== Text of ${name} (for the AI to read only, not saved as a file) ==`,
  masked: (n) => `(${n} ID ${n === 1 ? "number was" : "numbers were"} hidden.)`,
};

export const TABLES: Record<Language, DocxText> = { "zh-TW": ZH, en: EN };
export const docxTextFor = (lang: Language): DocxText => TABLES[lang] ?? ZH;
