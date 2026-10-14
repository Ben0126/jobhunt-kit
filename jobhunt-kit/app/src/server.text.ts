// 本機伺服器的文字表：錯誤頁、錯誤訊息、PDF 檔名。中文是原樣搬來的；英文給 jobhunt.yaml 寫 language: en 的資料夾。
import type { Language } from "./market.ts";

const ZH = {
  /** <html lang> of the plain error pages. */
  htmlLang: "zh-Hant-TW",
  badRequest: "出了點問題，請關掉這個分頁，再從程式重新打開。",
  staleTab: "這個分頁是舊的（程式重新打開過）。請關掉它，用程式剛打開的那個分頁。",
  serverError: "出了點問題，沒有存檔。請再試一次；一直不行，就把黑色視窗和這個畫面截圖，傳給給你這個工具的人。",
  reopenTitle: "要重新打開",
  reopenMsg: "請回到求職小幫手的分頁再按一次；還是不行就關掉分頁，從程式重新打開。",
  forbiddenTitle: "不能打開",
  forbiddenMsg: "這個網址只能從求職小幫手裡打開。",
  notFoundTitle: "找不到這份履歷",
  noResumeTitle: "找不到這份履歷檔",
  noResumeMsg: "請跟 AI 說「做成履歷檔」，做好再回來。",
  /** The middle word of the PDF's file name (name_RESUME_company). */
  pdfWord: "履歷",
  photoFormat: "這張照片不能用，請換一張 .jpg 或 .png 的照片。",
  photoBig: "這張照片檔案太大，請換一張小一點的。",
};

const EN: typeof ZH = {
  htmlLang: "en",
  badRequest: "Something went wrong. Please close this tab and open the program again.",
  staleTab: "This tab is out of date (the program was opened again). Close it and use the tab the program just opened.",
  serverError:
    "Something went wrong and nothing was saved. Please try again. If it keeps happening, take a screenshot of the program's text window and of this screen, and send it to the person who gave you this tool.",
  reopenTitle: "Please reopen",
  reopenMsg: "Go back to the Job Search Helper tab and try again. If that does not work, close the tab and open the program again.",
  forbiddenTitle: "Cannot open this",
  forbiddenMsg: "This address can only be opened from inside the Job Search Helper.",
  notFoundTitle: "Resume not found",
  noResumeTitle: "Resume file not found",
  noResumeMsg: 'Tell the AI "Make the resume file", then come back.',
  pdfWord: "Resume",
  photoFormat: "This photo can't be used. Please choose a .jpg or .png picture.",
  photoBig: "This photo file is too big. Please choose a smaller one.",
};

export const SERVER_TEXT = { "zh-TW": ZH, en: EN } as const;
export const serverText = (lang: Language | undefined) => SERVER_TEXT[lang === "en" ? "en" : "zh-TW"];
