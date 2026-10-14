# jobhunt-kit

[中文說明 (Traditional Chinese) → README.zh-TW.md](README.zh-TW.md)

A job-search helper for students and new grads of any major, running on an AI you already use (Claude Code or Codex). You chat with it, and it turns your real experience into a resume, writes text for your profiles, checks job postings, and helps you prepare for interviews. **It never makes up experience.** Every sentence goes on your resume only after you confirm it.

Feel like you "have no experience"? Part-time jobs, campus jobs, clubs, class projects, volunteering and internships all count. You tell it about them in plain chat, one piece at a time.

One download covers three choices. The first time you use it, you choose where you are looking for work:

- **United States:** a one-page US resume in English, LinkedIn and Handshake text, and help with work-authorization questions (including F-1 OPT and CPT).
- **Taiwan:** a Chinese resume (English if you want it), and what to fill in on 104.
- **Both:** your experience is written up once, in English first. When a Taiwan application needs Chinese, it makes the Chinese version from the English, and you confirm each Chinese sentence too.

You can add a market later (for example from United States to Both), but not remove one.

## Download

Get the latest version here: **<https://github.com/Ben0126/jobhunt-kit/releases/latest>**

Scroll down to "Assets" and click the file for your computer. You do not need to sign in to GitHub.

| Your computer | Download this |
| --- | --- |
| Windows | [`jobhunt-kit-windows.zip`](https://github.com/Ben0126/jobhunt-kit/releases/latest/download/jobhunt-kit-windows.zip) |
| Mac (Apple silicon, M1 or later) | [`jobhunt-kit-mac-apple.zip`](https://github.com/Ben0126/jobhunt-kit/releases/latest/download/jobhunt-kit-mac-apple.zip) |
| Mac (Intel processor) | [`jobhunt-kit-mac-intel.zip`](https://github.com/Ben0126/jobhunt-kit/releases/latest/download/jobhunt-kit-mac-intel.zip) |

Not sure which Mac you have: Apple menu, then "About This Mac". "Chip: Apple M..." means Apple silicon. "Processor: Intel" means Intel.

## What you need

- A Windows or Mac computer.
- One of these AI apps:
  - **Claude:** a paid plan (Pro or above) and the Claude desktop app from <https://claude.ai/download>. Its "Code" tab lets Claude read and write one folder on your computer. The free plan does not have it.
  - **Codex (ChatGPT):** a ChatGPT or OpenAI account and the Codex desktop app or command line. ChatGPT in the browser or the phone app cannot see your folder, so it does not work.
- Chrome, Edge or Safari, to save your resume as a PDF.

Nothing else to install.

## Get started

1. **Unzip** the file. On Windows, right-click it, choose "Extract All", then "Extract". On a Mac, double-click it. If you get a folder inside a folder, use the inner `job-hunt-kit` folder, the one that contains `START-HERE.md`. Put it somewhere easy to find, for example Documents, and do not move it afterwards.
2. **Open the folder in your AI app.** Claude: click the **Code** tab and pick the folder. Codex: open the folder as a project. If you are asked whether you trust the folder, choose Trust (or Yes).
3. Type **start** and send it. The AI reads the rules in the folder by itself.
4. It asks one question: **United States, Taiwan or Both?** Answer it, and it sets up the matching rules and carries on. You can also choose on the start screen of the `jobhunt` program in the folder.

Next time: open the same folder, start a new conversation and say "continue".

`START-HERE.md` (English) and `開始使用.md` (Chinese) inside the folder have the full steps: saving a PDF, a Taiwan resume photo, what to do when you are stuck. Button names on your screen may differ a little from this page; look for the one with a similar meaning.

## What it does

- **Digs out your experience.** It asks what you did, one question at a time, and turns each experience into a confirmation card. You confirm each card by typing its code, for example `confirm S-003`. For an English resume, the card shows the English sentence and a word-for-word translation back into your own language, so you can see exactly what you are claiming.
- **Reads your old resume.** Paste the text, or put a Word file in the folder's `inbox`. Delete your date of birth, ID numbers and street address first.
- **Checks job postings.** Paste a posting and it tells you whether it fits and what is missing. For US jobs it also looks for work-authorization blockers such as "no sponsorship now or in the future".
- **Makes the resume file.** From your confirmed experience only, opened in your browser to save as a PDF, or downloaded as a Word file you can edit.
- **Writes your profile text.** LinkedIn and Handshake for the US, and every field of 104 for Taiwan, as blocks you copy and paste yourself.
- **Interview practice.** Common questions, "tell me about yourself", and mock interviews based on your experience and the posting.
- **The `jobhunt` program (optional).** It opens a page in your browser with your application tracker, the resume checker, and a list of open internships and new-grad jobs in the US with each employer's public H-1B filing record. It warns you when a job you track has closed. It reads those public sources on your computer and sends nothing about you.

## What it does not do

- It does not make up experience. Every sentence and number must be something you did and confirmed.
- It does not apply for you, log in to LinkedIn, Handshake or 104, or send emails. You do those yourself. If the AI offers to, refuse.
- It is not legal advice. For visa and work-authorization questions, ask your school's international student office (the DSO).

## Your data

Your files stay in a folder on your computer and are never sent to a jobhunt server. But whatever the AI reads is sent to the AI service you use. So do not type your Social Security number, Taiwan national ID, passport number, I-20 or SEVIS number, bank account numbers or passwords to the AI, and do not put them in the folder. A resume photo (Taiwan) is kept by the program outside the folder, and the AI never sees it.

## The first time you open the program

The `jobhunt` program is not code-signed (that costs money), so Windows and macOS show a warning the first time. This is expected.

- **Windows:** when it says "Windows protected your PC", click "More info", then "Run anyway".
- **Mac:** the screens differ by macOS version. `START-HERE.md` has the steps. On older Macs, right-click the program, choose "Open", then "Open" again.

You can skip the program and use only the chat. The resume still works.

## Updating

When a newer version exists, the program's page shows a reminder at the top. Click "Update now" there: it replaces the program and the AI rules, and keeps your experience, resumes and application progress. If the update fails partway, the program puts the old files back by itself.

**Never unzip a new zip over your job-search folder.** Its `resume.yaml` and `data/applications.csv` are blank templates and would replace your confirmed experience and your application progress.

### Coming from v0.9 or earlier

Up to v0.9 there were two separate downloads (`job-hunt-*.zip` for Taiwan, `job-hunt-us-*.zip` for the US). They cannot update themselves to this version. Set up a new folder with the new download as in "Get started", and keep your old folder as it is: nothing in it is changed or deleted.

## Report a problem

Open an issue at [GitHub Issues](https://github.com/Ben0126/jobhunt-kit/issues) (needs a GitHub account). Say whether you use Windows or Mac, Claude or Codex, which step you were on, and what the screen said. A screenshot helps, but cover your personal details.

## For developers

Everything lives under `jobhunt-kit/`:

- `jobhunt-kit/jobhunt/scaffold/kit/`: the folder users get before they choose (setup `AGENTS.md`, `START-HERE.md`, `開始使用.md`, `jobhunt.yaml`, `.claude/settings.json`, `.codex/rules/`), plus `both/`, the extra rules for looking in both markets.
- `jobhunt-kit/jobhunt/scaffold/workspace-us/` and `workspace-general/`: the US and Taiwan rule sets (`AGENTS.md`, `playbooks/`, skills, templates). They are the source of `.kit/us` and `.kit/tw`; they are no longer released on their own.
- `jobhunt-kit/app/kitbuild.ts`: assembles the download folder (`bun kitbuild.ts <out>`): the kit, with the three rule sets in `.kit/us`, `.kit/tw` and `.kit/both`.
- `jobhunt-kit/app/`: the local program (Bun, one executable): checks, tracker page, resume files, the Jobs list, and `jobhunt mode us|tw|both`, which installs the chosen rule set (`AGENTS.md`, `playbooks/`, `.claude/skills`, `.agents/skills`) and writes `me/mode.yaml`. See [`jobhunt-kit/app/README.md`](jobhunt-kit/app/README.md).
- An earlier Python CLI and web app for engineers: [`jobhunt-kit/README.md`](jobhunt-kit/README.md).

Run the tests:

```sh
cd jobhunt-kit/app && bun test                          # local program (Bun 1.4.2, no bun install needed)
cd jobhunt-kit && pip install -e ".[dev]" && pytest     # Python CLI (Python 3.10 or later)
```

On Windows, set `PYTHONUTF8=1` before running pytest.

### Versions and releases

- The version number is built into the program: `jobhunt --version` prints it (a dev build prints `dev`).
- The program's page checks GitHub at most once a day for a newer release (the version number only; nothing about you is sent). To turn that off, set `update_check: false` in `jobhunt.yaml`. A dev build never checks.
- Before tagging a release, write what changed in `release-notes/<tag>.en.md` and `release-notes/<tag>.zh.md`, for example `v0.10.en.md` and `v0.10.zh.md`, and commit them. The release workflow stops if either file is missing. In the `.zh.md` file, point Chinese readers to [README.zh-TW.md#已經在用舊版怎麼更新](README.zh-TW.md#已經在用舊版怎麼更新) for the update steps instead of repeating them.
- The Releases page is English first. Its first line links to the Chinese notes for that version and to [README.zh-TW.md](README.zh-TW.md).

GitHub Actions:

- `.github/workflows/app.yml`: tests and builds on Windows, Apple-silicon Mac and Intel Mac, then runs the built program through a basic flow and the one-kit flow (`tests/smoke_one.ts`).
- `.github/workflows/release.yml`: when a tag like `v0.10` or `v0.10.1` is pushed, assembles the kit with `kitbuild.ts`, packs it with each platform's program into `jobhunt-kit-windows.zip`, `jobhunt-kit-mac-apple.zip` and `jobhunt-kit-mac-intel.zip`, unzips and tests them again, and publishes them as a GitHub Release.
