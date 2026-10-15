// Sentences main.ts and launch.ts print, one table per jobhunt.yaml `language` (the Chinese table is word for word what the
// program always said). When the folder cannot be read (not unpacked, wrong --dir) the Chinese table is used: there is no
// jobhunt.yaml to ask.
import type { Language } from "./market.ts";

const ZH = {
  pressEnter: "按 Enter 關閉這個視窗。",
  closedAfterUpdate: "更新好了，程式已經關掉。再點兩下程式，就會打開新版本。",
  dirRefused: (command: string) => `「${command}」不接受 --dir／--folder：只處理程式所在的這個求職資料夾。請在求職資料夾裡執行，不要加 --dir。`,
  unknownCommand: (what: string) => `不認得「${what}」。`,
  usage: (_us: boolean) => "用法：直接點兩下打開介面；檢查用「jobhunt check」（只查一份：check 職缺代號；只查 104 總履歷：check --104；只查個人檔案（美國版）：check --profiles）；讀 Word 舊履歷用「jobhunt read inbox\\舊履歷.docx」；選要找哪裡的工作用「jobhunt mode us」（或 tw、both，只能加不能減）；更新到新版用「jobhunt update」。",
  devNeedsDir: "開發模式要用 --dir 指定求職資料夾，例如：bun src/main.ts --dir ../jobhunt/scaffold/workspace-general",
  notFolder1: "這個資料夾看起來不是求職資料夾，所以沒有打開介面。",
  programAt: (dir: string) => `程式現在在：${dir}`,
  notFolder3: "請把這個程式放進你的求職資料夾（裡面有「開始使用.md」和 AGENTS.md 的那個資料夾），再點兩下打開。",
  notFolder4: "如果你是在 .zip 壓縮檔裡面直接點的：要先把整個壓縮檔解壓縮，再到解壓縮出來的資料夾裡點兩下。",
  alreadyRunning: "介面已經開著了，幫你在瀏覽器再打開一次。",
  started: "介面已經在瀏覽器打開。用完再關掉這個視窗。",
  startedNoOpen: "介面已經準備好，請用瀏覽器打開下面的網址。用完再關掉這個視窗。",
  modeNames: { us: "美國", tw: "台灣", both: "美國和台灣" } as Record<"us" | "tw" | "both", string>,
  modeInstalled: (name: string) => `已經裝好「找${name}的工作」的規則。請重新完整讀一次 AGENTS.md（已經換成完整的規則），照它的第一次使用步驟繼續。`,
  modeNow: (name: string) => `這個資料夾目前是：找${name}的工作。要改用「jobhunt mode us」「jobhunt mode tw」或「jobhunt mode both」（只能增加，不能拿掉）。`,
  modeUnset: "這個資料夾還沒選要找哪裡的工作。用「jobhunt mode us」（美國）、「jobhunt mode tw」（台灣）或「jobhunt mode both」（兩邊）。",
  modeBad: (what: string) => `不認得「${what}」。只能是 us（美國）、tw（台灣）或 both（兩邊）。`,
  modeNoKit: "這個資料夾不是合一版（沒有 .kit 資料夾），沒辦法換規則。請下載新版的求職資料夾。",
  modeNarrow: (name: string) => `這個資料夾已經是「找${name}的工作」，只能增加市場，不能拿掉。資料都還在，只是不會換規則。`,
  modeNotPlain: (path: string) => `「${path}」不是一般的檔案或資料夾（可能是捷徑），為了安全沒有換規則。`,
  sectionsUsage: (cmd: string) => `用法：${cmd} resume-sections（只列出會改哪幾行，不會改檔案）；${cmd} resume-sections --yes（確定要改才加）。`,
  sectionsNotUs: "這一步只用在美國版的履歷（要找美國工作的資料夾）。這個資料夾不用做，什麼都沒改。",
  sectionsNoFile: "找不到 resume.yaml（履歷資料）。還沒有履歷資料的話，不用做這一步。",
  sectionsNotPlain: "resume.yaml 不是一般的檔案（可能是捷徑），為了安全沒有改。",
  sectionsAlready: "你的 resume.yaml 已經是新的排法了（Certifications 在最後一區），什麼都不用改。",
  sectionsNoList: "你的 resume.yaml 沒有自己寫區塊順序（用預設順序），不用改。",
  sectionsUnsupported: "你的 resume.yaml 的區塊順序（sections）不是一行寫完的格式，程式不敢自己改。請請 AI 照 workspace 範本的寫法，在 sections 最後加上 credentials。沒有改任何東西。",
  sectionsUnreadable: "程式讀不懂你的 resume.yaml，或改完會和原本不一樣，所以什麼都沒改。請請 AI 看一下這個檔案。",
  sectionsPreview: "會改這幾行（其他地方一個字都不動）：",
  sectionsNote: (name: string) => `提醒：版本「${name}」有自己寫的區塊順序，這次沒動它。`,
  sectionsNotYet: (cmd: string) => `還沒改。要改的話，確定後再執行：${cmd} resume-sections --yes`,
  sectionsDone: (backup: string) => `改好了。改之前的檔案留了一份在 ${backup}。Certifications 和 Training 之後會印在履歷最後一區。`,
  sectionsFailed: "寫檔失敗，沒有改到 resume.yaml。請再試一次。",
};

export type CliText = typeof ZH;

const EN: CliText = {
  pressEnter: "Press Enter to close this window.",
  closedAfterUpdate: "The update is finished and the program has closed. Double-click the program to open the new version.",
  dirRefused: (command) => `"${command}" does not take --dir or --folder: it only works on the job-search folder the program is in. Run it inside your job-search folder and leave out --dir.`,
  unknownCommand: (what) => `Unknown command or option "${what}".`,
  usage: (us) =>
    `Usage: double-click to open the app. To check your files use "jobhunt check" (one job only: check <job id>; ${us ? "" : "only the 104 master resume: check --104; "}only profile files: check --profiles). To read an old Word resume use "jobhunt read inbox\\old-resume.docx". To choose where you look for work use "jobhunt mode us" (or tw, or both; a market can be added, not removed). To update to a new version use "jobhunt update".`,
  devNeedsDir: "Developer mode needs --dir to point at a job-search folder, for example: bun src/main.ts --dir ../jobhunt/scaffold/workspace-us",
  notFolder1: "This folder does not look like a job-search folder, so the app was not opened.",
  programAt: (dir) => `The program is now in: ${dir}`,
  notFolder3: "Put this program inside your job-search folder (the one with START-HERE.md and AGENTS.md in it), then double-click it again.",
  notFolder4: "If you double-clicked it inside a .zip file: unzip the whole file first, then double-click the program in the folder you unzipped.",
  alreadyRunning: "The app is already open. Opening it in your browser again.",
  started: "The app is open in your browser. Close this window when you are done.",
  startedNoOpen: "The app is ready. Open the address below in your browser. Close this window when you are done.",
  modeNames: { us: "the United States", tw: "Taiwan", both: "the United States and Taiwan" },
  modeInstalled: (name) => `The rules for looking for work in ${name} are installed. Read AGENTS.md again in full (it now holds the full rules) and continue with its first-time steps.`,
  modeNow: (name) => `This folder looks for work in ${name}. To change it use "jobhunt mode us", "jobhunt mode tw" or "jobhunt mode both" (you can add a market, not remove one).`,
  modeUnset: 'This folder does not know yet where you look for work. Use "jobhunt mode us" (United States), "jobhunt mode tw" (Taiwan) or "jobhunt mode both".',
  modeBad: (what) => `Unknown choice "${what}". Use us (United States), tw (Taiwan) or both.`,
  modeNoKit: "This folder is not the one-for-all kit (it has no .kit folder), so its rules cannot be changed. Please download the new job-search folder.",
  modeNarrow: (name) => `This folder already looks for work in ${name}. A market can be added, not removed. All your files are still there; nothing was changed.`,
  modeNotPlain: (path) => `"${path}" is not a plain file or folder (it may be a shortcut), so for safety the rules were not changed.`,
  sectionsUsage: (cmd) => `Usage: ${cmd} resume-sections (only lists the lines it would change; changes no file); ${cmd} resume-sections --yes (add this when you are sure).`,
  sectionsNotUs: "This step is only for a United States resume (a folder that looks for work in the United States). Nothing to do here, and nothing was changed.",
  sectionsNoFile: "resume.yaml (your resume data) was not found. If you have no resume data yet there is nothing to do.",
  sectionsNotPlain: "resume.yaml is not a plain file (it may be a shortcut), so for safety it was not changed.",
  sectionsAlready: "Your resume.yaml already has the new layout (Certifications is the last section). Nothing to change.",
  sectionsNoList: "Your resume.yaml does not list its own section order (it uses the default one). Nothing to change.",
  sectionsUnsupported: "The section order (sections) in your resume.yaml is not on a single line, so the program will not edit it by itself. Ask the AI to add credentials at the end of sections, as in the workspace template. Nothing was changed.",
  sectionsUnreadable: "The program could not read your resume.yaml, or the edit would have changed something else too, so nothing was changed. Ask the AI to look at the file.",
  sectionsPreview: "These lines would change (nothing else is touched):",
  sectionsNote: (name) => `Note: the version "${name}" has its own section order, and it was left alone.`,
  sectionsNotYet: (cmd) => `Nothing was changed yet. When you are sure, run: ${cmd} resume-sections --yes`,
  sectionsDone: (backup) => `Done. A copy of the file as it was before is in ${backup}. Certifications and Training now print in the last section of the resume.`,
  sectionsFailed: "The file could not be written, so resume.yaml was not changed. Please try again.",
};

export const TABLES: Record<Language, CliText> = { "zh-TW": ZH, en: EN };
export const cliTextFor = (lang: Language): CliText => TABLES[lang] ?? ZH;
