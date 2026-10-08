# Use it with any AI: ChatGPT, Claude, Gemini — plain chat or background agents

jobhunt-kit doesn't need Claude Code. Two halves:

- **Rules and workflows** live in the workspace's `AGENTS.md` and `playbooks/` — plain Markdown any assistant can
  follow (`CLAUDE.md` and `GEMINI.md` just point there).
- **Guardrails and layout** are code, and run in three places — your computer, GitHub Actions, or a chat's code
  tool — so even a chat-only assistant ends up checked by a machine.

## Pick a path

| You have | Use | Install anything? |
|---|---|---|
| a chat app only (ChatGPT, Claude, Gemini) | A. chat kit + checks in GitHub | no |
| a background agent (ChatGPT dots, Gemini Spark, Claude scheduled tasks, Codex) | B. repo access + a daily routine | no |
| just an API key, and you want it automatic | C. open an issue → drafted target | no (GitHub Actions runs it) |
| a coding agent (Claude Code, Codex CLI, Gemini CLI) | D. open the folder | `pip install jobhunt-kit` |

Product capabilities change; this reflects October 2026.

### A. Chat only: chat kit + checks in GitHub

1. **Workspace** (once, all in the browser): create a **private** GitHub repo, upload the contents of
   `workspace-template.zip` from the jobhunt-kit release page. Optional: Settings → Secrets and variables → Actions →
   Variables → `JOBHUNT_KIT` to pin a version or use a fork (e.g. `jobhunt-kit @ git+https://github.com/Ben0126/jobhunt-kit@v0.1.0`;
   default: the latest from github.com/Ben0126/jobhunt-kit). Settings → Actions → General → Workflow permissions: *Read and write*.
2. **Get the chat kit**: Actions → `jobhunt-build` → Run workflow → download the `chat-kit` artifact.
3. **Load it into a chat**: ChatGPT Project / Claude Project — upload the files and paste `INSTRUCTIONS.md` into the
   project instructions. Gemini — create a Gem with `INSTRUCTIONS.md` as instructions and the files as knowledge.
   File limits? Upload only `ALL-IN-ONE.md`.
4. **Use it**: "set up my job hunt" with your old resume attached, then "tailor my resume for <link>". The assistant
   gives you complete files (e.g. `targets/acme-perception.yaml`).
5. **Save to GitHub**: Add file → Create new file, paste with the path, commit. `jobhunt-build` runs on its own:
   invented numbers, AI wording, wrong bullet ids or a second page fail with the field to fix; otherwise the PDF
   is under Artifacts.
6. **Review with a different AI**: tailored with ChatGPT? Give the PDF to Claude or Gemini with the
   `resume-review.md` prompt. A writer reviewing its own work finds nothing.

Chats with a code tool (ChatGPT, Claude) can run the real checker: `jobhunt-runnable.zip` in the kit needs only
PyYAML — `python -m jobhunt --workspace . check`. Chats without one follow "Checks by hand" in AGENTS.md. Either
way, GitHub Actions checks again on commit.

### B. Background agents: ChatGPT dots, Gemini Spark, Claude scheduled tasks, Codex

These agents run on their own cloud computer on a schedule. Give them:

1. **Access to this repo** (GitHub connector): read, create branches, open pull requests — **not** push to main.
2. **Permission rules** (dots Custom Rules, Spark's ask-first actions): paste the "Never without the user's explicit
   OK" list from `playbooks/daily-routine.md` — never apply, never send email or messages (draft follow-ups), never
   change `resume.yaml`, never touch `submitted/`.
3. **A daily task prompt**:

   ```
   Open my job-hunt repository and do today's routine from playbooks/daily-routine.md: triage and score new
   postings, open draft pull requests for at most 3 of the best fits, list follow-ups due with drafted messages.
   Don't apply and don't send anything. End with one short summary; write each confirm question as yes/no.
   ```

Notes: **dots** have a computer and browser and can run `jobhunt`. **Gemini Spark** centers on Gmail and Google
Workspace; if it can't reach GitHub, use it on the inbox side (recruiter emails, interview times, reminders from
`data/followup.md`) and keep resume files on path A or C. **Claude** (Claude Code on the web, scheduled tasks) and
**Codex** work in the repo directly and read `AGENTS.md`.

### C. API key only: open an issue, get a drafted target

1. Repo Settings → Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`.
2. In `jobhunt.yaml`:
   ```yaml
   llm:
     provider: anthropic        # or openai, gemini
     model: ""                  # anthropic default claude-opus-5-5; openai / gemini: the model your account uses
   ```
3. Open an issue titled `Tailor: <job link>` (paste the description in the body if the page needs a browser, e.g. Workday).
4. `jobhunt-tailor` asks the model for `targets/<id>.yaml`, runs the same gates (failures go back to the model with
   the exact errors, up to 3 rounds; nothing is written if it never passes), builds the PDF, opens a **draft pull
   request** and replies on the issue.
5. Answer `confirm`, empty it, merge. Only issues opened by the repository owner are processed.

Locally the same thing is `jobhunt tailor <link or file>` (`pip install "jobhunt-kit[llm]"`).

### D. Coding agents: Claude Code, Codex CLI, Gemini CLI

```
pip install "jobhunt-kit[llm]"
jobhunt init my-job-hunt
```

Open the folder in any of them: Claude Code reads `CLAUDE.md` (plus skills), Codex reads `AGENTS.md`, Gemini CLI
reads `GEMINI.md` — all three lead to `AGENTS.md`.

## Where each guardrail runs

| Check | Plain chat | Chat + code tool | Your computer / agent | GitHub Actions |
|---|---|---|---|---|
| numbers must be in resume.yaml | by-hand checklist | `jobhunt check` | `check` / `build` | every commit |
| AI wording, semicolons, parentheses | by hand | ✓ | ✓ | ✓ |
| bullet ids, versions | by hand | ✓ | ✓ | ✓ |
| one page, layout, PDF | — | — | `jobhunt build` | ✓ (artifact) |
| don't send with open `confirm` | reminded | TODO line | TODO line | in the summary |
| independent review | new chat / other AI | same | sub-agents | — |

Whatever the path, nothing applies, emails or messages anyone for you. That stays yours.
