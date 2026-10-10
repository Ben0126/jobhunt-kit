# 美國版 v1 計畫（2026-10-09）

> 給：擁有者。計畫依據：6 份盤點報告＋1 份挑錯報告（workflow wf_cfbb3378-c50）。
> 天數都是**推定**，沒有人實際估過工時。

## 1. 已決定的事

| 題目 | 決定 |
|---|---|
| 使用者 | 在美國的留學生，不限國籍，找非工程職缺（行政、HR、業務、助理、營運、客服）。之後再開放給所有美國應屆生。 |
| 包裝 | 另開資料夾 `jobhunt/scaffold/workspace-us/`，另發 3 個 zip；`jobhunt.exe` 共用，看 `jobhunt.yaml` 的 `market: us` 切換規則。 |
| 投遞輸出 | LinkedIn、Handshake 個人檔案各欄怎麼填（取代台灣的 104 欄位卡）。照擁有者 `D:\job-hunt` 的 LinkedIn 做法。 |
| 對話語言 | AI 用使用者寫的語言回話；所有檔案與產出（履歷、LinkedIn、Handshake）一律英文。 |
| 簽證 | 篩職缺（寫明不擔保就先停下告訴使用者）＋照實回答申請表兩題（能不能合法工作、需不需要擔保）。一律提醒找學校國際學生辦公室（DSO）確認。不做 H-1B 公司查詢。 |
| 「50+」寫法 | 使用者原話說「超過 N／N 多」才准寫 N+；AI 不准自己把 47 改成 50+。 |
| 試用者語言 | 還不確定 ⇒ 模擬測試先測「中文使用者」和「全英文使用者」兩種。 |

## 2. 我直接採用的預設（要改就說）

- 一頁是**強烈警告**，不擋。Letter 紙張、不放照片。
- 台灣版和美國版放在**同一個 GitHub Release、同一個版本號**。分開發會搶走台灣版的「最新版」下載連結。
- 本機介面和檢查訊息在 `market: us` 時全英文。
- 證號遮蔽在**兩個市場都開**：美國 SSN、SEVIS 號（N＋10 碼）、A-number、台灣身分證、中國 18 碼身分證。
- 簽證身分另存 `me/work-auth.md`，這個檔**不能當寫作來源**；程式檢查履歷、LinkedIn、Handshake 檔裡不准出現 F-1／OPT／CPT／H-1B／visa／sponsorship 這類字。
- LinkedIn 字數：官方公布的上限超過就擋（跟擁有者自己的工具一樣）；只有第三方來源的上限只警告。
- 追蹤提醒：10 天追、28 天算沒消息，跟台灣版一樣。
- 共用的舊規則檔 `web/js/core/rules.js` 不動（它跟 Python 版有對照測試綁著）；美國規則加在 `app/` 裡。

## 3. 第一版不做

職缺爬蟲／每日職缺清單（擁有者系統的來源都是科技實習）、H-1B 公司查詢、cover letter、各公司投遞表單逐欄填法、面試的「間隔複習」紀錄、自動登入或代送出、任何法律或移民建議。

## 4. 資料夾 `workspace-us/` 內容

- `AGENTS.md`（英文，從台灣版翻譯改寫＋美國規則；推定 22–28 KB）、`CLAUDE.md`、`GEMINI.md`、`START-HERE.md`、`opening-prompt.txt`、`jobhunt.yaml`（`language: en`、`market: us`、`paper: letter`）、`resume.yaml`（版本名稱固定叫 `en`，程式只認這個名字）。
- playbooks：onboarding、dig-experience、import-resume、tailor-resume、make-resume-file、resume-review、interview-prep、log-application（以上從台灣版改寫），加上新的 linkedin-profile、handshake-profile、work-authorization。
- `templates/resume-us.html`（Letter、一頁、無照片）。
- 產出：`profiles/linkedin.md`、`profiles/handshake.md`、`me/work-auth.md`。
- `.claude/settings.json` 與 skills（`fill-104` 換成 `linkedin`、`handshake`）。
- 不帶：`104/`、台灣範本、`fill-104.md`。

## 5. 確認卡（跨語言）

每段經歷一張卡，同一張卡裡放：
1. 你的原話（使用者的語言）
2. 履歷句（英文，正式版本）
3. 這句的意思（逐字翻回使用者的語言，不准比英文弱或強）
4. 數字（三處必須一致）

固定指令用英文：`confirm S-003`、`skip`、`I confirm my old resume is accurate`。使用者用母語說，AI 先複述英文指令，複述那句才算數。經歷檔的 `title`／`org` 用官方英文名稱（程式靠它抓「草稿混進履歷」），原話保留母語。學歷和技能的英文也要過卡。

## 6. 程式改動（`app/`）

1. 新增 `market.ts`：讀 `market`／`language`／`paper`，未知值當台灣。
2. 證號遮蔽（上面五種），檢查器和 Word 讀取器都要。
3. 英文數字：five hundred、twice、$1.2M、N+（只在原話有時）。
4. 英文日期：`May 2024`、`05/2024`、`Q3 2024`——**履歷那邊和 yaml 那邊都要認**（挑錯報告抓到只改一邊會讓日期永遠對不上）。
5. 英文空格占位字（`[Company Name]`、TBD）。
6. 範本 `resume-us.html` 註冊；美國版擋所有圖片。
7. `來源：`／`Source:` 兩種標記都認。
8. 欄位卡檢查從「104」改成每個市場一套：美國檢查 `profiles/linkedin.md`、`profiles/handshake.md` 的字數與來源行。
9. 簽證字眼不准出現在履歷與 profiles。
10. 所有使用者看得到的字（進度板、介面、檢查訊息、Word 讀取訊息）英文版。
11. 發布流程：加美國版 3 個 zip、解壓後跑 `check` 必須通過。**正式打 tag 會在公開 repo 建 Release，會先問你。**

每個改動都附「修前紅、修後綠」的測試；台灣版全部既有測試必須維持綠。

## 7. 順序（天數推定）

| 階段 | 內容 | 推定 |
|---|---|---|
| P1 | 程式地基：market 切換、證號遮蔽、兩種標記、簽證字眼 | 2–3 天 |
| P2 | 英文數字、日期、占位字、美國範本 | 2 天 |
| P3 | 英文 AGENTS.md 與核心 playbooks | 3–4 天 |
| P4 | LinkedIn、Handshake、簽證 playbook＋欄位卡檢查 | 2–3 天 |
| P5 | 面試 playbook（擁有者的模擬面試做法）、skills、settings | 1 天 |
| P6 | 介面與檢查訊息英文化 | 3 天 |
| P7 | 發布流程（不打正式 tag，看 build 產物） | 1 天 |
| P8 | 真的 claude.exe 跑兩個模擬人物（中文、全英文）多輪對話 | 2–3 天 |

P8 必測情境：匯入 Word 舊履歷、要求「寫我帶過團隊」被拒、職缺寫「不擔保」要停下、職缺裡藏指令要忽略、LinkedIn About 超字數、中文使用者靠「翻回意思」確認卡、聊天裡貼 SSN 不能進任何檔案。
通過條件：0 句編造、檔案裡 0 個證號、最後資料夾 `check` 結束碼 0。
