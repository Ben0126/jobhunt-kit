// What the one-click update (selfupdate.ts) says: on the command line (`jobhunt update`) and in the page's answers.
// One table per jobhunt.yaml `language`.
import type { Language, Market } from "./market.ts";

/** The user's own files and folders, which an update never touches (shown in the preview). */
const KEEP: Record<Market, string> = {
  tw: "resume.yaml、data/applications.csv、me/、jobs/、targets/、resumes/、104/、submitted/、checks/、inbox/",
  us: "resume.yaml, data/applications.csv, me/, jobs/, targets/, resumes/, profiles/, submitted/, checks/, inbox/",
};

const ZH = {
  devBuild: "這是開發中的版本，不能自動更新。",
  unsupported: "這台電腦的系統沒有對應的下載檔，不能自動更新。",
  offline: "連不到 GitHub，所以沒有更新，原來的程式和檔案都還在。請確認有網路，晚點再試。",
  latest: (v: string) => `已經是最新版（v${v}），不用更新。`,
  noAsset: (asset: string) => `最新版還沒有你電腦用的檔案（${asset}），所以沒有更新。過一陣子再試。`,
  badDownload: "下載下來的檔案不完整或不對，所以沒有更新，原來的程式和檔案都還在。請晚點再試一次。",
  notPlainFile: (path: string) => `資料夾裡的「${path}」不是一般的檔案（可能是捷徑或資料夾），為了安全沒有更新。`,
  busy: "另一個更新正在進行，請等它做完。",
  restored: "有檔案換不掉（可能被別的程式打開了），已經全部還原，原來的程式和檔案都還在。關掉其他打開這個資料夾的程式，再試一次。",
  verifyFailed: "新程式打不開，已經全部還原成原來的版本。",
  rollbackFailed: "更新到一半出錯，而且有檔案沒辦法自動還原。換掉的舊檔都在 .jobhunt/backup/files/ 裡。請把這段話截圖，傳給給你這個工具的人。",
  noPreview: "要先看過會換掉哪些檔，才能更新。請重新按一次「一鍵更新」。",
  previewTitle: (from: string, to: string) => `從 v${from} 更新到 ${to}`,
  willReplace: (n: number) => `會換掉這 ${n} 個程式和說明檔：`,
  newFile: "（新的檔）",
  settingsAdded: (keys: string[]) => `jobhunt.yaml 會補上新的設定：${keys.join("、")}（你原本的設定都保留）`,
  keep: (m: Market) => `你的資料一個都不會動：${KEEP[m]}`,
  backupNote: "換掉的舊檔會先備份到 .jobhunt/backup/。新版有問題的話，可以退回上一版。",
  nothingChanged: (to: string) => `所有檔案都已經和 ${to} 一樣，不用換。`,
  confirmCli: (cmd: string) => `確定要更新，請執行：${cmd} update --yes`,
  done: (to: string) => `更新好了：現在是 ${to}。`,
  reopenCli: "請關掉程式的文字視窗，再點兩下程式打開。",
  undoHintCli: (cmd: string) => `新版有問題的話，執行 ${cmd} update --undo 可以退回上一版。`,
  undoNone: "找不到上一次更新留下的備份，沒有東西可以退回。",
  undoWrongVersion: (now: string, to: string) => `現在的程式是 v${now}，備份是給 v${to} 退回用的，兩個對不上，所以沒有退回。`,
  undoDone: (from: string) => `已經退回到 v${from}。`,
  undoFailed: "退回時有檔案換不掉，沒有退回。關掉其他打開這個資料夾的程式，再試一次。",
  usage: (cmd: string) => `用法：${cmd} update（先列出會換掉哪些檔）、${cmd} update --yes（真的更新）、${cmd} update --undo（退回上一版）`,
};

const EN: typeof ZH = {
  devBuild: "This is a development build. It cannot update itself.",
  unsupported: "There is no download for this computer's system, so it cannot update itself.",
  offline: "Could not reach GitHub, so nothing was updated. Your program and files are unchanged. Check your internet connection and try again later.",
  latest: (v) => `You already have the newest version (v${v}).`,
  noAsset: (asset) => `The newest version does not have the file for your computer yet (${asset}), so nothing was updated. Try again later.`,
  badDownload: "The downloaded file was incomplete or wrong, so nothing was updated. Your program and files are unchanged. Please try again later.",
  notPlainFile: (path) => `"${path}" in your folder is not a normal file (maybe a shortcut or a folder), so nothing was updated, to be safe.`,
  busy: "Another update is already running. Please wait for it to finish.",
  restored: "A file could not be replaced (another program may have it open). Everything was put back, so your program and files are unchanged. Close other programs that use this folder and try again.",
  verifyFailed: "The new program would not start, so everything was put back to the version you had.",
  rollbackFailed: "Something went wrong halfway through the update, and some files could not be put back automatically. The replaced files are in .jobhunt/backup/files/. Please take a screenshot of this message and send it to the person who gave you this tool.",
  noPreview: "You need to see which files will be replaced before updating. Click \"Update now\" again.",
  previewTitle: (from, to) => `Update from v${from} to ${to}`,
  willReplace: (n) => `These ${n} program and instruction files will be replaced:`,
  newFile: " (new file)",
  settingsAdded: (keys) => `New settings will be added to jobhunt.yaml: ${keys.join(", ")} (your own settings stay as they are)`,
  keep: (m) => `None of your own files are touched: ${KEEP[m]}`,
  backupNote: "The replaced files are first copied to .jobhunt/backup/. If the new version has a problem, you can go back to the previous one.",
  nothingChanged: (to) => `All files already match ${to}. Nothing to replace.`,
  confirmCli: (cmd) => `To update, run: ${cmd} update --yes`,
  done: (to) => `Update finished: you now have ${to}.`,
  reopenCli: "Close the program's text window, then double-click the program to open it again.",
  undoHintCli: (cmd) => `If the new version has a problem, run ${cmd} update --undo to go back to the previous version.`,
  undoNone: "No backup from an earlier update was found, so there is nothing to go back to.",
  undoWrongVersion: (now, to) => `This program is v${now}, but the backup is for going back from v${to}. They do not match, so nothing was changed.`,
  undoDone: (from) => `Went back to v${from}.`,
  undoFailed: "A file could not be replaced while going back, so nothing was changed. Close other programs that use this folder and try again.",
  usage: (cmd) => `Usage: ${cmd} update (lists the files that would be replaced), ${cmd} update --yes (updates), ${cmd} update --undo (goes back to the previous version)`,
};

export type UpdateText = typeof ZH;
export const UPDATE_TABLES: Record<Language, UpdateText> = { "zh-TW": ZH, en: EN };
export const updateTextFor = (lang: Language): UpdateText => UPDATE_TABLES[lang] ?? ZH;
