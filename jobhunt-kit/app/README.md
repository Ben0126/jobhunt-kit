# 求職小幫手（本機程式）

放在求職資料夾裡的單一執行檔。點兩下會在 `127.0.0.1` 開一個小伺服器並打開瀏覽器；`jobhunt check [職缺代號 ...] [--104] [--all]` 是命令列的程式檢查（給 AI 照 AGENTS.md 呼叫）。規格見 `../docs/plan-v1-local-app.zh-TW.md` 第 10 節。

## 開發

```
bun src/main.ts --dir ../jobhunt/scaffold/workspace-general   # 開介面（加 --no-open 不開瀏覽器）
bun src/main.ts check --dir <求職資料夾> [代號 ...] [--104]      # 程式檢查（結束碼：0 通過、1 有問題、2 用法或資料夾不對）
bun test                                                     # 單元測試
bun build.ts                                                 # 打包這台電腦的版本到 dist/
bun build.ts --target win|mac-arm64|mac-x64|all
bun tests/smoke.ts dist/jobhunt.exe [測試資料夾]               # 對打包好的執行檔跑冒煙測試
```

不需要 `bun install`，沒有外部套件。網頁檔案（`ui/`）用 `import ... with { type: "text" }` 包進執行檔。

## 安全與資料規則

- 只聽 `127.0.0.1`，隨機埠。每次啟動產生通行碼，放在打開的網址（`?t=`），畫面存在 sessionStorage 後從網址拿掉；每個 `/api` 請求都要帶 `x-jobhunt-token`。
- Host 必須是 `127.0.0.1:<埠>` 或 `localhost:<埠>`；有 Origin 就必須是自己；跨站請求拒絕。
- 只讀寫白名單（`src/folder.ts`）：寫入只有 `data/applications.csv` 和 `checks/*.md`（先寫暫存檔再改名）。另外「我投了這份，存一份」可以把 `resumes/<代號>.html` 複製成 `submitted/<YYYY-MM-DD>_<代號>.html`：只能從 `resumes/*.html` 複製、只能是新檔（`COPYFILE_EXCL`，已經有就拒絕），一般的寫入碰不到 `submitted/`。`checks/*.md` 只換「## 程式檢查」那一節（`src/checksfile.ts`），AI 寫的其他節不動；只有命令列的 check 會寫，介面上的檢查只讀不寫。
- 履歷預覽和列印（`/view/<代號>`）：要有呼叫過 API 後拿到的 HttpOnly cookie（另一組只給預覽用的隨機值，不是 API 通行碼）；送出前拿掉檔案裡的 `<script>`（拆到乾淨為止）、`on…=` 屬性和 `<meta http-equiv>`，CSP 只允許程式自己加的列印程式（nonce）。所有頁面帶 `Cross-Origin-Opener-Policy: same-origin`，列印分頁用 `noopener` 打開。另外程式自己用 `.jobhunt/app.lock`（埠和通行碼）做「只開一份」。
- 進度表保留原本的標題列順序、不認得的欄位、BOM 和換行格式；缺的欄位只在需要寫值時加在最後。寫入前比對檔案版本，AI 在背景改過就拒絕並請使用者重來，不會蓋掉。

## 測試資料夾

`tests/fixture/` 是模擬使用者的求職資料夾（虛構資料）。測試一律先複製到暫存資料夾再用。

## 程式檢查（`src/check.ts`）

規則全部來自 `../web/js/core/rules.js`（`checkTarget`、`checkText`、`countChars`），和網頁版、Python 版用同一套共用測試案例。

- `targets/<id>.yaml`：結構（重點代號、版本）、自我介紹／專長／改寫的重點／應徵問答逐欄 `checkText`、會印出的重點都要有已確認的來源。
- `resumes/<id>.html`：每個區塊元素上看得到的字逐行 `checkText`（不含註解、`<title>`、程式、樣式、黃色列印提醒 `.print-tip`），加上屬性裡剩下的 `{{`。每一行還要能由客製履歷排出來的內容（`R.tailor` + `R.resolve`）和**這份用的範本**本身的字組成，對不上就擋。用哪個範本：履歷檔的 `<style>` 和某個範本一字不差就是它；認不出來就照 `targets/<id>.yaml` 的 `template`（`tw` 深色抬頭、`tw-classic` 精緻單欄、`en` 英文版），沒寫就照語言。每個範本只認自己的字和自己的 `<script>`。`src/legacy/` 放 2026-10-08 版的範本（只有頁數提醒的程式不同），用舊範本做的履歷檔照樣通過。範本沒有的寫法（`<button>`、`<svg>`、`<input>`、多出來的 `<script>`、CSS `content:` 文字、`<!-->` 這類註解）一律擋。
- 日期：文字裡的「年-月」必須是 `resume.yaml` 裡有的，年份要在 `resume.yaml` 裡或是今年、明年；「連續 6 月」這類月數當成數字。
- 草稿或已刪除經歷的名稱（`me/stories` 的 `org`、`title`）出現在文字裡就擋；104 段落來源只有「學歷／求職方向」卻寫到 `resume.yaml` 的工作經歷也擋。
- `skills_order` 每一項都要是 `resume.yaml` `skills` 裡的一項，那一行的來源要已確認。
- `104/履歷欄位.md`、`jobs/<id>/104-apply.md`：照 `playbooks/fill-104.md` 的格式切成一欄一張卡（`src/blocks104.ts`），複製的文字不含來源行；每段要有來源行、來源要是已確認的經歷；字數上限用檔案裡的「上限」，沒寫就用 104 公布的表。下拉選單、建議留空、自己填的欄位只查數字和身分證字號，不能複製。

## 進度看板的提醒（`src/applications.ts`，和業主自己的系統一致）

- 「已投遞」10 天以上沒更新：提醒問進度；28 天以上：「可能石沉大海」，建議改成「無回應」。不需要填聯絡人。
- 「面試中」約好的日期已過；「待投遞」的截止日（下一步日期）是今天或已經過了。
- 只有狀態改變才重設最後更新日（`last_update`）。補備註、改日期都不會讓「幾天沒消息」從頭算。

## 履歷頁

- 每份履歷旁邊顯示「未確認 N 段」（`me/stories` 裡 `status: draft` 的經歷）和「待回答 N 題」（`targets/<代號>.yaml` 的 `confirm`）。
- 「AI 改寫的句子」：每一條 `bullet_overrides` 和 `resume.yaml` 已確認的原句一個字一個字比（加的字綠底、拿掉的字刪除線），只能看。
- 估計頁數：台灣的履歷以 1 頁為目標，超過 1 頁就提醒，但不擋「存成 PDF」。
- 「我投了這份，存一份」：先顯示會存成哪個檔、記在進度表哪一筆，按「確定」才存；同時在進度表那一筆記 `resume_file`；那一筆還是「待投遞」就一起改成「已投遞」並記投遞日（已經在後面階段的不動）。那一筆已經記過、或今天已經存過，就拒絕，不覆蓋。存過的那一筆不能刪。
- `GET /api/resume-info`、`POST /api/archive/preview`、`POST /api/archive`。

## 畫面流程測試

`python tests/ui_flow.py`（在 `app/` 的上一層執行也可以；要有 `pip install playwright` 和 Chrome）：修改視窗存檔失敗時打的字要留著、履歷頁的徽章和逐字對照、超過 1 頁的提醒、「存一份」的完整流程。

`python tests/template_pages.py`（同上，要有 Playwright 和 Chrome）：三個履歷範本在一般新鮮人的份量下印成 1 頁 A4、黃色提醒不出現；一次多加一條重點，每一步「PDF 超過 1 頁」都要和「黃色提醒出現」一致。
