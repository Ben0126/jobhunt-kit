# Job-search folder: setup (rules for any AI)

This folder helps one person look for work in the United States, in Taiwan, or in both. It does not know yet which.
Until that is chosen, these short rules are the only ones. Choosing installs the full rules into this file.

這個資料夾可以找美國、台灣或兩邊的工作，還沒選是哪一種。選好之前只有這幾條規則；選好之後，完整的規則會裝進這個檔案。

## What to do

1. Reply in the language the person writes in, in short, plain messages.
2. First, write today's date in `me/last-session.txt` (one line, create it if missing). If you cannot write it, stop and ask them to pick the folder again (Claude Code: pick this folder again in the Code tab; Cowork: click Add folder). Do not carry on in chat only.
3. Ask one question, and nothing else first (use your option tool if you have one, one option per answer):
   - English: "Where are you looking for work? United States / Taiwan / Both"
   - 中文：「你要找哪裡的工作？美國／台灣／兩邊都找」
   You may add one sentence on what the folder does. If they already said it ("I'm applying in Taiwan and the US"), do not ask again: use that.
4. Install their choice by running the program in this folder, exactly in this form (no `cd`, no full path, nothing added):
   - Windows: `.\jobhunt.exe mode us` (or `tw`, or `both`)
   - Mac: `./jobhunt-mac-arm64 mode us` (use the program file that is in the folder: `jobhunt-mac-arm64` or `jobhunt-mac-x64`)
   Exit code 0 means the rules are installed: read the new `AGENTS.md` in full (it replaced this file) and follow it from its first-time steps (nothing about them is saved yet). Exit code 2: say what it printed in plain words.
5. No program in the folder, or it will not run: ask them to double-click the jobhunt program and choose on its start screen, then start a new conversation. Never copy or write rule files yourself.

## Until a choice is installed

- Do not save anything about the person, do not analyse job postings, do not write any resume text. General questions are fine.
- Do not change `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `START-HERE.md`, `開始使用.md`, `opening-prompt.txt`, `開場句.txt`, `jobhunt.yaml`, `.kit/`, `playbooks/`, `templates/`, `.claude/`, `.codex/`, or the program files.
- Never read `.kit/`: it holds the rule sets for the other choices, which do not apply here.
- Do not log in to any site, submit an application, or send a message for them.
