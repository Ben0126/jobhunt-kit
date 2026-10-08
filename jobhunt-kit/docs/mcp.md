# 讓電腦上的 AI app 直接使用 jobhunt（MCP）／ Connect desktop AI apps (MCP)

MCP 是 AI app 連接外部工具的標準。接上之後，AI 可以直接做這些事：

- 讀你的履歷和職缺。
- 存客製版履歷、產生 PDF。
- 更新申請狀態。

不用再複製貼上。**防呆由工具本身執行**：AI 存客製版時，數字對不上、有 AI 腔、引用了不存在的段落，工具會直接拒絕，並列出要修正的地方。

> 只想用瀏覽器？不需要 MCP，打開網頁版就好：https://ben0126.github.io/jobhunt-kit/

## 你需要

1. **一個工作區資料夾**：
   - 從網頁版轉過來：設定 → 匯出備份，然後執行 `jobhunt web-import backup.json --workspace ~/my-job-hunt`。
   - 從頭開始：執行 `jobhunt init ~/my-job-hunt`。
2. **[uv](https://docs.astral.sh/uv/)**（推薦）：它會自己準備好 Python。另一種做法是自己裝 Python 3.10 以上，
   再執行 `pip install "jobhunt-kit[mcp] @ git+https://github.com/Ben0126/jobhunt-kit"`。

## Claude Desktop

設定檔位置：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jobhunt": {
      "command": "uvx",
      "args": ["--from", "jobhunt-kit[mcp] @ git+https://github.com/Ben0126/jobhunt-kit",
               "jobhunt", "--workspace", "/Users/you/my-job-hunt", "mcp"]
    }
  }
}
```

如果是用 pip 安裝的，改成 `"command": "jobhunt", "args": ["--workspace", "/Users/you/my-job-hunt", "mcp"]`。
存檔後重開 Claude Desktop，對它說：「看一下我的求職進度」。

## Gemini CLI

`~/.gemini/settings.json`：

```json
{ "mcpServers": { "jobhunt": { "command": "uvx",
  "args": ["--from", "jobhunt-kit[mcp] @ git+https://github.com/Ben0126/jobhunt-kit", "jobhunt", "--workspace", "/path/to/my-job-hunt", "mcp"] } } }
```

## Cursor、VS Code、其他支援本機 MCP 的 app

用一樣的 `command` 和 `args`，寫進那個 app 的 MCP 設定。
ChatGPT 和部分 app 只接受遠端（HTTPS）的 MCP server，目前連不上這個本機 server，請改用網頁版或聊天包。

## 工具清單

| 工具 | 做什麼 |
|---|---|
| `get_overview` | 搜尋設定、職務類型、職缺數、到期的 follow-up |
| `get_resume` | resume.yaml（唯一的事實來源） |
| `get_playbook` | 流程說明：tailor-resume、resume-review、setup-job-hunt、daily-routine、三個審查角度 |
| `list_jobs`、`get_new_jobs` | 開放中的職缺、今天的日報 |
| `check_target` | 檢查客製版，不存檔 |
| `save_target` | 存客製版；違反規則就拒絕，並列出問題 |
| `build_pdf` | 產生 PDF，回傳路徑和版本號 |
| `save_resume` | 改 resume.yaml。必須是你同意那個改動後，AI 才能帶上 `user_confirmed=true` |
| `list_applications`、`update_application`、`track_job` | 申請紀錄 |

這些工具都不會投遞、寄信或聯絡任何人。

---

**English.** MCP lets desktop AI apps call jobhunt directly. `save_target` refuses tailored resumes that invent numbers,
read AI-written or reference missing bullets, so the rules hold whatever the model does. Create a workspace
(`jobhunt init` or `jobhunt web-import backup.json --workspace DIR`), then add the server to your app's MCP config as
shown above (`uvx --from "jobhunt-kit[mcp] @ git+https://github.com/Ben0126/jobhunt-kit" jobhunt --workspace DIR mcp`).
Apps that only accept remote (HTTPS) MCP servers can't reach this local server yet — use the web app or the chat kit.
