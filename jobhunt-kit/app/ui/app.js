// 求職小幫手：畫面程式（不需要任何外部套件）。
"use strict";

// <ui-text>
// Every word the page shows, once per language. The page picks one by <html lang> ("en" -> English, anything else -> 繁體中文),
// and the folder's market / paper (from /api/info) only decide the things that differ by country (paper size, 1-page tip, 104 tab).
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "2026-10-09 14:03" or "2026-10-09" -> "Oct 9, 14:03" / "Oct 9". */
function enStamp(s) {
  const m = /^\d{4}-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(s || "");
  return m ? `${MONTHS_EN[Number(m[1]) - 1]} ${Number(m[2])}${m[3] ? `, ${m[3]}` : ""}` : String(s || "");
}

const TEXT = {
  "zh-TW": {
    pageTitle: "求職小幫手",
    offline: "連不到程式。程式的視窗是不是被關掉了？請再點兩下程式打開。",
    genericError: "出了點問題，請再試一次。",
    gotIt: "知道了",
    updateTitle: (v) => `有新版本可以更新：${v}`,
    updateNotes: "看這個版本改了什麼",
    updateDownload: (zip) => `下載你要用的檔案：${zip}`,
    updateHow: "怎麼更新（照順序做）：",
    updateSteps: (program) => [
      "先把程式的文字視窗關掉。",
      "把剛下載的 zip 解壓縮到另一個資料夾，例如桌面。不要解壓縮到你現在用的求職資料夾。",
      `只從解壓縮出來的資料夾裡，複製「${program === "jobhunt.exe" ? "jobhunt」（類型是「應用程式」的那個，完整檔名是 jobhunt.exe）" : program + "」"}這一個檔案，貼到你現在用的求職資料夾，選「取代」。`,
      "再點兩下程式打開。",
    ],
    updateWinNote: "第一次打開新的程式時，如果跳出「Windows 已保護您的電腦」，按「其他資訊」→「仍要執行」。",
    updateMacNote: "Mac 換完第一次打開，可能要再按一次右鍵 →「打開」。",
    updateWarn: "千萬不要把整個 zip 直接解壓縮、蓋過你現在用的求職資料夾。新 zip 裡的履歷資料和投遞進度表是空白的，會蓋掉你確認過的經歷和投遞進度。",
    updateOffHint: "程式每天最多問 GitHub 一次有沒有新版本，不會傳你的資料。要關掉：用記事本打開求職資料夾裡的 jobhunt.yaml，在最後加一行 update_check: false，存檔。",
    updateLater: "先不要",
    unknownStatus: (code) => `看不懂的狀態「${code}」`,
    noStatus: "還沒填狀態",
    folderLabel: (name) => `資料夾：${name}`,
    statusAria: "狀態",
    nextStep: (x) => `下一步：${x}`,
    appliedOn: (d) => `投遞：${d}`,
    clickToEdit: "點一下修改",
    noCompany: "（沒有公司名稱）",
    viewJob: "看職缺",
    none: "沒有",
    todoName: "待投遞",
    movedToClosed: (label, company, role) => `已改成「${label}」：${company} ${role} 移到下面「已結束」那一區。`,
    saved: (company, role) => `已存檔：${company} ${role}`,
    added: (company, role, todo) => `已新增：${company} ${role}（放在「${todo}」）`,
    editTitle: (company, role) => `修改：${company} ${role}`,
    editKept: (msg) => `${msg}你剛剛打的內容還在，看一下沒問題就再按一次「儲存」。`,
    rowGoneInEdit: "這一筆在進度表裡已經找不到了（可能被 AI 改掉或刪掉）。你剛剛打的內容還在畫面上，需要的話先複製起來，再按「取消」。",
    confirmDelete: (company, role) => `確定要刪掉「${company} ${role}」這一筆嗎？刪掉就找不回來了。\n\n只是不想投了，可以按「取消」，把狀態改成「放棄」。`,
    deleted: (company, role) => `已刪除：${company} ${role}`,
    // check results
    stamp: (at) => `檢查時間：${at.slice(5).replace("-", "/")}`,
    shortStamp: (at) => at.slice(5).replace("-", "/"),
    problemCount: (n) => `${n} 個問題`,
    passed: "通過",
    whereResume: "履歷檔",
    whereTargets: "客製履歷",
    whereData: "履歷資料",
    plainResume: "下面這份履歷",
    plainTargets: "AI 準備的內容",
    plainData: "你確認過的經歷資料",
    whereLabel: (w) => `${w}：`,
    messageEnd: (m) => `${m}。`,
    followSep: "：",
    tellAi: "請跟 AI 說",
    sayQuoted: (words) => `「${words}」`,
    checking: "檢查中…",
    recheck: "重新檢查",
    // resume page
    noCompanyShort: "（沒寫公司）",
    updated: (at) => `更新：${at.slice(5).replace("-", "/")}`,
    pillUnconfirmed: (n) => `未確認 ${n} 段`,
    pillToAnswer: (n) => `待回答 ${n} 題`,
    unconfirmedHead: (n) => `還有 ${n} 段經歷沒確認：`,
    nameSep: "、",
    unconfirmedTail: "。這份履歷不會有這幾段。",
    unansweredHead: (n) => `還有 ${n} 題沒回答。`,
    unansweredTail: "AI 改寫的句子要你回答過才能放進履歷。",
    sayConfirmDrafts: "幫我確認還沒確認的經歷",
    sayAnswerQs: "問我還沒回答的題目",
    afterWaiting: "，確認完再請 AI 重做這份履歷，會比較完整。",
    origMissing: "找不到你確認過的原句，下面整句都當成新的。請跟 AI 說「這句的原句在哪裡」。",
    tagOriginal: "原句",
    tagThisResume: "這份履歷",
    rewritesSummary: (n) => `AI 改寫的句子（${n} 句）`,
    rewritesHint: "綠底的字是加上去的，畫刪除線的字是拿掉的。這裡只能看；要改請跟 AI 說。",
    // save a copy
    saveCopyBtn: "我投了這份，存一份",
    saveCopyHint: "投出去之後按，留一份寄出的版本，之後才查得到寄給這家的是哪一版。",
    alreadySaved: (list) => `已經存過：${list}`,
    listSep: "、",
    hasCopyHead: "這一筆已經存過一份了",
    hasCopyTail: (already) => `（${already}）。為了不蓋掉，不會再存。`,
    savedTodayHead: "今天已經存過這份履歷了",
    savedTodayTail: (name) => `（${name}）。為了不蓋掉，不會再存。`,
    willCopy: "會把現在這份履歷複製一份，存到求職資料夾的「submitted」資料夾：",
    willRecord: (company, role) => `並記在進度表「${company} ${role}」那一筆。存好的檔案不會被改，也不會被蓋掉。`,
    unfixedWarn: (n) => `這份履歷還有 ${n} 個問題沒修。如果你已經用這一版投出去了，還是可以存，記下你寄出的是哪一版。`,
    willApply: "進度表上這一筆會一起改成「已投遞」，投遞日記今天。",
    confirmSave: "確定，存一份",
    notNow: "先不要",
    savedDone: (name) => `已經存好：${name}，也記在進度表了。`,
    // PDF
    pdfOpens: "會打開新分頁和列印視窗。",
    pdfChrome: (paper) => ["Chrome、Edge：目的地選「另存為 PDF」→ 紙張選「" + paper + "」→ 按「更多設定」，", "取消勾選「頁首和頁尾」", "→ 儲存。"],
    pdfSafari: (paper) => "Mac 的 Safari：按左下角「PDF」→「儲存為 PDF」。",
    savePdf: "存成 PDF",
    noResumeFileYet: "還沒有履歷檔，所以還不能存。",
    confirmPdfAria: "確定要存成 PDF 嗎",
    confirmPdfHead: (n) => `確定要存？這份履歷還有 ${n} 個問題（上面紅色那幾項）。`,
    confirmPdfTail: "投出去，公司看到的就是這個版本，面試時也可能被問到。",
    savePdfAnyway: "我知道，仍要存成 PDF",
    savePdfWithProblems: (n) => `存成 PDF（還有 ${n} 個問題）`,
    // pages: market is "tw" or "us"
    pageNote: (p, market) =>
      p > 1
        ? market === "us"
          ? `估計會印成 ${p} 頁。美國的履歷最好 1 頁：可以跟 AI 說「幫我把履歷縮成一頁」。（還是可以照樣存成 PDF）`
          : `估計會印成 ${p} 頁。台灣的履歷最好 1 頁：可以跟 AI 說「幫我把履歷縮成一頁」。（還是可以照樣存成 PDF）`
        : `估計會印成 ${p} 頁。`,
    resumeFailedHead: (n) => `這份履歷還沒通過檢查：${n} 個問題`,
    hiddenFromPreview: "標著「AI 準備的內容」或「你確認過的經歷資料」的問題，在下面的履歷上不一定看得到，那是 AI 那邊的資料。",
    sayFixResume: "幫我修這份履歷的問題",
    afterRecheck: "，改好之後按「重新檢查」。",
    okHead: "程式檢查通過",
    okBody: "數字、日期、用詞、句子長度、佔位字和來源都沒問題。意思和職稱有沒有寫得比實際大，還是要你自己讀一次。",
    photoHint: "這份設定要放照片。從這裡存的 PDF 不會有照片；要放照片，請照「開始使用」裡的方法自己存。",
    previewTitle: "履歷預覽",
    blankResume: "還沒有履歷檔。跟 AI 說「做成履歷檔」，做好之後按「重新檢查」。",
    // 104
    copy: "複製",
    copied: "已複製 ✓",
    copiedNotice: (name) => `已複製「${name}」，到 104 貼上就好。`,
    copyFailed: "沒辦法自動複製。請自己選取上面的文字，按 Ctrl+C（Mac 按 ⌘+C）。",
    sizeWithLimit: (n, lim) => `${n} / ${lim} 字`,
    sizeNoLimit: (n) => `${n} 字（上限以 104 畫面為準）`,
    cantCopy: "為了不讓沒根據的內容送到公司，有問題的欄位先不能複製。",
    sayFix104: "幫我修 104 的問題",
    emptyText: "（空的）",
    general104: "104 總履歷",
    applyTitle: (company, role) => `應徵 ${company} ${role}`,
  },
  en: {
    pageTitle: "Job Search Helper",
    offline: "Cannot reach the program. Was its window closed? Open the program again.",
    genericError: "Something went wrong. Please try again.",
    gotIt: "Got it",
    updateTitle: (v) => `A new version is available: ${v}`,
    updateNotes: "See what changed",
    updateDownload: (zip) => `Download the file for your computer: ${zip}`,
    updateHow: "How to update (in this order):",
    updateSteps: (program) => [
      "Close the program's text window.",
      "Unzip the file you downloaded into a different folder, for example your Desktop. Do not unzip it into the job-search folder you use now.",
      `From the unzipped folder, copy only ${program === "jobhunt.exe" ? 'the file "jobhunt" whose type is "Application" (its full name is jobhunt.exe)' : `the file "${program}"`} into your job-search folder and choose Replace.`,
      "Double-click the program again.",
    ],
    updateWinNote: "The first time you open the new program, if Windows shows \"Windows protected your PC\", click \"More info\", then \"Run anyway\".",
    updateMacNote: "On a Mac, the first time you open the new program you may need to right-click it and choose Open again.",
    updateWarn: "Never unzip the whole file over your job-search folder. The resume and the application tracker inside the new zip are blank, and they would replace your confirmed experience and your application progress.",
    updateOffHint: "The program asks GitHub at most once a day whether a newer version exists, and sends none of your information. To turn this off: open the settings file named jobhunt in your job-search folder (the one that is not an application) with Notepad or TextEdit, add this line at the very end, and save: update_check: false",
    updateLater: "Not now",
    unknownStatus: (code) => `Unknown status "${code}"`,
    noStatus: "No status yet",
    folderLabel: (name) => `Folder: ${name}`,
    statusAria: "Status",
    nextStep: (x) => `Next step: ${x}`,
    appliedOn: (d) => `Applied: ${d}`,
    clickToEdit: "Click to edit",
    noCompany: "(no company name)",
    viewJob: "View job",
    none: "None",
    todoName: "To apply",
    movedToClosed: (label, company, role) => `Changed to "${label}": ${company} ${role} moved to the "Closed" section below.`,
    saved: (company, role) => `Saved: ${company} ${role}`,
    added: (company, role, todo) => `Added: ${company} ${role} (in "${todo}")`,
    editTitle: (company, role) => `Edit: ${company} ${role}`,
    editKept: (msg) => `${msg} What you typed is still here. Check it and press "Save" again.`,
    rowGoneInEdit: 'This job can no longer be found in the tracker (the AI may have changed or deleted it). What you typed is still on screen. Copy it if you need it, then press "Cancel".',
    confirmDelete: (company, role) => `Delete "${company} ${role}"? You cannot get it back.\n\nIf you just do not want to apply, press "Cancel" and change the status to "Withdrawn".`,
    deleted: (company, role) => `Deleted: ${company} ${role}`,
    stamp: (at) => `Checked: ${enStamp(at)}`,
    shortStamp: (at) => enStamp(at),
    problemCount: (n) => plural(n, "problem"),
    passed: "Passed",
    whereResume: "Resume file",
    whereTargets: "Targets file",
    whereData: "Resume data",
    plainResume: "The resume below",
    plainTargets: "What the AI prepared",
    plainData: "Your confirmed experience",
    whereLabel: (w) => `${w}: `,
    messageEnd: (m) => `${m}.`,
    followSep: ": ",
    tellAi: "Tell the AI ",
    sayQuoted: (words) => `"${words}"`,
    checking: "Checking…",
    recheck: "Check again",
    noCompanyShort: "(no company)",
    updated: (at) => `Updated: ${enStamp(at)}`,
    pillUnconfirmed: (n) => `${n} unconfirmed`,
    pillToAnswer: (n) => `${plural(n, "question")} to answer`,
    unconfirmedHead: (n) => `${plural(n, "experience")} not confirmed yet: `,
    nameSep: ", ",
    unconfirmedTail: ". This resume leaves out anything not confirmed.",
    unansweredHead: (n) => `${plural(n, "question")} not answered yet. `,
    unansweredTail: "A sentence the AI reworded can only go into the resume after you answer.",
    sayConfirmDrafts: "Help me confirm my unconfirmed experiences",
    sayAnswerQs: "Ask me the questions I have not answered",
    afterWaiting: ". After that, ask the AI to remake this resume so it is more complete.",
    origMissing: 'Cannot find the original sentence you confirmed, so the whole sentence below is treated as new. Tell the AI "Where is the original of this sentence?"',
    tagOriginal: "Original",
    tagThisResume: "This resume",
    rewritesSummary: (n) => `Sentences the AI reworded (${n})`,
    rewritesHint: "Green text was added. Struck-through text was removed. This is view only; to change anything, tell the AI.",
    saveCopyBtn: "I applied, save a copy",
    saveCopyHint: "Press this after you apply. It keeps a copy of the version you sent, so you can look up later which version went to this company.",
    alreadySaved: (list) => `Already saved: ${list}`,
    listSep: ", ",
    hasCopyHead: "A copy was already saved for this job",
    hasCopyTail: (already) => ` (${already}). To avoid overwriting it, nothing more will be saved.`,
    savedTodayHead: "A copy of this resume was already saved today",
    savedTodayTail: (name) => ` (${name}). To avoid overwriting it, nothing more will be saved.`,
    willCopy: 'This copies the current resume into the "submitted" folder inside your job-search folder: ',
    willRecord: (company, role) => `It is also recorded on the tracker entry "${company} ${role}". The saved file will not be changed or overwritten.`,
    unfixedWarn: (n) => `This resume still has ${plural(n, "problem")} to fix. If you already applied with this version, you can still save it to record which version you sent.`,
    willApply: 'This job will also change to "Applied" in your tracker, with today as the date applied.',
    confirmSave: "Yes, save a copy",
    notNow: "Not now",
    savedDone: (name) => `Saved: ${name}. It is also recorded in your tracker.`,
    pdfOpens: "A new tab and the print window will open.",
    pdfChrome: (paper) => [
      `Chrome: Destination "Save as PDF". Edge: Printer "Save as PDF". Then Paper size "${paper}", open "More settings", `,
      'turn off "Headers and footers"',
      ", and click Save.",
    ],
    pdfSafari: (paper) => `Mac Safari: bottom-left "PDF" menu, "Save as PDF". Click "Show Details", set Paper Size to "${paper === "Letter" ? "US Letter" : paper}" and turn off "Print headers and footers".`,
    savePdf: "Save as PDF",
    noResumeFileYet: "There is no resume file yet, so it cannot be saved.",
    confirmPdfAria: "Save as PDF anyway?",
    confirmPdfHead: (n) => `Save anyway? This resume still has ${plural(n, "problem")} (the red items above). `,
    confirmPdfTail: "If you send it, this is the version the company sees, and an interviewer may ask about it.",
    savePdfAnyway: "I understand, save as PDF anyway",
    savePdfWithProblems: (n) => `Save as PDF (${plural(n, "problem")} left)`,
    pageNote: (p, market) =>
      p > 1
        ? market === "tw"
          ? `Estimated ${p} pages. A resume in Taiwan should be 1 page: you can tell the AI "Cut my resume to one page". (You can still save the PDF.)`
          : `Estimated ${p} pages. A US resume should be one page: you can tell the AI "Cut my resume to one page". (You can still save the PDF.)`
        : `Estimated ${p} page.`,
    resumeFailedHead: (n) => `This resume has not passed the check: ${plural(n, "problem")}`,
    hiddenFromPreview: 'Problems marked "What the AI prepared" or "Your confirmed experience" may not be visible in the resume below. That is data on the AI\'s side.',
    sayFixResume: "Fix the problems in this resume",
    afterRecheck: '. After it is fixed, press "Check again".',
    okHead: "Program check passed",
    okBody: "Numbers, wording, sentence length, placeholders, ID numbers, visa words and sources are all fine. You still need to read it yourself to make sure the meaning and job titles are not bigger than what you really did.",
    photoHint: "This setup asks for a photo. A PDF saved from here has no photo. To include one, follow the steps in the start-here guide and save it yourself.",
    previewTitle: "Resume preview",
    blankResume: 'There is no resume file yet. Tell the AI "Make the resume file", then press "Check again".',
    copy: "Copy",
    copied: "Copied ✓",
    copiedNotice: (name) => `Copied "${name}". Paste it into 104.`,
    copyFailed: "Could not copy automatically. Select the text above yourself and press Ctrl+C (Mac: ⌘+C).",
    sizeWithLimit: (n, lim) => `${n} / ${lim} characters`,
    sizeNoLimit: (n) => `${n} characters (the limit shown on 104 applies)`,
    cantCopy: "To keep unsupported content from reaching a company, a field with problems cannot be copied yet.",
    sayFix104: "Fix the problems for 104",
    emptyText: "(empty)",
    general104: "104 general resume",
    applyTitle: (company, role) => `Application: ${company} ${role}`,
  },
};

/** "a4" -> "A4", "letter" -> "Letter" (the name the print dialog uses). */
const paperName = (paper) => (paper === "letter" ? "Letter" : "A4");

/** Pages the resume will print on, from the height (px) of its content. A4: 15 mm margins. Letter: 0.6 in margins, and
 * (like the US template) one pixel over already counts as a second page. */
function pagesFor(contentPx, paper) {
  if (paper === "letter") {
    const usable = (11 - 0.6 * 2) * 96;
    return contentPx > usable + 1 ? Math.max(2, Math.ceil(contentPx / usable)) : 1;
  }
  const usable = ((297 - 15 * 2) * 96) / 25.4;
  return Math.max(1, Math.ceil(contentPx / usable - 0.02));
}
// </ui-text>

const LANG = document.documentElement.lang === "en" ? "en" : "zh-TW";
const T = TEXT[LANG];
/** What /api/info says about the folder; until it answers, the language's usual country. */
let INFO = LANG === "en" ? { market: "us", paper: "letter" } : { market: "tw", paper: "a4" };
const tabKnown = () => (INFO.market === "us" ? ["progress", "resumes", "nokey"] : ["progress", "resumes", "104", "nokey"]);

const ACTIVE = ["todo", "applied", "oa", "interview", "offer"];
const CLOSED = ["rejected", "ghosted", "withdrawn"];
const TOKEN_KEY = "jobhunt-token";

// ---- 通行碼：從網址拿，存在這個分頁，然後從網址拿掉
const token = (() => {
  const t = new URLSearchParams(location.search).get("t");
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    if (location.search) history.replaceState(null, "", location.pathname + location.hash);
    return t || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return t;
  }
})();

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { "x-jobhunt-token": token || "", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(T.offline, 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new ApiError((data && data.error) || T.genericError, res.status, data);
  return data;
}

// ---- 提示訊息：綠的 4 秒後自己消失；紅的要按「知道了」，換分頁時也會收起來
let noticeTimer;
let noticeKind = "";
function notice(msg, bad = false, kind = "") {
  const el = $("notice");
  // replaceChildren would print a null child as the text "null": only real nodes go in
  const parts = [h("span", { class: "msg" }, msg)];
  if (bad) parts.push(h("button", { type: "button", class: "close", onclick: () => hideNotice() }, T.gotIt));
  el.replaceChildren(...parts);
  el.className = "notice" + (bad ? " bad" : "");
  el.hidden = false;
  noticeKind = kind;
  clearTimeout(noticeTimer);
  if (!bad) noticeTimer = setTimeout(hideNotice, 4000);
}
function hideNotice() {
  clearTimeout(noticeTimer);
  $("notice").hidden = true;
  noticeKind = "";
}
function fail(e) {
  notice(e.message, true, e.status === 0 ? "offline" : "");
}
/** A load worked: a "can't reach the program" message is no longer true. */
function loaded() {
  if (noticeKind === "offline") hideNotice();
}

// ---- 新版本提醒：頁面載好之後才問程式（程式自己每天最多問 GitHub 一次）；沒有新版、關掉、連不上都不顯示任何東西
function showUpdate(u) {
  if ($("update-banner")) return;
  const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);
  // Taiwan page: the Chinese notes of this version (falls back to the release page); English page: the release page
  const notes = LANG === "zh-TW" && u.notesZhUrl ? u.notesZhUrl : u.notesUrl;
  const banner = h(
    "section",
    { id: "update-banner", class: "update-banner", role: "status" },
    h("h2", {}, T.updateTitle(u.version)),
    h("p", {}, link(notes, T.updateNotes)),
    h("p", {}, link(u.downloadUrl, T.updateDownload(u.zipName))),
    h("p", { class: "how" }, T.updateHow),
    h("ol", {}, T.updateSteps(u.programName).map((s) => h("li", {}, s))),
    u.programName === "jobhunt.exe" ? h("p", { class: "hint" }, T.updateWinNote) : null,
    /^jobhunt-mac/.test(u.programName) ? h("p", { class: "hint" }, T.updateMacNote) : null,
    h("p", { class: "warn" }, T.updateWarn),
    h("p", { class: "hint" }, T.updateOffHint),
    h("div", { class: "actions" }, h("button", { type: "button", onclick: () => banner.remove() }, T.updateLater)),
  );
  $("notice").before(banner);
}
async function checkUpdate() {
  try {
    const u = await api("GET", "/api/update");
    if (u && u.available && u.version && u.notesUrl && u.downloadUrl && u.zipName && u.programName) showUpdate(u);
  } catch {}
}

// ---- 分頁
/** The tab the address asks for, or "progress" when it is unknown (or hidden for this country). */
function currentTab() {
  const tab = token ? (location.hash.replace("#", "") || "progress") : "nokey";
  return tabKnown().includes(tab) ? tab : "progress";
}

function showTab() {
  const known = currentTab();
  hideNotice();
  for (const p of document.querySelectorAll(".page")) p.hidden = p.id !== `page-${known}`;
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.dataset.tab === known) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  if (known === "progress") loadBoard();
  if (known === "resumes") loadResumes();
  if (known === "104") load104();
}

// ---- 進度看板
let board = null;

function label(code) {
  const s = board && board.statuses.find((x) => x.code === code);
  return s ? s.label : code ? T.unknownStatus(code) : T.noStatus;
}

function shortDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  const [y, m, d] = s.split("-").map(Number);
  if (LANG === "en") return y === Number(board.today.slice(0, 4)) ? `${MONTHS_EN[m - 1]} ${d}` : `${MONTHS_EN[m - 1]} ${d}, ${y}`;
  return y === Number(board.today.slice(0, 4)) ? `${m}/${d}` : `${y}/${m}/${d}`;
}

function safeLink(u) {
  return /^https?:\/\/\S+$/i.test(u || "") ? u : null;
}

/** "www.104.com.tw/job/x" → "https://www.104.com.tw/job/x" (people paste links without the beginning). */
function fixLink(u) {
  const v = (u || "").trim();
  if (v && !/^https?:\/\//i.test(v) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`;
  return v;
}

async function loadBoard() {
  try {
    const [b, info] = await Promise.all([api("GET", "/api/applications"), folderInfo()]);
    if (info) {
      const parts = String(info.folder).split(/[\\/]/).filter(Boolean);
      $("folder").textContent = T.folderLabel(parts[parts.length - 1] || info.folder);
      $("folder").title = info.folder;
    }
    render(b);
    loaded();
  } catch (e) {
    fail(e);
  }
}

let infoCache = null;
async function folderInfo() {
  if (!infoCache) infoCache = await api("GET", "/api/info").catch(() => null);
  return infoCache;
}

function statusSelect(current, onChange) {
  const sel = h("select", { "aria-label": T.statusAria, onchange: (e) => onChange(e.target.value) });
  const codes = board.statuses.map((s) => s.code);
  if (!codes.includes(current)) sel.append(h("option", { value: current, selected: true, disabled: true }, label(current)));
  for (const s of board.statuses) sel.append(h("option", { value: s.code, selected: s.code === current }, s.label));
  return sel;
}

function card(row, flagged) {
  const meta = [];
  if (row.next_action || row.next_action_date)
    meta.push(
      h(
        "div",
        { class: "next" },
        T.nextStep(row.next_action || ""),
        row.next_action_date ? h("span", { class: "date" }, shortDate(row.next_action_date)) : null,
      ),
    );
  if (row.applied_date) meta.push(h("div", { class: "meta" }, T.appliedOn(shortDate(row.applied_date))));
  if (row.notes) meta.push(h("div", { class: "meta" }, row.notes));
  const link = safeLink(row.link);
  return h(
    "article",
    { class: "card" + (flagged ? " flag" : "") },
    h(
      "button",
      { type: "button", class: "open", title: T.clickToEdit, onclick: () => openEdit(row) },
      h("span", { class: "company" }, row.company || T.noCompany),
      h("span", { class: "role" }, row.role || ""),
      meta,
    ),
    h(
      "div",
      { class: "row" },
      statusSelect(row.status, (v) => save(row, { status: v })),
      link && h("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, T.viewJob),
    ),
  );
}

function column(code, rows, flagged) {
  const list = rows.filter((r) => (r.status || "").trim() === code);
  return h(
    "section",
    { class: "col", "aria-label": label(code) },
    h("h3", {}, label(code), h("span", { class: "count" }, String(list.length))),
    list.length ? list.map((r) => card(r, flagged.has(r._index))) : h("p", { class: "empty" }, T.none),
  );
}

function render(b) {
  board = b;
  const rows = b.rows;
  const flagged = new Set(b.followUps.map((f) => f.index));

  // 一筆都沒有：說明這一頁是做什麼的
  $("progress-empty").hidden = rows.length > 0;
  $("board").hidden = rows.length === 0;
  $("closed").hidden = rows.length === 0;

  // 該追蹤了
  const fl = $("follow-list");
  fl.replaceChildren(
    ...b.followUps.map((f) => {
      const row = rows.find((r) => r._index === f.index);
      return h("li", {}, h("button", { type: "button", onclick: () => row && openEdit(row) }, `${f.company} ${f.role}`), `${T.followSep}${f.message}`);
    }),
  );
  $("follow").hidden = b.followUps.length === 0;

  const known = new Set([...ACTIVE, ...CLOSED]);
  const odd = [...new Set(rows.map((r) => (r.status || "").trim()).filter((s) => !known.has(s)))];
  const active = [...ACTIVE, ...odd];
  const main = $("board");
  main.style.setProperty("--cols", String(active.length));
  main.replaceChildren(...active.map((c) => column(c, rows, flagged)));

  // 下排用和上排一樣的欄寬，三欄對齊上排的前三欄
  const closedEl = $("board-closed");
  closedEl.style.setProperty("--cols", String(Math.max(active.length, CLOSED.length)));
  closedEl.replaceChildren(...CLOSED.map((c) => column(c, rows, flagged)));
  $("closed-count").textContent = String(rows.filter((r) => CLOSED.includes((r.status || "").trim())).length);
}

function savedMessage(row, changes) {
  if (changes.status && CLOSED.includes(changes.status)) {
    $("closed").open = true;
    return T.movedToClosed(label(changes.status), row.company, row.role);
  }
  return T.saved(row.company, row.role);
}

async function save(row, changes) {
  try {
    const b = await api("POST", "/api/applications/update", { index: row._index, job_id: row.job_id, version: board.version, changes });
    render(b);
    notice(savedMessage(row, changes));
    return true;
  } catch (e) {
    if (e.data && e.data.board) render(e.data.board);
    else if (e.status === 409) loadBoard();
    fail(e);
    return false;
  }
}

// ---- 新增
$("add-open").addEventListener("click", () => {
  $("add-form").hidden = false;
  $("add-form").elements.company.focus();
});
$("add-cancel").addEventListener("click", () => {
  $("add-form").reset();
  $("add-form").hidden = true;
});
$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    const b = await api("POST", "/api/applications/add", {
      company: f.company.value, role: f.role.value, link: fixLink(f.link.value), version: board && board.version,
    });
    notice(T.added(f.company.value.trim(), f.role.value.trim(), board ? label("todo") : T.todoName));
    e.target.reset();
    e.target.hidden = true;
    render(b);
  } catch (err) {
    if (err.data && err.data.board) render(err.data.board);
    fail(err);
  }
});

// ---- 修改視窗
let editing = null;
const FIELDS = ["company", "role", "status", "applied_date", "next_action", "next_action_date", "notes", "link"];

function openEdit(row) {
  editing = row;
  const f = $("edit-form").elements;
  $("edit-title").textContent = T.editTitle(row.company, row.role);
  const sel = $("edit-status");
  sel.replaceChildren(...statusSelect(row.status, () => {}).children);
  for (const k of FIELDS) if (f[k]) f[k].value = row[k] || "";
  $("edit-error").hidden = true;
  $("edit-save").disabled = false;
  $("edit-delete").hidden = !row._deletable;
  $("edit-nodelete").hidden = row._deletable;
  $("edit").showModal();
}

$("edit-cancel").addEventListener("click", () => $("edit").close());

$("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editing) return;
  const f = e.target.elements;
  f.link.value = fixLink(f.link.value);
  const changes = {};
  for (const k of FIELDS) if (f[k] && f[k].value !== (editing[k] || "")) changes[k] = f[k].value;
  if (!Object.keys(changes).length) return $("edit").close();
  try {
    const b = await api("POST", "/api/applications/update", { index: editing._index, job_id: editing.job_id, version: board.version, changes });
    $("edit").close();
    render(b);
    notice(savedMessage({ company: f.company.value.trim(), role: f.role.value.trim() }, changes));
  } catch (err) {
    // The window stays open with what was typed: nothing the user entered is thrown away.
    let msg = err.message;
    if (err.data && err.data.board) {
      render(err.data.board);
      const fresh = findRow(err.data.board, editing);
      if (fresh) {
        editing = fresh; // the next save compares with the file as it is now
        msg = T.editKept(err.message);
      } else {
        msg = T.rowGoneInEdit;
        $("edit-save").disabled = true;
      }
    }
    $("edit-error").textContent = msg;
    $("edit-error").hidden = false;
  }
});

/** The same row in a newer board: same job id (or, without one, same place and company). */
function findRow(b, row) {
  if (row.job_id) {
    const hits = b.rows.filter((r) => r.job_id === row.job_id);
    return hits.length === 1 ? hits[0] : null;
  }
  const r = b.rows[row._index];
  return r && r.company === row.company && r.role === row.role ? r : null;
}

$("edit-delete").addEventListener("click", async () => {
  if (!editing) return;
  if (!confirm(T.confirmDelete(editing.company, editing.role))) return;
  try {
    const b = await api("POST", "/api/applications/delete", { index: editing._index, job_id: editing.job_id, version: board.version });
    $("edit").close();
    render(b);
    notice(T.deleted(editing.company, editing.role));
  } catch (err) {
    if (err.data && err.data.board) render(err.data.board);
    $("edit").close();
    fail(err);
  }
});

// ---- 檢查結果（履歷和 104 兩頁共用；每次打開分頁或按「重新檢查」都重新檢查一次）
const fmt = (n) => Number(n).toLocaleString("en-US");

function stamp(r) {
  return T.stamp(r.checkedAt);
}

function pill(problems) {
  return problems.length
    ? h("span", { class: "pill bad" }, T.problemCount(problems.length))
    : h("span", { class: "pill ok" }, T.passed);
}

/** The checker names files by their role; on the resume page the user sees these words instead. */
function plainWhere(where) {
  if (where.startsWith(T.whereResume)) return T.plainResume;
  if (where.startsWith(T.whereTargets)) return where.replace(T.whereTargets, T.plainTargets);
  if (where.startsWith(T.whereData)) return T.plainData;
  return where;
}

function problemList(problems, { where = (w) => w } = {}) {
  return h(
    "ol",
    { class: "problems" },
    problems.map((p) => {
      const w = where(p.where);
      return h("li", {}, w ? h("span", { class: "where" }, T.whereLabel(w)) : null, T.messageEnd(p.message), p.quote ? h("q", {}, p.quote) : null);
    }),
  );
}

/** 「跟 AI 說『…』」 with the words to say set apart, so they read as something to copy. */
function sayToAi(words, after) {
  return h("p", { class: "next-step" }, T.tellAi, h("strong", { class: "say" }, T.sayQuoted(words)), after);
}

async function runCheck(button, render, at, also) {
  button.disabled = true;
  button.textContent = T.checking;
  if (at) at.textContent = T.checking;
  try {
    const [r] = await Promise.all([api("GET", "/api/check"), also ? also() : null]);
    render(r);
    loaded();
  } catch (e) {
    fail(e);
    if (at) at.textContent = "";
  } finally {
    button.disabled = false;
    button.textContent = T.recheck;
  }
}

// ---- 履歷
let selectedResume = null;

let resumeExtra = { drafts: [], items: {} };

function loadResumes() {
  return runCheck($("recheck-resumes"), renderResumes, $("at-resumes"), async () => {
    resumeExtra = (await api("GET", "/api/resume-info").catch(() => null)) || { drafts: [], items: {} };
  });
}
$("recheck-resumes").addEventListener("click", () => {
  hideNotice();
  loadResumes();
});

function renderResumes(r) {
  $("at-resumes").textContent = stamp(r);
  const items = r.items.filter((i) => i.hasTarget || i.hasHtml);
  $("resumes-empty").hidden = items.length > 0;
  $("resumes").hidden = items.length === 0;
  if (!items.some((i) => i.id === selectedResume)) selectedResume = items.length ? items[0].id : null;
  $("resume-list").replaceChildren(
    ...items.map((i) =>
      h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: "pick",
            "aria-current": i.id === selectedResume ? "true" : null,
            onclick: () => {
              selectedResume = i.id;
              renderResumes(r);
            },
          },
          h("span", { class: "company" }, i.company || T.noCompanyShort),
          h("span", { class: "role" }, i.role || ""),
          h("span", { class: "meta" }, i.updated ? T.updated(i.updated) : ""),
          h("span", { class: "pills" }, pill(i.resumeProblems), ...waitingPills(i)),
        ),
      ),
    ),
  );
  const item = items.find((i) => i.id === selectedResume);
  $("resume-detail").replaceChildren(...(item ? resumeDetail(item) : []).filter(Boolean));
}

/** 「未確認 N 段」（還是草稿的經歷，每份履歷都一樣）、「待回答 N 題」（這份履歷還沒問的題目）. */
function waitingPills(item) {
  const out = [];
  const drafts = resumeExtra.drafts.length;
  const extra = resumeExtra.items[item.id];
  if (drafts) out.push(h("span", { class: "pill wait" }, T.pillUnconfirmed(drafts)));
  if (extra && extra.confirm) out.push(h("span", { class: "pill wait" }, T.pillToAnswer(extra.confirm)));
  return out;
}

function waitingNote(item) {
  const drafts = resumeExtra.drafts;
  const extra = resumeExtra.items[item.id];
  const lines = [];
  if (drafts.length) {
    const names = drafts.map((d) => d.title || d.id).join(T.nameSep);
    lines.push(h("p", {}, h("strong", {}, T.unconfirmedHead(drafts.length)), names, T.unconfirmedTail));
  }
  if (extra && extra.confirm) lines.push(h("p", {}, h("strong", {}, T.unansweredHead(extra.confirm)), T.unansweredTail));
  if (!lines.length) return null;
  return h(
    "div",
    { class: "result wait" },
    ...lines,
    sayToAi(drafts.length ? T.sayConfirmDrafts : T.sayAnswerQs, T.afterWaiting),
  );
}

/** Each reworded sentence against the confirmed one, one character at a time. Read only. */
function rewritesView(item) {
  const extra = resumeExtra.items[item.id];
  if (!extra || !extra.rewrites.length) return null;
  const row = (rw) =>
    h(
      "li",
      {},
      rw.before == null
        ? h("p", { class: "hint" }, T.origMissing)
        : h("p", { class: "orig" }, h("span", { class: "tag" }, T.tagOriginal), rw.before),
      h(
        "p",
        { class: "diff" },
        h("span", { class: "tag" }, T.tagThisResume),
        rw.parts.map((p) => (p.t === "add" ? h("ins", {}, p.s) : p.t === "del" ? h("del", {}, p.s) : p.s)),
      ),
    );
  return h(
    "details",
    { class: "rewrites", open: true },
    h("summary", {}, T.rewritesSummary(extra.rewrites.length)),
    h("p", { class: "hint" }, T.rewritesHint),
    h("ol", {}, extra.rewrites.map(row)),
  );
}

// ---- 「我投了這份，存一份」：先看會存成什麼，確定才存，不會蓋掉
function archiveArea(item) {
  if (!item.hasHtml) return null;
  const extra = resumeExtra.items[item.id];
  const saved = extra ? extra.saved : [];
  const box = h("div", { class: "archive-box", hidden: true });
  const btn = h("button", { type: "button", onclick: () => previewArchive(item, btn, box) }, T.saveCopyBtn);
  return h(
    "div",
    { class: "archive" },
    h("div", { class: "row" }, btn, h("span", { class: "hint" }, T.saveCopyHint)),
    saved.length ? h("p", { class: "hint" }, T.alreadySaved(saved.join(T.listSep))) : null,
    box,
  );
}

async function previewArchive(item, btn, box) {
  btn.disabled = true;
  try {
    const p = await api("POST", "/api/archive/preview", { id: item.id });
    const name = p.to.replace(/^submitted\//, "");
    const blocked = p.already || p.exists;
    const parts = [];
    if (p.already) parts.push(h("p", {}, h("strong", {}, T.hasCopyHead), T.hasCopyTail(p.already)));
    else if (p.exists) parts.push(h("p", {}, h("strong", {}, T.savedTodayHead), T.savedTodayTail(name)));
    else {
      parts.push(
        h("p", {}, T.willCopy, h("strong", {}, name)),
        h("p", {}, T.willRecord(p.company, p.role)),
      );
      if (item.resumeProblems.length)
        parts.push(h("p", { class: "warn-text" }, T.unfixedWarn(item.resumeProblems.length)));
      if (p.status === "todo") parts.push(h("p", { class: "hint" }, T.willApply));
    }
    const close = () => {
      box.hidden = true;
      btn.disabled = false;
      btn.focus();
    };
    const actions = blocked
      ? [h("button", { type: "button", onclick: close }, T.gotIt)]
      : [
          h("button", { type: "button", class: "primary", onclick: (e) => doArchive(item, p, e.target, close) }, T.confirmSave),
          h("button", { type: "button", onclick: close }, T.notNow),
        ];
    box.replaceChildren(...parts, h("div", { class: "actions" }, ...actions));
    box.hidden = false;
    box.querySelector("button").focus();
  } catch (e) {
    btn.disabled = false;
    fail(e);
  }
}

async function doArchive(item, p, okBtn, close) {
  okBtn.disabled = true;
  try {
    const r = await api("POST", "/api/archive", { id: item.id, to: p.to, version: p.version });
    if (r.board) board = r.board;
    close();
    await loadResumes();
    notice(T.savedDone(r.saved.replace(/^submitted\//, "")));
  } catch (e) {
    okBtn.disabled = false;
    fail(e);
  }
}

function openPrint(item) {
  // noopener: the print tab gets no handle on this tab (it can't send it somewhere else)
  window.open(`/view/${encodeURIComponent(item.id)}?print=1`, "_blank", "noopener");
}

function pdfSteps() {
  const paper = paperName(INFO.paper);
  const [before, bold, after] = T.pdfChrome(paper);
  return h(
    "ol",
    { class: "steps" },
    h("li", {}, T.pdfOpens),
    h("li", {}, before, h("strong", {}, bold), after),
    h("li", {}, T.pdfSafari(paper)),
  );
}

function pdfArea(item, pages) {
  const n = item.resumeProblems.length;
  if (!item.hasHtml)
    return h("div", { class: "pdf" }, h("button", { type: "button", disabled: true }, T.savePdf), h("span", { class: "hint" }, T.noResumeFileYet));
  if (!n) return h("div", { class: "pdf" }, h("button", { type: "button", class: "primary", onclick: () => openPrint(item) }, T.savePdf), pages, pdfSteps());
  const box = h(
    "div",
    { class: "confirm-box", role: "alertdialog", "aria-label": T.confirmPdfAria, hidden: true },
    h("p", {}, h("strong", {}, T.confirmPdfHead(n)), T.confirmPdfTail),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "danger-solid", onclick: () => openPrint(item) }, T.savePdfAnyway),
      h("button", { type: "button", onclick: () => { box.hidden = true; btn.hidden = false; btn.focus(); } }, T.notNow),
    ),
    pdfSteps(),
  );
  // Outlined, not solid red: with problems left, the thing to do is fix them, not save.
  const btn = h(
    "button",
    { type: "button", class: "danger", onclick: () => { btn.hidden = true; box.hidden = false; box.querySelector("button").focus(); } },
    T.savePdfWithProblems(n),
  );
  return h("div", { class: "pdf" }, btn, pages, box);
}

/** The same page estimate the template makes (it can't run inside the preview): the folder's own paper and margins. */
function estimatePages(frame) {
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    const page = doc && doc.getElementById("page");
    if (!page || !page.lastElementChild || win.innerWidth <= 820) return 0;
    const top = page.getBoundingClientRect().top + parseFloat(win.getComputedStyle(page).paddingTop);
    const content = page.lastElementChild.getBoundingClientRect().bottom - top;
    return pagesFor(content, INFO.paper);
  } catch {
    return 0;
  }
}

function resumeDetail(item) {
  const n = item.resumeProblems.length;
  const head = h("h2", {}, `${item.company} ${item.role}`.trim() || T.noCompanyShort);
  const hiddenFromPreview = item.resumeProblems.some((p) => !p.where.startsWith(T.whereResume));
  const result = n
    ? h(
        "div",
        { class: "result bad", role: "alert" },
        h("strong", {}, T.resumeFailedHead(n)),
        problemList(item.resumeProblems, { where: plainWhere }),
        hiddenFromPreview ? h("p", { class: "hint" }, T.hiddenFromPreview) : null,
        sayToAi(T.sayFixResume, T.afterRecheck),
      )
    : h(
        "div",
        { class: "result ok" },
        h("strong", {}, T.okHead),
        h("p", {}, T.okBody),
      );
  // The template's photo slot belongs to the Taiwan resume: a US folder never shows this hint.
  const photo = item.photo && INFO.market !== "us" ? h("p", { class: "hint" }, T.photoHint) : null;
  const pages = h("span", { class: "pages", hidden: true });
  const preview = item.hasHtml
    ? h("iframe", {
        class: "preview",
        title: T.previewTitle,
        sandbox: "allow-same-origin",
        src: `/view/${encodeURIComponent(item.id)}?r=${Date.now()}`,
        onload: (e) => {
          const p = estimatePages(e.target);
          if (!p) return;
          pages.textContent = T.pageNote(p, INFO.market);
          pages.className = "pages" + (p > 1 ? " long" : "");
          pages.hidden = false;
        },
      })
    : h("p", { class: "blank" }, T.blankResume);
  return [head, result, waitingNote(item), pdfArea(item, pages), archiveArea(item), photo, rewritesView(item), preview];
}

// ---- 104
function load104() {
  return runCheck($("recheck-104"), render104, $("at-104"));
}
$("recheck-104").addEventListener("click", () => {
  hideNotice();
  load104();
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h("textarea", { class: "offscreen", readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

function card104(b) {
  const n = b.problems.length;
  const over = b.limit != null && b.chars > b.limit;
  const size = !b.pasted
    ? null
    : h("span", { class: "size" + (over ? " over" : "") }, b.limit != null ? T.sizeWithLimit(fmt(b.chars), fmt(b.limit)) : T.sizeNoLimit(fmt(b.chars)));
  let action;
  if (!b.pasted) action = h("p", { class: "hint" }, b.note);
  else if (n)
    // plan 10.1: a field that didn't pass can't be copied (no "copy anyway" like the PDF button has)
    action = h(
      "div",
      { class: "copy-row bad-row" },
      h("button", { type: "button", disabled: true }, T.copy),
      h("p", { class: "next-step" }, T.cantCopy),
      sayToAi(T.sayFix104, T.afterRecheck),
    );
  else {
    const btn = h(
      "button",
      {
        type: "button",
        class: "primary",
        onclick: async () => {
          if (await copyText(b.text)) {
            btn.textContent = T.copied;
            btn.classList.add("done");
            notice(T.copiedNotice(b.name));
          } else notice(T.copyFailed, true);
        },
      },
      T.copy,
    );
    action = h("div", { class: "copy-row" }, btn);
  }
  return h(
    "article",
    { class: "card104" + (n ? " bad" : "") },
    h("header", {}, h("h3", {}, b.name), size, b.pasted || n ? pill(b.problems) : null),
    h("pre", { class: "copytext" }, b.text || T.emptyText),
    // the card already says which field it is: only the message
    n ? problemList(b.problems, { where: () => "" }) : null,
    action,
  );
}

function render104(r) {
  $("at-104").textContent = stamp(r);
  const files = [];
  if (r.general) files.push({ title: T.general104, file: r.general });
  for (const i of r.items) if (i.apply) files.push({ title: T.applyTitle(i.company, i.role).trim(), file: i.apply });
  $("empty-104").hidden = files.length > 0;
  $("cards-104").replaceChildren(
    ...files.map(({ title, file }) =>
      h(
        "section",
        { class: "group104" },
        h("h2", {}, title),
        file.problems.length ? h("div", { class: "result bad" }, problemList(file.problems, { where: () => "" })) : null,
        file.blocks.length ? h("div", { class: "cards" }, file.blocks.map(card104)) : null,
      ),
    ),
  );
}

// 回到這個分頁時重新讀一次，AI 在背景改過的內容才看得到
document.addEventListener("visibilitychange", () => {
  if (document.hidden || $("edit").open || !token) return;
  const tab = currentTab();
  if (tab === "progress") loadBoard();
  else if (tab === "resumes") loadResumes();
  else if (tab === "104") load104();
});

window.addEventListener("hashchange", showTab);
// Ask the folder which country it is for (hides the 104 tab for the US, picks the paper) before the first page loads.
folderInfo().then((info) => {
  if (info && (info.market === "us" || info.market === "tw")) INFO = { market: info.market, paper: info.paper === "letter" ? "letter" : "a4" };
  for (const a of document.querySelectorAll('.tabs a[data-tab="104"]')) a.hidden = INFO.market === "us";
  showTab();
  if (token) checkUpdate();
});
