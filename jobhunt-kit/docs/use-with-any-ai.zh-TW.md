# 搭配任何 AI 使用：ChatGPT、Claude、Gemini，純聊天或背景 agent

jobhunt-kit 不綁 Claude Code。分工是這樣：

- **規則和流程**寫在工作區的 `AGENTS.md` 和 `playbooks/`。是一般的 markdown，哪個 AI 都讀得懂。
  `CLAUDE.md`、`GEMINI.md` 只是指向它。
- **把關和排版**交給程式。有「你的電腦」、「GitHub Actions（雲端）」、「聊天裡的程式工具」三個地方能跑，
  所以就算 AI 只能聊天，最後還是會被機器檢查。

## 選一條路

| 你有的 | 怎麼用 | 要裝東西嗎 |
|---|---|---|
| **只有聊天**（ChatGPT、Claude、Gemini app） | A. 聊天包＋GitHub 背景檢查 | 不用 |
| **背景 agent**（ChatGPT dots、Gemini Spark、Claude 排程任務、Codex） | B. 給它 repo 權限和每日例行任務 | 不用 |
| **只有 API key**，想讓它自己跑 | C. 開 Issue 就自動改履歷 | 不用（GitHub Actions 幫你跑） |
| **程式型 agent**（Claude Code、Codex CLI、Gemini CLI） | D. 打開資料夾就能用 | `pip install jobhunt-kit` |

各家功能會變，下面寫的是 2026 年 10 月的狀況。

### A. 只有聊天：聊天包＋GitHub 背景檢查

1. **建工作區**（一次就好，全部在瀏覽器完成）：
   - 在 GitHub 開一個 **private** repo。
   - 把 release 頁的 `workspace-template-zh-TW.zip` 解壓後上傳。
   - （選用）Settings → Secrets and variables → Actions → Variables 新增 `JOBHUNT_KIT`，用來固定版本或改用 fork，
     例如 `jobhunt-kit @ git+https://github.com/Ben0126/jobhunt-kit@v0.1.0`。不設就用 github.com/Ben0126/jobhunt-kit 的最新版。
   - Settings → Actions → General → Workflow permissions 選 *Read and write*。
2. **拿聊天包**：
   - Actions → `jobhunt-build` → Run workflow。
   - 跑完後在 Artifacts 下載 `chat-kit`。
3. **放進聊天**：
   - **ChatGPT**：建一個 Project，上傳聊天包的檔案，把 `INSTRUCTIONS.md` 貼進 Project instructions。
   - **Claude**：建一個 Project，做法同上。
   - **Gemini**：建一個 Gem，指示貼 `INSTRUCTIONS.md`，知識檔上傳聊天包。
   - 檔案數量有限制的話，只上傳 `ALL-IN-ONE.md` 一個檔案就好。
4. **開始用**：
   - 第一次說「幫我設定找工作」，附上舊履歷。
   - 之後貼職缺連結，說「針對這個職缺改履歷」。
   - AI 會給你完整的檔案，例如 `targets/acme-perception.yaml`。
5. **存進 GitHub**：
   - 在 repo 網頁按 Add file → Create new file，路徑照 AI 給的貼上，按 Commit。
   - `jobhunt-build` 會自動執行：
     - 數字對不上、AI 腔、bullet id 錯、超過一頁，都會失敗並寫出要改哪一欄。
     - 通過就在 Artifacts 提供 PDF 下載。
6. **審查換一個 AI**：用 ChatGPT 改的，拿 PDF 給 Claude 或 Gemini 審，貼 `resume-review.md` 的提示。
   自己寫的自己審，只會覺得沒問題。

**聊天能自己跑檢查嗎？**
- ChatGPT 和 Claude 聊天裡的程式工具通常可以執行 Python。
- 聊天包裡的 `jobhunt-runnable.zip` 只需要 PyYAML，AI 解壓後跑 `python -m jobhunt --workspace . check` 就能當場檢查。
- 不能跑程式的聊天，會照 `AGENTS.md` 的「Checks by hand」逐項檢查並列出清單。
- 不管哪種情況，commit 之後 GitHub Actions 都會再檢查一次。

### B. 背景 agent：ChatGPT dots、Gemini Spark、Claude 排程任務、Codex

這類 agent 有自己的雲端電腦，可以排程執行。給它：

1. **這個 repo 的權限**（GitHub 連接器）：讀取、開分支、開 pull request。**不要**給它直接推 main 的權限。
2. **權限規則**：dots 的 Custom Rules、Spark 的「先問我」設定。貼 `playbooks/daily-routine.md` 的
   「Never without the user's explicit OK」那一段。重點如下：
   - 絕不自動投遞、絕不自動寄信或傳訊息（follow-up 只寫草稿）。
   - 不改 `resume.yaml`、不碰 `submitted/`。
3. **排程任務的提示**（每天早上一次）：

   ```
   打開我的 job-hunt repo，照 playbooks/daily-routine.md 做今天的例行工作：
   整理新職缺並評分、為最適合的最多 3 個職缺開草稿 pull request、列出要 follow-up 的申請並附草稿。
   不要投遞、不要寄任何信。最後用中文給我一則簡短的摘要，每個 confirm 問題寫成是非題。
   ```

各家注意事項：

- **ChatGPT dots**：有自己的電腦和瀏覽器，能跑 `jobhunt` 指令。草稿 PR 送出後，dots 可以傳訊息通知你。
- **Gemini Spark**：主要整合 Gmail 和 Google Workspace。如果連不到 GitHub，可以把它用在信箱那一側：
  - 整理 recruiter 來信、更新面試時間。
  - 提醒你 `data/followup.md` 裡到期的事。
  - 履歷檔案仍然走 A 或 C。
- **Claude**（Claude Code 雲端或排程任務）、**Codex**：直接在 repo 裡工作，會自動讀 `AGENTS.md`。

### C. 只有 API key：開 Issue 就自動改履歷

1. 在 repo 的 Settings → Secrets 加上你那家的 key：`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 或 `GEMINI_API_KEY`。
2. `jobhunt.yaml` 設定：
   ```yaml
   llm:
     provider: anthropic        # 或 openai、gemini
     model: ""                  # anthropic 預設 claude-opus-5-5；openai、gemini 要填你帳號能用的模型
   ```
3. 開一個標題是 `Tailor: <職缺連結>` 的 Issue。如果職缺頁要瀏覽器才看得到（例如 Workday），把職缺內容貼在 Issue 內文。
4. `jobhunt-tailor` Action 會：
   - 請 AI 寫 `targets/<id>.yaml`。
   - 用同一套關卡檢查。失敗會把錯誤原文丟回去重寫，最多 3 輪；都不過就不寫入。
   - build PDF，開一個 **draft pull request**，並在 Issue 回報結果。
5. 你回答 `confirm` 裡的問題、清空它，再 merge。

只有你自己開的 Issue 會被處理。

### D. 程式型 agent：Claude Code、Codex CLI、Gemini CLI

```
pip install "jobhunt-kit[llm]"
jobhunt init my-job-hunt --language zh-TW
```

在資料夾裡打開任一工具：

- Claude Code 讀 `CLAUDE.md`，另外有 skills。
- Codex 讀 `AGENTS.md`。
- Gemini CLI 讀 `GEMINI.md`。

三份內容一樣，都指向 `AGENTS.md`。

## 哪一關在哪裡把關

| 檢查 | 純聊天 | 聊天＋程式工具 | 你的電腦／agent | GitHub Actions |
|---|---|---|---|---|
| 數字要在 resume.yaml | AI 照清單檢查 | `jobhunt check` | `jobhunt check`／`build` | 每次 commit |
| AI 腔、分號、括號 | AI 照清單檢查 | ✓ | ✓ | ✓ |
| bullet id、版本 | AI 照清單檢查 | ✓ | ✓ | ✓ |
| 一頁、排版、PDF | — | — | `jobhunt build` | ✓（Artifacts 下載） |
| `confirm` 沒清空不准投 | AI 提醒 | 列為 TODO | 列為 TODO | 摘要裡列出 |
| 換一個 AI 審查 | 開新聊天或換一家 | 同左 | 子 agent | — |

不管用哪條路，都不會替你投遞、寄信或傳訊息。這些永遠由你自己做。
