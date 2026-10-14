// 進度看板的文字表（每一句使用者看得到的字）。中文是原樣搬來的；英文給 jobhunt.yaml 寫 language: en 的資料夾。
// English status names are word for word the table in the US kit's playbooks/log-application.md (a test compares them).
import type { Language } from "./market.ts";

export type StatusDef = { code: string; label: string };

export const STATUSES_ZH: StatusDef[] = [
  { code: "todo", label: "待投遞" },
  { code: "applied", label: "已投遞" },
  { code: "oa", label: "筆試測驗" },
  { code: "interview", label: "面試中" },
  { code: "offer", label: "錄取" },
  { code: "rejected", label: "未錄取" }, // not 「拒絕」: it could also read as "I turned them down" (that is withdrawn)
  { code: "ghosted", label: "無回應" },
  { code: "withdrawn", label: "放棄" },
];

export const STATUSES_EN: StatusDef[] = [
  { code: "todo", label: "To apply" },
  { code: "applied", label: "Applied" },
  { code: "oa", label: "Online assessment" },
  { code: "interview", label: "Interviewing" },
  { code: "offer", label: "Offer" },
  { code: "rejected", label: "Rejected" },
  { code: "ghosted", label: "No response" },
  { code: "withdrawn", label: "Withdrawn" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ZH = {
  statuses: STATUSES_ZH,
  /** The date as shown on the board: "10/15", or "2025/10/15" when it is not this year. */
  shortDate: (y: number, m: number, d: number, sameYear: boolean) => (sameYear ? `${m}/${d}` : `${y}/${m}/${d}`),
  ghost: (days: number) => `已經 ${days} 天沒有消息，可能石沉大海。可以改成「無回應」，把力氣放在別的職缺。`,
  applied: (days: number) => `已經 ${days} 天沒有消息。可以寫信或打電話問進度。`,
  interview: (date: string) => `約好的日期（${date}）已經過了。結果如何？記得更新狀態。`,
  deadlineToday: (date: string) => `今天（${date}）是截止日。要投的話今天投。`,
  deadlinePast: (date: string) => `截止日（${date}）已經過了。投了就改成「已投遞」；不投了就改成「放棄」。`,
  fileOpen: "進度表正被別的程式（例如 Excel）打開，請先關掉再試一次。",
  changedUnderneath: "進度表剛剛被改過（可能是 AI 改的）。畫面已經更新，請再改一次。",
  needCompany: "請填公司名稱。",
  needRole: "請填職稱。",
  badLink: "職缺網址要用 http:// 或 https:// 開頭。",
  duplicate: "清單裡已經有這家公司的這個職缺了。",
  fieldLocked: "有欄位不能在這裡改。",
  emptyCompany: "公司名稱不能空白。",
  emptyRole: "職稱不能空白。",
  badStatus: "狀態不對，請從選單選。",
  badRequestField: "有一欄的內容不對，請從選單選。",
  badDate: "日期格式不對，請用日期選單選。",
  keepForSnapshot: "這一筆已經存過投遞當時的履歷，不能刪。不想再看到它，可以把狀態改成「放棄」。",
  noRowForResume: "進度表裡找不到這個職缺，所以不知道要記在哪一筆。先到「進度」頁按「＋ 新增一筆」，或跟 AI 說「我投了這家」，再回來存。",
  manyRowsForResume: "進度表裡有好幾筆都對到這份履歷，不知道要記在哪一筆。請跟 AI 說「進度表有重複的職缺，幫我整理」。",
  noResumeFile: "找不到這份履歷檔。",
  noResumeFileAskAi: "找不到這份履歷檔。請跟 AI 說「做成履歷檔」，做好再回來存。",
  dateMoved: "日期已經換了一天，要存的檔名也跟著變。請再按一次「我投了這份，存一份」。",
  alreadyHasCopy: (already: string) => `這一筆已經存過一份了（${already}），為了不蓋掉，不會再存。`,
  savedToday: (to: string) => `今天已經存過這份履歷了（${to}），為了不蓋掉，不會再存。`,
  savedButNotRecorded: (to: string, why: string) => `履歷已經存好（${to}），但進度表沒有記上。${why}之後再按一次就會補記。`,
  rowGone: "找不到這一筆，畫面已經更新，請再試一次。",
};

const EN: typeof ZH = {
  statuses: STATUSES_EN,
  shortDate: (y, m, d, sameYear) => (sameYear ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`),
  ghost: (days) => `No news for ${days} days. It may have gone nowhere. You can change it to "No response" and put your energy into other jobs.`,
  applied: (days) => `No news for ${days} days. You could email or call to ask where things stand.`,
  interview: (date) => `The interview date (${date}) has passed. How did it go? Remember to update the status.`,
  deadlineToday: (date) => `Today (${date}) is the deadline. If you want to apply, apply today.`,
  deadlinePast: (date) => `The deadline (${date}) has passed. If you applied, change it to "Applied". If you will not apply, change it to "Withdrawn".`,
  fileOpen: "The tracker file is open in another program (for example Excel). Close it and try again.",
  changedUnderneath: "The tracker was just changed (maybe by the AI). The screen has been refreshed. Please make your change again.",
  needCompany: "Please enter the company name.",
  needRole: "Please enter the job title.",
  badLink: "The job link must start with http:// or https://.",
  duplicate: "This job at this company is already in your list.",
  fieldLocked: "One of the fields cannot be changed here.",
  emptyCompany: "The company name cannot be empty.",
  emptyRole: "The job title cannot be empty.",
  badStatus: "That status is not valid. Please pick one from the menu.",
  badRequestField: "One of the fields is not valid. Please pick from the menu.",
  badDate: "That date is not valid. Please pick it from the date picker.",
  keepForSnapshot: 'This entry has a saved copy of the resume you sent, so it cannot be deleted. If you do not want to see it, change its status to "Withdrawn".',
  noRowForResume:
    'This job is not in your tracker, so there is no entry to record the saved copy on. Go to the Progress tab and press "+ Add a job", or tell the AI "I applied to this company", then come back and save.',
  manyRowsForResume: 'Several tracker entries match this resume, so it is unclear which one to use. Tell the AI "My tracker has duplicate jobs, please clean it up".',
  noResumeFile: "Cannot find this resume file.",
  noResumeFileAskAi: 'Cannot find this resume file. Tell the AI "Make the resume file", then come back to save a copy.',
  dateMoved: 'The date has changed since you opened this, so the saved file name changed too. Please press "I applied, save a copy" again.',
  alreadyHasCopy: (already) => `A copy was already saved for this entry (${already}). To avoid overwriting it, nothing more will be saved.`,
  savedToday: (to) => `A copy of this resume was already saved today (${to}). To avoid overwriting it, nothing more will be saved.`,
  savedButNotRecorded: (to, why) => `The resume copy is saved (${to}), but the tracker was not updated. ${why ? `${why} ` : ""}Press the button again later and it will be recorded.`,
  rowGone: "Cannot find this entry. The screen has been refreshed. Please try again.",
};

export const APPS_TEXT = { "zh-TW": ZH, en: EN } as const;
export const appsText = (lang: Language | undefined) => APPS_TEXT[lang === "en" ? "en" : "zh-TW"];
export const statusesFor = (lang: Language | undefined) => appsText(lang).statuses;
