# jobhunt-kit

搭配你本來就在用的 AI 的找工作系統：ChatGPT、Claude、Gemini 都可以。純聊天、背景 agent（ChatGPT dots、
Gemini Spark、Codex…）、程式型 agent（Claude Code、Codex CLI、Gemini CLI）都能用。
每天自動整理新職缺；針對每個職缺改履歷，**但不准捏造任何東西**；自動排版成 PDF；把寄出去的那份凍結存檔；提醒你 follow-up。

## 不會寫程式？直接打開網頁

**https://ben0126.github.io/jobhunt-kit/**

- 不用註冊、不用安裝、不用 API key。
- 每天的實習／New Grad 職缺都在網頁上。
- 用表單管理履歷。
- 需要 AI 的地方，網頁會給你一段提示，貼到你慣用的 ChatGPT、Claude 或 Gemini，再把回答貼回來；網頁會檢查有沒有捏造數字、AI 腔。
- 一鍵存成 PDF，並追蹤每一筆申請。
- 資料只存在你的瀏覽器裡。

想讓電腦上的 AI app（Claude Desktop、Gemini CLI、Cursor）直接讀寫你的資料，見 [MCP 設定](docs/mcp.md)。

## 會用終端機的人

```
jobhunt init my-job-hunt     # 建立你自己的工作區：設定、履歷事實、Claude skills、每日 GitHub Action
cd my-job-hunt && claude     # 或 codex、gemini：說「幫我設定找工作」→ 匯入舊履歷、設定搜尋條件
```

完全不想安裝？從 GitHub 上的 `workspace-template-zh-TW.zip` 開始，搭配聊天包使用，見
[搭配任何 AI 使用](docs/use-with-any-ai.zh-TW.md)。

## 功能

| | |
|---|---|
| **每日職缺** | 職缺來源可以替換、也可以同時用好幾個：[SimplifyJobs](https://github.com/SimplifyJobs) 清單、直接讀公司官網的徵才系統（Greenhouse、Lever、Ashby、Workday、SmartRecruiters、Eightfold、Oracle…）、或你自己寫的 Python 來源。同一個職缺出現在兩個來源只會是一列。第一次執行和新加入的來源只建立基準，不會一次通知幾百筆。有新職缺才會開 Issue（GitHub 會寄信）。 |
| **你自己的分類** | `jobhunt.yaml` 的 `tracks`（例如機器人／ML／軟體）取代寫死的規則；可排除不能投的公司或職稱（例如國際生不能投的 clearance 職缺）；公司分級；雇主實際的 H-1B 申請紀錄。 |
| **事實只有一份** | 所有事實只寫在 `resume.yaml`。客製版（`targets/<id>.yaml`）只能挑選、重排、換句話說。 |
| **build 強制把關** | 數字在 `resume.yaml` 找不到 → build 失敗。AI 腔用字（Leveraged、robust、seamless…）、分號、一句好幾個括號 → build 失敗。一頁履歷超過一頁 → build 失敗。改寫時的假設寫進 `confirm`，`confirm` 沒清空就不要投。 |
| **排版** | 內建 HTML → PDF 排版（PyMuPDF，不用 LaTeX 或瀏覽器）：自動縮放塞進一頁、連結可點、ATS 讀得乾淨（日期緊跟所屬項目、沒有 ﬁ 這種連字亂碼）。可以換自己的範本或排版程式。 |
| **版本號與存檔** | 每份 PDF 都有 `V<大>.<中>.<小>`（文字改了 vs 只改排版），來源 commit 了才登記。`jobhunt archive` 把寄出去的那份凍結到 `submitted/` 並記錄下來。 |
| **任何 AI 都能用** | 規則和流程寫在跟工具無關的 `AGENTS.md`＋`playbooks/`（初次設定、客製履歷、三方審查、每日例行），Claude Code、Codex、Gemini CLI、背景 agent 都會讀；給 ChatGPT／Claude Project、Gemini Gem 用的**聊天包**；`jobhunt tailor` 用 Anthropic、OpenAI 或 Gemini 的 API 產生客製版，違規的草稿會被擋下。 |
| **背景自動跑** | GitHub Actions：每日職缺、每次 commit 自動檢查並產生 PDF（只用聊天的人也有機器把關）、開「Tailor: 連結」的 Issue 就產生檢查過的草稿 PR。 |
| **追蹤** | `applications.csv`＋follow-up 提醒（有聯絡人的申請 N 天沒消息提醒你寄信，M 天沒消息標「可能石沉大海」）。 |

## 安裝

```
pip install "jobhunt-kit @ git+https://github.com/Ben0126/jobhunt-kit"
jobhunt init my-job-hunt --language zh-TW     # 日報和狀態名稱用中文
```

需要 Python 3.10 以上。套件：PyYAML、Jinja2、PyMuPDF。要用 `jobhunt tailor` 再裝 `pip install "jobhunt-kit[llm]"`。

接著在工作區裡：

1. 用 Claude Code 打開，說「**幫我設定找工作**」，或自己改 `jobhunt.yaml` 和 `resume.yaml`。
2. `jobhunt build` → PDF 在 `dist/`；`jobhunt sources` → 確認每個職缺來源都抓得到東西。
3. 把工作區推到 **private** GitHub repo；Settings → Actions → General → Workflow permissions 選 *Read and write*。
   手動跑一次 `jobhunt-daily`（建立基準）。Watch 這個 repo 就會收到日報信。

## 指令

| 指令 | 用途 |
|---|---|
| `jobhunt init 資料夾 [--language zh-TW]` | 建立工作區 |
| `jobhunt daily` | 抓職缺＋follow-up 提醒（GitHub Action 跑的就是這個） |
| `jobhunt fetch [--source 名稱]`／`jobhunt sources` | 只抓職缺／試跑每個來源（不寫檔） |
| `jobhunt build [版本或 target…]` | 產生履歷 PDF |
| `jobhunt check [target…]` | 事實＋語氣檢查、列出還沒確認的 `confirm` |
| `jobhunt ats PDF [--keywords "a,b"] [--jd jd.txt]` | ATS 從 PDF 讀到什麼 |
| `jobhunt track 職缺id` | 把 `jobs.csv` 的職缺加進 `applications.csv` |
| `jobhunt archive 職缺或target [--write]` | 凍結寄出的 PDF |
| `jobhunt tailor 連結或檔案` | 用 AI API 產生客製版（`jobhunt.yaml` 的 `llm:`），自動檢查 |
| `jobhunt chat-kit` | 產生給 ChatGPT／Claude Project、Gemini Gem 的檔案 |

## 文件

- [產品方向](PRODUCT.md)
- [MCP：電腦上的 AI app 直接使用](docs/mcp.md)
- [搭配任何 AI 使用](docs/use-with-any-ai.zh-TW.md)：純聊天、背景 agent、API、程式型 agent
- [設定檔](docs/configuration.md)（英文）
- [職缺來源](docs/sources.md)：內建來源、自己寫一個、加新國家
- [resume.yaml、target 與排版](docs/resume.md)
- [路線圖](ROADMAP.md)

## 狀態

0.1：美國實習／New Grad 已經可以從頭跑到尾。下一步是台灣的職缺來源（見路線圖）。
公司官網的 API 會無預警改版：某家壞掉只會在日報寫警告，不會讓整次執行失敗。
