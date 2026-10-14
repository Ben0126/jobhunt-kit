# 求職小幫手（本機程式）

放在求職資料夾裡的單一執行檔。點兩下會在 `127.0.0.1` 開一個小伺服器並打開瀏覽器；`jobhunt check [職缺代號 ...] [--104] [--all]` 是命令列的程式檢查，`jobhunt read <檔案>` 印出 Word 舊履歷的文字，`jobhunt mode us|tw|both` 裝上選的那套 AI 規則（都給 AI 照 AGENTS.md 呼叫）。規格見 `../docs/plan-v1-local-app.zh-TW.md` 第 10 節。

## 開發

```
bun src/main.ts --dir ../jobhunt/scaffold/workspace-general   # 開介面（加 --no-open 不開瀏覽器）
bun src/main.ts check --dir <求職資料夾> [代號 ...] [--104]      # 程式檢查（結束碼：0 通過、1 有問題、2 用法或資料夾不對）
bun src/main.ts read --dir <求職資料夾> inbox/舊履歷.docx       # 印出 Word 舊履歷的文字給 AI 讀（結束碼：0 印出、2 檔案不對或讀不了）
bun test                                                     # 單元測試
bun build.ts                                                 # 打包這台電腦的版本到 dist/
bun build.ts --target win|mac-arm64|mac-x64|all
bun build.ts --version 0.8                                   # 把版本號包進程式（或環境變數 JOBHUNT_VERSION；沒給就是 dev）
jobhunt --version                                            # 印出包進去的版本號（發布版是 tag 去掉 v；本機打包是 dev）
bun tests/smoke.ts dist/jobhunt.exe [測試資料夾]               # 對打包好的執行檔跑冒煙測試
```

不需要 `bun install`，沒有外部套件。美國版的職缺清單會連到公開的 GitHub 和各公司的徵才網址（見下面「職缺清單」一節）；其他功能除了新版本提醒都不連網。網頁檔案（`ui/`）用 `import ... with { type: "text" }` 包進執行檔。

## 安全與資料規則

- 只聽 `127.0.0.1`，隨機埠。每次啟動產生通行碼，放在打開的網址（`?t=`），畫面存在 sessionStorage 後從網址拿掉；每個 `/api` 請求都要帶 `x-jobhunt-token`。
- Host 必須是 `127.0.0.1:<埠>` 或 `localhost:<埠>`；有 Origin 就必須是自己；跨站請求拒絕。
- 只讀寫白名單（`src/folder.ts`）：寫入只有 `data/applications.csv` 和 `checks/*.md`（先寫暫存檔再改名）。另外「我投了這份，存一份」可以把 `resumes/<代號>.html` 複製成 `submitted/<YYYY-MM-DD>_<代號>.html`：只能從 `resumes/*.html` 複製、只能是新檔（`COPYFILE_EXCL`，已經有就拒絕），一般的寫入碰不到 `submitted/`。`checks/*.md` 只換「## 程式檢查」那一節（`src/checksfile.ts`），AI 寫的其他節不動；只有命令列的 check 會寫，介面上的檢查只讀不寫。
- 履歷預覽和列印（`/view/<代號>`）：要有呼叫過 API 後拿到的 HttpOnly cookie（另一組只給預覽用的隨機值，不是 API 通行碼）；送出前拿掉檔案裡的 `<script>`（拆到乾淨為止）、`on…=` 屬性和 `<meta http-equiv>`，CSP 只允許程式自己加的列印程式（nonce）。所有頁面帶 `Cross-Origin-Opener-Policy: same-origin`，列印分頁用 `noopener` 打開。另外程式自己用 `.jobhunt/app.lock`（埠和通行碼）做「只開一份」。
- 進度表保留原本的標題列順序、不認得的欄位、BOM 和換行格式；缺的欄位只在需要寫值時加在最後。寫入前比對檔案版本，AI 在背景改過就拒絕並請使用者重來，不會蓋掉。

## 新版本提醒（`src/update.ts`）

只在本機介面顯示，`check`／`read` 的輸出裡沒有（AI 會讀那些）。

- 版本號在打包時包進程式（`src/version.ts`，`bun build.ts --version 0.8`，`release.yml` 傳 tag 去掉 v；沒給就是 `dev`）。**v0.6、v0.7 的程式沒有版本號**（寫死 0.1.0），所以這個提醒從下一次發布才開始有用。`dev` 版本永遠不查、不提醒。
- 預設開著。介面載好之後才問 `GET /api/update`；程式最多每 24 小時對 `https://api.github.com/repos/Ben0126/jobhunt-kit/releases/latest` 發一次 GET（沒有任何使用者資料、沒有查詢參數，User-Agent 固定是 `jobhunt-kit/<版本>`，逾時 3 秒），任何失敗都不出聲、也不再重試到隔天。草稿和 prerelease 不算。版本號用數字一段一段比（v0.10 > v0.9）。
- 關掉：`jobhunt.yaml` 寫 `update_check: false`（兩套資料夾的 jobhunt.yaml 都有註解說明）。關掉時完全不連線。
- 上次問的時間和結果存在資料夾裡的 `.jobhunt/update.json`（和 `app.lock` 同一個地方，不在 `folder.ts` 的任何白名單裡，AI 和介面都碰不到）。它只在執行時才出現，發布 zip 裡沒有。
- 橫幅給的下載連結是這個使用者自己的那一個：`assetName(種類, 系統, 晶片)` 回 `jobhunt-kit-{windows,mac-apple,mac-intel}.zip`（合一版，`jobhunt.yaml` 的 `kit_format: one-…`；舊的兩套是 `job-hunt[-us]-…zip`，v0.10 起不再發布），`programName()` 回要換的程式檔。第二階段（一鍵更新）會用同樣兩個函式，設計草稿在 `../docs/plan-update.zh-TW.md`。
- 測試一律注入假的 `fetch` 和時鐘，不碰網路（`tests/update.test.ts`）。

## 一鍵更新（`src/selfupdate.ts`）

橫幅上的「一鍵更新」按鈕，和命令列 `jobhunt update`（只列清單）／`update --yes`（真的換）／`update --undo`（退回上一版）。

- 先下載這個使用者的 zip（`assetName()`），**整包不解壓**：只取出寫死清單上的檔——程式檔（只有這台電腦用的那一個）、`AGENTS.md`／`CLAUDE.md`／`GEMINI.md`、使用說明（台灣 `開始使用.md`、`開場句.txt`；美國 `START-HERE.md`、`opening-prompt.txt`）、`playbooks/`、`templates/`、`.claude/`（`settings.local.json` 除外）。zip 裡空白的 `resume.yaml`、`data/applications.csv` 和其他使用者資料夾一律跳過。
- `jobhunt.yaml` 不整檔換：只補上新版多出來、使用者檔案裡沒有的頂層設定（連同上方註解），原本每一行都保留。
- 下載後核對 GitHub 給的 SHA256（API 的 `digest`）、檔案大小、zip 裡每個檔的 CRC；zip 裡要有程式和 `AGENTS.md`，市場要和資料夾一樣，否則整個放棄。
- 先列清單（沒變的檔不列），使用者按「確定更新」才動手。動手前把要換掉的舊檔複製到 `.jobhunt/backup/`（只留最近一次，含舊程式，約 85 MB）。任何一步失敗就從備份還原；換完要跑新程式的 `--version`，等於新版本號才算成功，不然也還原。
- Windows：正在跑的 `jobhunt.exe` 不能覆蓋，所以先改名成 `jobhunt.exe.old`，下次啟動時刪掉（`cleanupAfterUpdate`）。Mac：直接換掉並 `chmod 755`（**還沒在真的 Mac 上測過**）。
- 從介面更新完，程式會自己關掉（不然再點兩下會打開還在跑的舊程式），請使用者再點兩下打開新版。
- `JOBHUNT_UPDATE_SERVER=http://127.0.0.1:<port>`：端對端測試用的本機假 GitHub（只接受 127.0.0.1），提醒和一鍵更新都會改問它。
- 測試：`tests/selfupdate.test.ts`（換檔、還原、退回、防路徑穿越）、`tests/selfupdate_ui.test.ts`（介面 API、命令列）。

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

## 讀 Word 舊履歷（`src/docx.ts`）

`jobhunt read <檔案>`（Windows `.\jobhunt.exe read inbox\舊履歷.docx`、Mac `./jobhunt-mac-arm64 read inbox/舊履歷.docx`）：把 .docx 的文字印到畫面（UTF-8）給 AI 讀，什麼都不寫進資料夾。使用者的電腦沒有 Python，所以不用 markitdown；也不用外部套件。

- 檔案要在求職資料夾裡面（建議 `inbox/`）；相對路徑以資料夾為準，不是以目前所在的位置。捷徑（symlink、Windows junction）實際指到外面的也不讀。資料夾外面、找不到、不是求職資料夾 → 白話說明，結束碼 2。
- 編譯好的程式跑 `read`、`check` 不接受 `--dir`／`--folder`（結束碼 2）：這兩個指令在 `.claude/settings.json` 預先允許、AI 跑的時候不會跳詢問，所以只能處理程式所在的資料夾。`--dir` 只給開發（`bun src/main.ts`）和打開介面用。
- 檔案被別的程式獨佔（OneDrive 同步中、防毒、還在下載）或沒權限讀 → 白話說明，結束碼 2，不會印出程式碼。
- ZIP 自己讀（中央目錄 + `node:zlib` 的 `inflateRawSync`），有上限：整個檔案 50 MB、最多 5000 個項目、每個解開的部分 20 MB、加起來 40 MB、超過 1 MB 的部分壓縮比不能超過 200（防 zip bomb）。解壓時 `maxOutputLength` 只給宣稱的大小多 1 個位元組，宣稱很小、解開很大的檔案會直接停；大小和 CRC 對不上當成壞掉。
- 讀 `word/document.xml`（照 `_rels/.rels` 找主文件）和 `word/header*.xml`、`word/footer*.xml`（電話、Email 常放在頁首）。順序：頁首、本文、頁尾；一模一樣的頁首頁尾只印一次。
- 一段一行；`w:tab` → tab、`w:br` → 換行；表格一列一行、格子用「 ｜ 」接（空格子不印，一格兩段用空白接）；但一格有 3 段以上、或有清單又有別的段落（整頁塞在一列兩格的兩欄版型）時，那一列改成一格一格分段印、格子之間空一行，標題和清單才不會擠成一行；有編號或樣式帶編號的段落前面加「• 」；文字方塊印一次（`mc:AlternateContent` 只取 Choice，不印 Fallback 的重複內容）；追蹤修訂刪掉的字和列不印、插入的保留；在 Word 裡設成隱藏的文字（`w:vanish`）不印；XML 字元（`&amp;`、`&#x4E2D;`）還原。XML 照命名空間判斷，不看前綴。
- 身分證字號（和 `rules.js` 的 `idNumbers` 同一種樣子，全形也算）換成「[已遮住身分證字號]」，有遮才在最後印一行遮了幾個。
- .doc（舊版 Word）→ 請他另存新檔成 .docx 或 PDF；.pdf → AI 直接讀；有密碼的 .docx（其實是 CFB 檔，不是 ZIP）→ 請他拿掉密碼或另存沒密碼的；壞掉、太大 → 請他另存新檔或複製文字。都是結束碼 2。副檔名 .doc 但內容其實是 .docx 的照樣讀。
- 測試：`tests/docx.test.ts`，測試檔大多用 `tests/ziptools.ts` 現做（stored 和 deflate 都有，也能故意寫錯大小和 CRC）；`tests/fixture-docx/範例舊履歷.docx` 是用 .NET 的 `System.IO.Compression` 從手寫的 `parts/` 打包的（`make-fixture.ps1`，內容虛構），免得只測到自己寫 ZIP 的習慣。

## 下載 Word（`src/wordfile.ts`）

履歷頁「下載 Word 檔」＝ `GET /view/<代號>?format=docx`（要預覽 cookie，和列印同一套保護）。讓人自己改字、或職缺指定要 Word 時用。

- 來源是 `resumes/<代號>.html` 送出前的同一份乾淨版（`cleanResume`），所以字就是程式檢查過的那些；轉成 Word 之後使用者自己改的，沒有任何東西會再檢查（介面上有一行白話提醒）。
- 四個範本結構一樣（抬頭、`section.block`、`div.entry`），一支轉換器全吃：姓名、希望職稱、聯絡方式、段落標題（用真正的「標題 1」樣式）、日期靠右、條列、專長一行一類。字型、字級、主色從範本自己的 `<style>` 讀，紙張照 `jobhunt.yaml` 的 `paper`（A4 邊界 15 mm、Letter 0.6 in）。照片和黃色列印提醒不放（和 PDF 一致）。
- 版面用樣式（Name、Heading1、EntryHead、Bullet…）而不是逐段硬套格式，使用者在 Word 改一次樣式就整份跟著變。
- 沒有外部套件：HTML 用 `htmltext.ts` 的註解處理加一個小解析器、ZIP 自己寫（`node:zlib` 的 `deflateRawSync` ＋ CRC32）。
- 測試：`tests/word.test.ts`（含用 `docx.ts` 的讀取器把產出的檔讀回來，會驗每個部分的大小和 CRC）。在真的 Word 開過：1 頁、版面和範本一致。

## 大頭照（`src/photo.ts`）

台灣履歷的照片：履歷頁「大頭照」那一格選檔、在瀏覽器裡裁成 35×45 公釐的比例（700×900 JPEG），`POST /api/photo` 存起來。

- **存在求職資料夾外面**：程式自己的資料夾（Windows `%APPDATA%\jobhunt-kit\photos\`、Mac `~/Library/Application Support/jobhunt-kit/photos/`），檔名是「資料夾路徑的雜湊」，所以兩個人的資料夾不會共用一張。資料夾裡的東西 AI 都讀得到，所以照片不能放那裡；`folder.ts` 的寫入白名單沒有動，照片是唯一一個寫到資料夾外面的東西。AI 規則（紅線 7）照舊：不開、不描述、不生成。
- **拿掉隱藏資料**：瀏覽器裁圖重畫時 EXIF（GPS、相機、拍攝時間）就沒了，手機照片的旋轉也已經轉正；伺服器不信任這點，`cleanJpeg` 只收 JPEG，把所有 APPn 區段和註解丟掉再存（上限 2 MB），其他格式一律拒絕。
- 預覽和列印：`/view` 把範本的 `photo.jpg` 換成內嵌的圖（沒有照片就維持隱藏照片格）。Word：履歷檔有照片格才放，抬頭變成兩格的無框表格（左姓名聯絡、右照片）。履歷檔被刪掉照片格（`photo: false`）就不放，即使存過照片。
- 請求大小：傳輸層上限 4 MB，除了 `/api/photo` 其他 API 還是 64 KB（在 `api()` 裡檢查）。
- 測試：`tests/photo.test.ts`；`python tests/photo_flow.py`（Playwright）用帶 GPS 的手機式照片走完整流程。

## 預覽各版本（`src/render.ts`）

履歷頁除了「每個職缺各一份履歷檔」，還能看三種版本，都是 `/view/<代號>` 加參數：

- **通用版**（`/view/_general?variant=tw|en&template=…`）：`resume.yaml` 已確認的內容，用範本排出來，沒有針對職缺改寫、沒有自我介紹（自我介紹寫在每份客製履歷）。還沒有任何職缺也看得到。
- **換範本看看**（`/view/<代號>?template=tw|tw-classic|en|us`）：同一份客製內容（`R.resolve(R.tailor(resume, target))`，和程式檢查比對履歷檔用的是同一份資料）換範本重排。這個市場沒有的範本（台灣資料夾的 `us`、美國資料夾的 `tw`）回 404。
- **已投出的存檔**（`/view/<代號>?submitted=<檔名>.html`）：`submitted/` 裡「我投了這份，存一份」存的那份，照存下來的樣子看。檔名只收 `YYYY-MM-DD_<名稱>.html`；`folder.ts` 的讀取名單因此多開這一類檔案（寫入名單沒動）。

`render.ts` 不是新的履歷產生器：它只畫「預覽」，用範本自己的 `<style>` 加範本註解描述的標記（`header.top`、`section.block`、`div.entry`），AI 做的 `resumes/<代號>.html` 和它的程式檢查完全不動。測試證明排出來的頁面能通過程式檢查（三個台灣範本都只剩假資料裡的佔位字問題）。「存成 PDF」「下載 Word」跟著畫面上的版本走。排不出來（`resume.yaml` 或客製檔壞了）回 422 和白話說明。`GET /api/versions` 給介面版本、範本和存檔清單。

測試：`tests/versions.test.ts`；`python tests/versions_flow.py`（Playwright）。

## 履歷版本號（`src/resumever.ts`）

每份投出去的履歷有版本號 `V<大>.<中>.<小>`，規則和 D:\job-hunt 一樣（`jobhunt/resume/versioning.py`）：

- **大號** = `resume.yaml` 裡那個版本（`variants`）的 `major`；客製履歷跟著它的 `base_variant`。中文、英文各自可以有好幾個版本，各有自己的 `major`；沒寫 `major` 就是它排第幾個。
- **中號** +1：頁面上看得到的字（含連結）變了。**小號** +1：字一樣、只有範本或排版變了。內容和以前某一版一模一樣就沿用那個號碼。
- **登記**：只有「我投了這份，存一份」才登記（寫進 `data/resume_versions.csv`，同時記在進度表的 `resume_rev`）。登記前履歷頁顯示「版本 V1.2.0（草稿）」（算出來「會是」幾號），看再多次都不會用掉號碼。這個登記表只有程式寫（寫入名單加了這一個檔案，AGENTS.md 也寫明 AI 不碰）。
- 指紋：字 = 看得到的字加連結的雜湊；排版 = 範本 `<style>` 加標記骨架（標籤加 class）的雜湊。註解、`<script>`、黃色列印提醒不算。
- Word 檔：履歷檔自己的版本號寫在檔案屬性的「主旨」（沒登記過的加 `-draft`），頁面上看不到；通用版、換範本、存檔的版本沒有版本號。
- 通用版沒有登記動作（沒有「投出」），所以不編號；只有投給某個職缺的那份有。

測試：`tests/resumever.test.ts`。

## 職缺清單、H-1B 紀錄、下架提醒（美國版，`src/feed.ts`、`src/h1b.ts`）

「Jobs」分頁（只有 `market: us` 的資料夾有；台灣版的 `/api/feed` 回 404）：開著的實習和新鮮人職缺，依領域分類（各個科系都有地方放，不只工程），每一筆旁邊是雇主的 H-1B 申請紀錄。移植自 D:\job-hunt 的 `fetch_jobs.py`、`boards.py`、`h1b.py`、`liveness.py`，但分類**不是**那邊的機器人／ML／SWE。

- **來源**：SimplifyJobs 的 Summer 實習清單和 New-Grad 清單（`listings.json`，約各 13 MB，用 ETag 沒變就不重抓），加公司官網的公開徵才 API：Greenhouse、Lever、Ashby、SmartRecruiters、Workable、Workday。預設放 67 家（`DEFAULT_BOARDS`：科技 39 家，加 28 家 Workday 的金融、醫療、零售、消費品、能源、媒體、顧問公司，例如 Citi、CVS Health、Target、Pfizer、P&G、PwC、Disney；國防業者要美國公民，刻意不放）。**Simplify 偏科技**；其他領域靠公司官網，教育、非營利、公部門在預設清單裡很少，使用者可以在 `feed.companies` 加自己想看的學校、醫院、機構。Workday 的搜尋很鬆（搜「intern」也會找到「International」），所以搜 internship／new graduate／university 幾個字、每個翻幾頁，最後用職稱決定。**不用 zapply**：它的授權是 CC BY-NC-SA。
- **什麼時候讀**：按「Update the list」，或打開分頁時清單超過一天（`jobhunt.yaml` 的 `feed.auto_refresh: false` 關掉）。全部在這台電腦上讀，每個請求都是對公開網址的 GET，沒有任何使用者資料；讀到的存在 `.jobhunt/feed.json`（和 `update.json` 一樣是程式自己的紀錄，不在任何讀寫名單）。
- **領域**（`src/fields.ts`，開放的，不是固定幾類）：內建 13 個領域：軟體與資料、電機與硬體、醫療與公共衛生、財務與會計、人資與法務、教育／非營利／公共服務、工程（機械、土木、工業…）、科學與研究、媒體藝術與寫作、設計與產品、行銷業務與傳播、營運供應鏈與客服、商業策略與顧問，加「一般／其他」。標題決定：使用者在設定檔加的關鍵字最優先；再來硬體字、軟體字（軟體字贏過同一個標題裡的商業字，「Machine Learning Engineer, User Growth」是工程）；再一個領域一個領域從最具體的比；最後才看一般的 engineer／data／IT 字、來源自己的分類，都沒有就是 other。領域是**問的時候才算**（存的是來源的原始分類），所以改了關鍵字馬上生效。`feed.keywords` 裡寫內建領域的名字是加字，寫別的名字就是新領域（用它自己的名字顯示）；`feed.fields` 限定要看哪些領域（預設全部）。頁面上的勾選框只列有職缺的領域，旁邊有筆數。`jobhunt.yaml` 的 `feed:` 還可以改實習學期、加／跳過公司；不認得的值用預設，公司代號只收英數字、點、橫線、底線（Workday 是 `tenant.wdN/site`）。實習學期預設是「這個夏天」：九月起算明年、之前算今年，Simplify 的清單網址跟著年份。
- **篩選**：只收美國（任一地點像美國就算；公司官網只寫「In-Office」這類沒有國家的，當美國，除非明確在國外）、要的學期、不是只給博士的；要求美國公民或安全許可的預設隱藏（可勾選顯示）。同公司同職稱在兩個地方只列一筆（其他編號記在 `also`）。
- **新職缺**：第一次讀某個來源只建立基準，那天的都不算新；之後新出現的標「New」三天。
- **下架**：Simplify 的 `active` 欄位；公司官網某個職缺不見了就是下架（記日期，保留 60 天）。某一家整頁突然少一大半（超過一半）當成壞掉的回應，不當成大量下架，沿用上次的；某一家讀不到只有那一家失敗，上次的職缺照留。進度表裡「待投遞」且連結對得上已下架職缺的那一筆，卡片上寫「這個職缺已經下架」。
- **H-1B**：資料是 msampath/h1b-sponsor-data（MIT；整理自勞工部公開資料，每季更新）的 8 MB 索引，第一次更新時下載到程式自己的資料夾（`%APPDATA%\jobhunt-kit\h1b\`，不在求職資料夾），用 sha256 驗證，之後在本機查：公司名稱不會傳出去。名稱正規化和 D:\job-hunt 一樣（去掉 Inc／LLC／Services…；沒有同名時找開頭一樣、申請最多的那家）。**只顯示事實**：H-1B 件數、最近一年、綠卡（PERM＋PWD）件數、派到客戶端的比例；**不評等級**（沒有強／中／弱），頁面上寫明「沒有紀錄不是證明」並請問學校的國際學生辦公室。索引下載失敗只在清單上記原因，不影響職缺。`GET /api/h1b?company=` 只用已經下載的索引，不會在這裡下載。
- **加進追蹤**：「+ Track」呼叫 `/api/applications/add`，來源填 Simplify 或 Company site，連結就是職缺網址（之後靠它對下架）。
- 測試：`tests/feed.test.ts`、`tests/h1b.test.ts`、`tests/feed_api.test.ts`（假的 http 和假的索引，不連網）；`python tests/jobs_flow.py`（Playwright，用 `JOBHUNT_FEED_SERVER=http://127.0.0.1:<埠>` 指到本機假伺服器，只接受 127.0.0.1，見 `src/testserver.ts`）。

## 模式：只找美國／只找台灣／兩邊都找（`src/mode.ts`）

合一版（設計見 `../docs/plan-dual-market.zh-TW.md`）。發布的 zip 只有這一種；舊的台灣版、美國版兩套不再單獨發布。

- 選擇存在 `me/mode.yaml`（`markets: [us, tw]`）。程式的開始畫面會寫，AI 問過本人後也可以寫。不放在 `me/profile.md`：兩邊的開場流程都用「profile.md 存不存在」判斷是不是第一次用。
- 舊資料夾沒有 `me/mode.yaml` 時，照 `jobhunt.yaml` 的 `market`，不會出現開始畫面；`jobhunt.yaml` 有寫 `market` 時永遠照它。沒寫 `market` 的資料夾（合一版）由模式決定：選了美國就以美國為主（英文、Letter）。
- 開始畫面（`#page-start`）：還沒選模式時只有這一頁，分頁列隱藏。預設英文，頁首的切換鈕隨時可以換中文或英文：只改 `jobhunt.yaml` 的 `language:` 那一行，其他行和註解都不動（`withLanguage`）。寫入名單因此多了 `me/mode.yaml` 和 `jobhunt.yaml`。
- 分頁照模式出現：有台灣才有 104，有美國才有 Jobs（`/api/feed` 也照模式）。
- `POST /api/mode`：`{markets?: ["us","tw"], language?: "en"|"zh-TW"}`。
- **合一版的套件**（第 2 段）：`bun kitbuild.ts <輸出資料夾>` 把 `../jobhunt/scaffold/kit`（選之前的「設定用」AGENTS.md、兩種語言的使用說明、`.claude/settings.json`、`.codex/rules/`）和三套規則組在一起：`.kit/us`、`.kit/tw`（來源是 `workspace-us`、`workspace-general`）、`.kit/both`（美國那套加 `kit/both/` 的「Taiwan too」一節、`taiwan.md`、`fill-104`）。
- **裝規則**：`jobhunt mode us|tw|both`（`src/kitinstall.ts`，開始畫面的 `POST /api/mode` 也走它）把 `.kit/<模式>/AGENTS.md` 複製成 `AGENTS.md`，整個換掉 `playbooks/`、`.claude/skills`、`.agents/skills`，`resume.yaml` 和該模式要的資料夾只在不存在時才建，最後寫 `me/mode.yaml`。只能加市場不能減（`narrow` 拒絕，結束碼 2）；碰到捷徑（symlink）或路徑型態不對就整個拒絕。第一次就選「只找台灣」時，`jobhunt.yaml` 的 `language:` 改成 `zh-TW`（開始畫面另外送語言，不受影響）。
- **兩邊都找**：每份客製履歷 `targets/<id>.yaml` 寫 `market: us|tw`（沒寫就看 `base_variant`：`en…` 是美國），檢查照那個市場的規則跑（`ctx.withMarket`）。中文句子要對得上故事檔的 `## 中文確認時的句子（不能改）`；從「只找台灣」加成兩邊時，舊故事的 `## 確認時的句子（不能改）` 就算中文卡，「你說的原話」也算本人說過的數字。進度表多一欄 `market`（只在寫值時才加），看板可以只看一個國家。
- 一鍵更新：合一版的 zip 是 `jobhunt-kit-<系統>.zip`；選過模式的資料夾，`AGENTS.md`、`playbooks/` 和兩個 skills 資料夾從新的 `.kit/<模式>` 重裝（`installedFrom`）。**還沒處理**：新版刪掉或改名的 playbook／skill，舊檔會留在資料夾裡。
- 測試：`tests/mode.test.ts`、`kit_one.test.ts`、`both_check.test.ts`、`selfupdate_one.test.ts`、`bun tests/smoke_one.ts <程式>`；`python tests/start_flow.py`（Playwright）。

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
