# jobhunt-kit

A job-search workspace you run with the AI you already use — ChatGPT, Claude or Gemini, in a plain chat, a
background agent (ChatGPT dots, Gemini Spark, Codex…) or a coding agent (Claude Code, Codex CLI, Gemini CLI).
It finds postings every morning, helps you tailor a resume to each one **without inventing anything**,
lays out the PDF, freezes exactly what you sent, and reminds you to follow up.

[繁體中文說明](README.zh-TW.md)

## No coding? Open the web app

**https://ben0126.github.io/jobhunt-kit/** — no sign-up, no install, no API key. Daily internship and new-grad
postings; your resume as a form; wherever AI helps you get a prompt to paste into ChatGPT, Claude or Gemini and paste
the answer back, and the page checks it for invented numbers and AI wording; one-click PDF; application tracking.
Everything stays in your browser. Desktop AI apps (Claude Desktop, Gemini CLI, Cursor) can work on your data
directly through [MCP](docs/mcp.md).

## Command line

```
jobhunt init my-job-hunt     # your private workspace: settings, resume facts, Claude skills, daily GitHub Action
cd my-job-hunt && claude     # or codex / gemini: "set up my job hunt" → imports your resume, configures the search
```

No install at all? Start from `workspace-template.zip` on GitHub and use the chat kit — see
[Use it with any AI](docs/use-with-any-ai.md).

## What it does

| | |
|---|---|
| **Daily job feed** | Pluggable, combinable sources: [SimplifyJobs](https://github.com/SimplifyJobs) lists, company career sites read directly (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Eightfold, Oracle, …), or your own Python source. Same posting from two sources = one row. First run and newly added sources are baseline-only, so you're never flooded. A digest issue lands in your inbox only when something is new. |
| **Your categories** | `tracks` in `jobhunt.yaml` (e.g. robotics / ML / software) replace hard-coded rules; exclusions for companies or titles you can't take (e.g. clearance roles for international students); company tiers; H-1B filing history per employer. |
| **One source of facts** | `resume.yaml` holds every fact once. A tailored resume (`targets/<id>.yaml`) can only pick, reorder and reword. |
| **Guardrails, enforced by the build** | A number that isn't in `resume.yaml` fails the build. AI-sounding wording (Leveraged, robust, seamless…), semicolons, stacked parentheses fail the build. A one-page resume that overflows fails the build. Assumptions go into `confirm`, and a non-empty `confirm` means "don't send". |
| **Layout** | Built-in HTML → PDF renderer (PyMuPDF, no LaTeX or browser): one-page fitting, real links, ATS-clean text (dates stay next to their entry, no ﬁ-ligature garbage). Bring your own template or renderer. |
| **Versioned submissions** | Every PDF gets `V<major>.<minor>.<patch>` (text change vs layout change), registered only from committed sources. `jobhunt archive` freezes the exact PDF you sent into `submitted/` and records it. |
| **Any AI** | Tool-neutral `AGENTS.md` + `playbooks/` (onboarding, tailoring, three-lens review, daily routine) read by Claude Code, Codex, Gemini CLI and background agents; a **chat kit** for ChatGPT / Claude Projects and Gemini Gems; `jobhunt tailor` drafts a target with the Anthropic, OpenAI or Gemini API and rejects drafts that break the rules. |
| **Runs in the background** | GitHub Actions: daily feed, check + build on every commit (PDFs as artifacts — so a chat-only user still gets machine checks), and "Tailor: <link>" issues → a validated draft pull request. |
| **Tracking** | `applications.csv` + follow-up reminders (nudge after N days if you have a contact, "probably ghosted" after M days). |

## Install

```
pip install "jobhunt-kit @ git+https://github.com/Ben0126/jobhunt-kit"
jobhunt init my-job-hunt
```

Python 3.10+. Dependencies: PyYAML, Jinja2, PyMuPDF. For `jobhunt tailor`: `pip install "jobhunt-kit[llm]"`
(or `[anthropic]`, `[openai]`, `[gemini]`).

Then, in the workspace:

1. Open it in Claude Code and say **"set up my job hunt"** — or edit `jobhunt.yaml` and `resume.yaml` yourself.
2. `jobhunt build` → PDFs in `dist/`; `jobhunt sources` → check every job source returns something.
3. Push the workspace to a **private** GitHub repo; Settings → Actions → General → Workflow permissions:
   *Read and write*. Run the `jobhunt-daily` workflow once (baseline). Watch the repo to get digest emails.

## Commands

| Command | What |
|---|---|
| `jobhunt init DIR [--language zh-TW]` | new workspace |
| `jobhunt daily` | job feed + follow-ups (what the Action runs) |
| `jobhunt fetch [--source NAME]` / `jobhunt sources` | job feed only / dry-run every source |
| `jobhunt build [variant\|target…]` | resume PDFs |
| `jobhunt check [target…]` | fact + voice checks, open `confirm` items |
| `jobhunt ats PDF [--keywords "a,b"] [--jd jd.txt]` | what an ATS reads from a PDF |
| `jobhunt track JOB_ID` | add a posting from `jobs.csv` to `applications.csv` |
| `jobhunt archive KEY [--write]` | freeze the PDF you sent |
| `jobhunt tailor URL\|FILE` | draft a target with an LLM API (`llm:` in jobhunt.yaml), validated |
| `jobhunt chat-kit` | files for a ChatGPT / Claude Project or Gemini Gem |

## How a workspace is laid out

```
my-job-hunt/                 (private repo — yours)
├── jobhunt.yaml             search settings: sources, tracks, exclusions, renderer
├── resume.yaml              every fact, once
├── targets/<id>.yaml        one tailored resume per job (overrides + notes)
├── sources/                 your own job sources (optional)
├── data/                    jobs.csv, new_jobs.md, applications.csv, followup.md, resume_versions.csv, state.json
├── submitted/               frozen PDFs you sent (committed)
├── dist/                    built PDFs (git-ignored: phone number)
├── AGENTS.md                instructions and red lines for every AI (CLAUDE.md / GEMINI.md point here)
├── playbooks/               setup, tailoring, review lenses, daily routine — plain Markdown
├── .claude/skills/          thin Claude Code wrappers around the playbooks
└── .github/workflows/       jobhunt-daily, jobhunt-build, jobhunt-tailor
```

The framework never stores personal data; upgrading is `pip install -U`.

## Docs

- [Product direction](PRODUCT.md) (zh-TW)
- [MCP for desktop AI apps](docs/mcp.md)
- [Use it with any AI](docs/use-with-any-ai.md) — chat, background agents, API, coding agents
- [Configuration reference](docs/configuration.md)
- [Job sources](docs/sources.md) — built-in sources, writing your own, adding a country
- [resume.yaml, targets and layout](docs/resume.md)
- [Roadmap](ROADMAP.md)

## Status

0.1 — US internship / new-grad search works end to end. Taiwan job sources are next (see the roadmap).
Career-site APIs change without notice: a broken company is a warning in the digest, never a failed run.

## License

MIT. SimplifyJobs and other lists are fetched at run time and are subject to their own licenses.
