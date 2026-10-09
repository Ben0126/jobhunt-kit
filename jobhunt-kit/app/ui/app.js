// 求職小幫手：畫面程式（不需要任何外部套件）。
"use strict";

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
    throw new ApiError("連不到程式。程式的視窗是不是被關掉了？請再點兩下程式打開。", 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new ApiError((data && data.error) || "出了點問題，請再試一次。", res.status, data);
  return data;
}

// ---- 提示訊息：綠的 4 秒後自己消失；紅的要按「知道了」，換分頁時也會收起來
let noticeTimer;
let noticeKind = "";
function notice(msg, bad = false, kind = "") {
  const el = $("notice");
  // replaceChildren would print a null child as the text "null": only real nodes go in
  const parts = [h("span", { class: "msg" }, msg)];
  if (bad) parts.push(h("button", { type: "button", class: "close", onclick: () => hideNotice() }, "知道了"));
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

// ---- 分頁
function showTab() {
  const tab = token ? (location.hash.replace("#", "") || "progress") : "nokey";
  const known = ["progress", "resumes", "104", "nokey"].includes(tab) ? tab : "progress";
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
  return s ? s.label : code ? `看不懂的狀態「${code}」` : "還沒填狀態";
}

function shortDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  const [y, m, d] = s.split("-").map(Number);
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
      $("folder").textContent = `資料夾：${parts[parts.length - 1] || info.folder}`;
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
  const sel = h("select", { "aria-label": "狀態", onchange: (e) => onChange(e.target.value) });
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
        `下一步：${row.next_action || ""}`,
        row.next_action_date ? h("span", { class: "date" }, shortDate(row.next_action_date)) : null,
      ),
    );
  if (row.applied_date) meta.push(h("div", { class: "meta" }, `投遞：${shortDate(row.applied_date)}`));
  if (row.notes) meta.push(h("div", { class: "meta" }, row.notes));
  const link = safeLink(row.link);
  return h(
    "article",
    { class: "card" + (flagged ? " flag" : "") },
    h(
      "button",
      { type: "button", class: "open", title: "點一下修改", onclick: () => openEdit(row) },
      h("span", { class: "company" }, row.company || "（沒有公司名稱）"),
      h("span", { class: "role" }, row.role || ""),
      meta,
    ),
    h(
      "div",
      { class: "row" },
      statusSelect(row.status, (v) => save(row, { status: v })),
      link && h("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, "看職缺"),
    ),
  );
}

function column(code, rows, flagged) {
  const list = rows.filter((r) => (r.status || "").trim() === code);
  return h(
    "section",
    { class: "col", "aria-label": label(code) },
    h("h3", {}, label(code), h("span", { class: "count" }, String(list.length))),
    list.length ? list.map((r) => card(r, flagged.has(r._index))) : h("p", { class: "empty" }, "沒有"),
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
      return h("li", {}, h("button", { type: "button", onclick: () => row && openEdit(row) }, `${f.company} ${f.role}`), `：${f.message}`);
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
    return `已改成「${label(changes.status)}」：${row.company} ${row.role} 移到下面「已結束」那一區。`;
  }
  return `已存檔：${row.company} ${row.role}`;
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
    notice(`已新增：${f.company.value.trim()} ${f.role.value.trim()}（放在「待投遞」）`);
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
  $("edit-title").textContent = `修改：${row.company} ${row.role}`;
  const sel = $("edit-status");
  sel.replaceChildren(...statusSelect(row.status, () => {}).children);
  for (const k of FIELDS) if (f[k]) f[k].value = row[k] || "";
  $("edit-error").hidden = true;
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
    if (err.data && err.data.board) {
      render(err.data.board);
      $("edit").close();
      fail(err);
    } else {
      $("edit-error").textContent = err.message;
      $("edit-error").hidden = false;
    }
  }
});

$("edit-delete").addEventListener("click", async () => {
  if (!editing) return;
  if (!confirm(`確定要刪掉「${editing.company} ${editing.role}」這一筆嗎？刪掉就找不回來了。\n\n只是不想投了，可以按「取消」，把狀態改成「放棄」。`)) return;
  try {
    const b = await api("POST", "/api/applications/delete", { index: editing._index, job_id: editing.job_id, version: board.version });
    $("edit").close();
    render(b);
    notice(`已刪除：${editing.company} ${editing.role}`);
  } catch (err) {
    if (err.data && err.data.board) render(err.data.board);
    $("edit").close();
    fail(err);
  }
});

// ---- 檢查結果（履歷和 104 兩頁共用；每次打開分頁或按「重新檢查」都重新檢查一次）
const fmt = (n) => Number(n).toLocaleString("en-US");

function stamp(r) {
  return `檢查時間：${r.checkedAt.slice(5).replace("-", "/")}`;
}

function pill(problems) {
  return problems.length
    ? h("span", { class: "pill bad" }, `${problems.length} 個問題`)
    : h("span", { class: "pill ok" }, "通過");
}

/** The checker names files by their role; on the resume page the user sees these words instead. */
function plainWhere(where) {
  if (where.startsWith("履歷檔")) return "下面這份履歷";
  if (where.startsWith("客製履歷")) return where.replace(/^客製履歷/, "AI 準備的內容");
  if (where.startsWith("履歷資料")) return "你確認過的經歷資料";
  return where;
}

function problemList(problems, { where = (w) => w } = {}) {
  return h(
    "ol",
    { class: "problems" },
    problems.map((p) => {
      const w = where(p.where);
      return h("li", {}, w ? h("span", { class: "where" }, `${w}：`) : null, `${p.message}。`, p.quote ? h("q", {}, p.quote) : null);
    }),
  );
}

/** 「跟 AI 說『…』」 with the words to say set apart, so they read as something to copy. */
function sayToAi(words, after) {
  return h("p", { class: "next-step" }, "請跟 AI 說", h("strong", { class: "say" }, `「${words}」`), after);
}

async function runCheck(button, render, at) {
  button.disabled = true;
  button.textContent = "檢查中…";
  if (at) at.textContent = "檢查中…";
  try {
    render(await api("GET", "/api/check"));
    loaded();
  } catch (e) {
    fail(e);
    if (at) at.textContent = "";
  } finally {
    button.disabled = false;
    button.textContent = "重新檢查";
  }
}

// ---- 履歷
let selectedResume = null;

function loadResumes() {
  return runCheck($("recheck-resumes"), renderResumes, $("at-resumes"));
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
          h("span", { class: "company" }, i.company || "（沒寫公司）"),
          h("span", { class: "role" }, i.role || ""),
          h("span", { class: "meta" }, i.updated ? `更新：${i.updated.slice(5).replace("-", "/")}` : ""),
          pill(i.resumeProblems),
        ),
      ),
    ),
  );
  const item = items.find((i) => i.id === selectedResume);
  $("resume-detail").replaceChildren(...(item ? resumeDetail(item) : []).filter(Boolean));
}

function openPrint(item) {
  // noopener: the print tab gets no handle on this tab (it can't send it somewhere else)
  window.open(`/view/${encodeURIComponent(item.id)}?print=1`, "_blank", "noopener");
}

function pdfSteps() {
  return h(
    "ol",
    { class: "steps" },
    h("li", {}, "會打開新分頁和列印視窗。"),
    h("li", {}, "Chrome、Edge：目的地選「另存為 PDF」→ 紙張選「A4」→ 按「更多設定」，", h("strong", {}, "取消勾選「頁首和頁尾」"), "→ 儲存。"),
    h("li", {}, "Mac 的 Safari：按左下角「PDF」→「儲存為 PDF」。"),
  );
}

function pdfArea(item, pages) {
  const n = item.resumeProblems.length;
  if (!item.hasHtml)
    return h("div", { class: "pdf" }, h("button", { type: "button", disabled: true }, "存成 PDF"), h("span", { class: "hint" }, "還沒有履歷檔，所以還不能存。"));
  if (!n) return h("div", { class: "pdf" }, h("button", { type: "button", class: "primary", onclick: () => openPrint(item) }, "存成 PDF"), pages, pdfSteps());
  const box = h(
    "div",
    { class: "confirm-box", role: "alertdialog", "aria-label": "確定要存成 PDF 嗎", hidden: true },
    h("p", {}, h("strong", {}, `確定要存？這份履歷還有 ${n} 個問題（上面紅色那幾項）。`), "投出去，公司看到的就是這個版本，面試時也可能被問到。"),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "danger-solid", onclick: () => openPrint(item) }, "我知道，仍要存成 PDF"),
      h("button", { type: "button", onclick: () => { box.hidden = true; btn.hidden = false; btn.focus(); } }, "先不要"),
    ),
    pdfSteps(),
  );
  // Outlined, not solid red: with problems left, the thing to do is fix them, not save.
  const btn = h(
    "button",
    { type: "button", class: "danger", onclick: () => { btn.hidden = true; box.hidden = false; box.querySelector("button").focus(); } },
    `存成 PDF（還有 ${n} 個問題）`,
  );
  return h("div", { class: "pdf" }, btn, pages, box);
}

/** The same page estimate the template makes (it can't run inside the preview): A4, 15 mm margins. */
function estimatePages(frame) {
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    const page = doc && doc.getElementById("page");
    if (!page || !page.lastElementChild || win.innerWidth <= 820) return 0;
    const usable = ((297 - 15 * 2) * 96) / 25.4;
    const top = page.getBoundingClientRect().top + parseFloat(win.getComputedStyle(page).paddingTop);
    const content = page.lastElementChild.getBoundingClientRect().bottom - top;
    return Math.max(1, Math.ceil(content / usable - 0.02));
  } catch {
    return 0;
  }
}

function resumeDetail(item) {
  const n = item.resumeProblems.length;
  const head = h("h2", {}, `${item.company} ${item.role}`.trim() || "（沒寫公司）");
  const hiddenFromPreview = item.resumeProblems.some((p) => !p.where.startsWith("履歷檔"));
  const result = n
    ? h(
        "div",
        { class: "result bad", role: "alert" },
        h("strong", {}, `這份履歷還沒通過檢查：${n} 個問題`),
        problemList(item.resumeProblems, { where: plainWhere }),
        hiddenFromPreview
          ? h("p", { class: "hint" }, "標著「AI 準備的內容」或「你確認過的經歷資料」的問題，在下面的履歷上不一定看得到，那是 AI 那邊的資料。")
          : null,
        sayToAi("幫我修這份履歷的問題", "，改好之後按「重新檢查」。"),
      )
    : h(
        "div",
        { class: "result ok" },
        h("strong", {}, "程式檢查通過"),
        h("p", {}, "數字、日期、用詞、句子長度、佔位字和來源都沒問題。意思和職稱有沒有寫得比實際大，還是要你自己讀一次。"),
      );
  const photo = item.photo
    ? h("p", { class: "hint" }, "這份設定要放照片。從這裡存的 PDF 不會有照片；要放照片，請照「開始使用」裡的方法自己存。")
    : null;
  const pages = h("span", { class: "pages", hidden: true });
  const preview = item.hasHtml
    ? h("iframe", {
        class: "preview",
        title: "履歷預覽",
        sandbox: "allow-same-origin",
        src: `/view/${encodeURIComponent(item.id)}?r=${Date.now()}`,
        onload: (e) => {
          const p = estimatePages(e.target);
          if (!p) return;
          pages.textContent = p > 2 ? `估計會印成 ${p} 頁，重點盡量放在第一頁。` : `估計會印成 ${p} 頁。`;
          pages.className = "pages" + (p > 2 ? " long" : "");
          pages.hidden = false;
        },
      })
    : h("p", { class: "blank" }, "還沒有履歷檔。跟 AI 說「做成履歷檔」，做好之後按「重新檢查」。");
  return [head, result, pdfArea(item, pages), photo, preview];
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
    : h("span", { class: "size" + (over ? " over" : "") }, b.limit != null ? `${fmt(b.chars)} / ${fmt(b.limit)} 字` : `${fmt(b.chars)} 字（上限以 104 畫面為準）`);
  let action;
  if (!b.pasted) action = h("p", { class: "hint" }, b.note);
  else if (n)
    // plan 10.1: a field that didn't pass can't be copied (no "copy anyway" like the PDF button has)
    action = h(
      "div",
      { class: "copy-row bad-row" },
      h("button", { type: "button", disabled: true }, "複製"),
      h("p", { class: "next-step" }, "為了不讓沒根據的內容送到公司，有問題的欄位先不能複製。"),
      sayToAi("幫我修 104 的問題", "，改好之後按「重新檢查」。"),
    );
  else {
    const btn = h(
      "button",
      {
        type: "button",
        class: "primary",
        onclick: async () => {
          if (await copyText(b.text)) {
            btn.textContent = "已複製 ✓";
            btn.classList.add("done");
            notice(`已複製「${b.name}」，到 104 貼上就好。`);
          } else notice("沒辦法自動複製。請自己選取上面的文字，按 Ctrl+C（Mac 按 ⌘+C）。", true);
        },
      },
      "複製",
    );
    action = h("div", { class: "copy-row" }, btn);
  }
  return h(
    "article",
    { class: "card104" + (n ? " bad" : "") },
    h("header", {}, h("h3", {}, b.name), size, b.pasted || n ? pill(b.problems) : null),
    h("pre", { class: "copytext" }, b.text || "（空的）"),
    // the card already says which field it is: only the message
    n ? problemList(b.problems, { where: () => "" }) : null,
    action,
  );
}

function render104(r) {
  $("at-104").textContent = stamp(r);
  const files = [];
  if (r.general) files.push({ title: "104 總履歷", file: r.general });
  for (const i of r.items) if (i.apply) files.push({ title: `應徵 ${i.company} ${i.role}`.trim(), file: i.apply });
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
  const tab = location.hash.replace("#", "") || "progress";
  if (tab === "progress") loadBoard();
  else if (tab === "resumes") loadResumes();
  else if (tab === "104") load104();
});

window.addEventListener("hashchange", showTab);
showTab();
