// Sentences main.ts and launch.ts print, one table per jobhunt.yaml `language` (the Chinese table is word for word what the
// program always said). When the folder cannot be read (not unpacked, wrong --dir) the Chinese table is used: there is no
// jobhunt.yaml to ask.
import type { Language } from "./market.ts";

const ZH = {
  pressEnter: "按 Enter 關閉這個視窗。",
  dirRefused: (command: string) => `「${command}」不接受 --dir／--folder：只處理程式所在的這個求職資料夾。請在求職資料夾裡執行，不要加 --dir。`,
  unknownCommand: (what: string) => `不認得「${what}」。`,
  usage: (_us: boolean) => "用法：直接點兩下打開介面；檢查用「jobhunt check」（只查一份：check 職缺代號；只查 104 總履歷：check --104；只查個人檔案（美國版）：check --profiles）；讀 Word 舊履歷用「jobhunt read inbox\\舊履歷.docx」。",
  devNeedsDir: "開發模式要用 --dir 指定求職資料夾，例如：bun src/main.ts --dir ../jobhunt/scaffold/workspace-general",
  notFolder1: "這個資料夾看起來不是求職資料夾，所以沒有打開介面。",
  programAt: (dir: string) => `程式現在在：${dir}`,
  notFolder3: "請把這個程式放進你的求職資料夾（裡面有「開始使用.md」和 AGENTS.md 的那個資料夾），再點兩下打開。",
  notFolder4: "如果你是在 .zip 壓縮檔裡面直接點的：要先把整個壓縮檔解壓縮，再到解壓縮出來的資料夾裡點兩下。",
  alreadyRunning: "介面已經開著了，幫你在瀏覽器再打開一次。",
  started: "介面已經在瀏覽器打開。用完再關掉這個視窗。",
  startedNoOpen: "介面已經準備好，請用瀏覽器打開下面的網址。用完再關掉這個視窗。",
};

export type CliText = typeof ZH;

const EN: CliText = {
  pressEnter: "Press Enter to close this window.",
  dirRefused: (command) => `"${command}" does not take --dir or --folder: it only works on the job-search folder the program is in. Run it inside your job-search folder and leave out --dir.`,
  unknownCommand: (what) => `Unknown command or option "${what}".`,
  usage: (us) =>
    `Usage: double-click to open the app. To check your files use "jobhunt check" (one job only: check <job id>; ${us ? "" : "only the 104 master resume: check --104; "}only profile files: check --profiles). To read an old Word resume use "jobhunt read inbox\\old-resume.docx".`,
  devNeedsDir: "Developer mode needs --dir to point at a job-search folder, for example: bun src/main.ts --dir ../jobhunt/scaffold/workspace-us",
  notFolder1: "This folder does not look like a job-search folder, so the app was not opened.",
  programAt: (dir) => `The program is now in: ${dir}`,
  notFolder3: "Put this program inside your job-search folder (the one with START-HERE.md and AGENTS.md in it), then double-click it again.",
  notFolder4: "If you double-clicked it inside a .zip file: unzip the whole file first, then double-click the program in the folder you unzipped.",
  alreadyRunning: "The app is already open. Opening it in your browser again.",
  started: "The app is open in your browser. Close this window when you are done.",
  startedNoOpen: "The app is ready. Open the address below in your browser. Close this window when you are done.",
};

export const TABLES: Record<Language, CliText> = { "zh-TW": ZH, en: EN };
export const cliTextFor = (lang: Language): CliText => TABLES[lang] ?? ZH;
