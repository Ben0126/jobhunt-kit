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
- 只讀寫白名單（`src/folder.ts`）：寫入只有 `data/applications.csv` 和 `checks/*.md`（先寫暫存檔再改名）。`checks/*.md` 只換「## 程式檢查」那一節（`src/checksfile.ts`），AI 寫的其他節不動；只有命令列的 check 會寫，介面上的檢查只讀不寫。
- 履歷預覽和列印（`/view/<代號>`）：要有呼叫過 API 後拿到的 HttpOnly cookie（另一組只給預覽用的隨機值，不是 API 通行碼）；送出前拿掉檔案裡的 `<script>`（拆到乾淨為止）、`on…=` 屬性和 `<meta http-equiv>`，CSP 只允許程式自己加的列印程式（nonce）。所有頁面帶 `Cross-Origin-Opener-Policy: same-origin`，列印分頁用 `noopener` 打開。另外程式自己用 `.jobhunt/app.lock`（埠和通行碼）做「只開一份」。
- 進度表保留原本的標題列順序、不認得的欄位、BOM 和換行格式；缺的欄位只在需要寫值時加在最後。寫入前比對檔案版本，AI 在背景改過就拒絕並請使用者重來，不會蓋掉。

## 測試資料夾

`tests/fixture/` 是模擬使用者的求職資料夾（虛構資料）。測試一律先複製到暫存資料夾再用。

## 程式檢查（`src/check.ts`）

規則全部來自 `../web/js/core/rules.js`（`checkTarget`、`checkText`、`countChars`），和網頁版、Python 版用同一套共用測試案例。

- `targets/<id>.yaml`：結構（重點代號、版本）、自我介紹／專長／改寫的重點／應徵問答逐欄 `checkText`、會印出的重點都要有已確認的來源。
- `resumes/<id>.html`：每個區塊元素上看得到的字逐行 `checkText`（不含註解、`<title>`、程式、樣式、黃色列印提醒 `.print-tip`），加上屬性裡剩下的 `{{`。每一行還要能由客製履歷排出來的內容（`R.tailor` + `R.resolve`）和範本本身的字組成，對不上就擋。範本沒有的寫法（`<button>`、`<svg>`、`<input>`、多出來的 `<script>`、CSS `content:` 文字、`<!-->` 這類註解）一律擋。
- 日期：文字裡的「年-月」必須是 `resume.yaml` 裡有的，年份要在 `resume.yaml` 裡或是今年、明年；「連續 6 月」這類月數當成數字。
- 草稿或已刪除經歷的名稱（`me/stories` 的 `org`、`title`）出現在文字裡就擋；104 段落來源只有「學歷／求職方向」卻寫到 `resume.yaml` 的工作經歷也擋。
- `skills_order` 每一項都要是 `resume.yaml` `skills` 裡的一項，那一行的來源要已確認。
- `104/履歷欄位.md`、`jobs/<id>/104-apply.md`：照 `playbooks/fill-104.md` 的格式切成一欄一張卡（`src/blocks104.ts`），複製的文字不含來源行；每段要有來源行、來源要是已確認的經歷；字數上限用檔案裡的「上限」，沒寫就用 104 公布的表。下拉選單、建議留空、自己填的欄位只查數字和身分證字號，不能複製。
