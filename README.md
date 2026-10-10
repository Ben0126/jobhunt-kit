# jobhunt-kit

[中文說明 (Traditional Chinese) → README.zh-TW.md](README.zh-TW.md)

A job-search helper for students and new grads that runs on your own Claude. You chat, and it turns your real experience into a one-page resume, writes text for your profiles, checks job postings, and helps you prepare for interviews. **It never makes up experience.** Every sentence goes on your resume only after you confirm it.

Feel like you "have no experience"? Part-time jobs, campus jobs, clubs, class projects, volunteering and internships all count. You tell it about them in plain chat, one piece at a time.

There are two editions:

- **US edition (English):** for students and new grads looking for jobs in the United States, including international students on F-1 OPT or CPT. It is written for non-engineering roles such as HR, operations, marketing, sales, finance and administration.
- **Taiwan edition (Chinese):** for fresh grads in Taiwan looking for admin, HR, sales and assistant roles. Everything in it is in Traditional Chinese. See [README.zh-TW.md](README.zh-TW.md).

## Download

Get the latest version here: **<https://github.com/Ben0126/jobhunt-kit/releases/latest>**

Scroll down to "Assets" and click the file you need. You do not need to sign in to GitHub.

### US edition

| Your computer | Download this |
| --- | --- |
| Windows | [`job-hunt-us-windows.zip`](https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-us-windows.zip) |
| Mac (Apple silicon, M1 or later) | [`job-hunt-us-mac-apple.zip`](https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-us-mac-apple.zip) |
| Mac (Intel processor) | [`job-hunt-us-mac-intel.zip`](https://github.com/Ben0126/jobhunt-kit/releases/latest/download/job-hunt-us-mac-intel.zip) |

Not sure which Mac you have: Apple menu, then "About This Mac". "Chip: Apple M..." means Apple silicon. "Processor: Intel" means Intel.

### Taiwan edition (Chinese)

| Your computer | Download this |
| --- | --- |
| Windows | `job-hunt-windows.zip` |
| Mac (Apple silicon) | `job-hunt-mac-apple.zip` |
| Mac (Intel) | `job-hunt-mac-intel.zip` |

Setup instructions for this edition are in [README.zh-TW.md](README.zh-TW.md).

## Using the US edition

### What you need

- A Windows or Mac computer.
- A paid Claude plan (Pro or above). The free plan cannot use the Code tab described below.
- The Claude desktop app, from <https://claude.ai/download>. Its "Code" tab lets Claude read and write one folder on your computer, and this kit works through that tab.
- Chrome, Edge or Safari, to save your resume as a PDF.

Nothing else to install.

### Get started

1. **Unzip** the file. On Windows, right-click it, choose "Extract All", then "Extract". On a Mac, double-click it. If you get a folder inside a folder, use the inner `job-hunt-us` folder, the one that contains `START-HERE.md`. Put it somewhere easy to find, for example Documents, and do not move it afterwards.
2. Open the **Claude desktop app** and click the **Code** tab.
3. **Pick the folder** you just unzipped. If Claude asks whether you trust it, choose Trust (or Yes).
4. Type **start** and send it. The AI reads the rules in the folder by itself and then talks to you.

Next time: pick the same folder in the Code tab, start a new conversation and say "continue".

`START-HERE.md` inside the folder has the full steps (saving a PDF, what to do when you are stuck). Button names on your screen may differ a little from this page; look for the one with a similar meaning.

### What it does

- **Digs out your experience.** It asks what you did, one question at a time, and turns each experience into a confirmation card. A card shows the English resume sentence and a word-for-word translation back into your own language, so you can see exactly what you are claiming. You can chat in your own language; everything on the resume and profiles is in English.
- **Reads your old resume.** Paste the text, or put a Word file in the folder's `inbox`. Delete your date of birth, ID numbers and street address first.
- **Checks job postings.** Paste a posting and it tells you whether it fits, what is missing, and whether it has work-authorization blockers such as "no sponsorship now or in the future".
- **Makes the resume file.** A one-page US Letter resume from your confirmed experience, opened in your browser so you can save it as a PDF.
- **Writes your LinkedIn and Handshake text.** Headline, About, Experience and more, as blocks you copy and paste yourself.
- **Interview practice.** "Tell me about yourself", common questions, the sponsorship question, and mock interviews.
- **Application tracker.** A local page (the `jobhunt` program in the folder) shows where each application stands and what to follow up on.

### What it does not do

- It does not make up experience. Every sentence and number must be something you did and confirmed.
- It does not apply for you, log in to LinkedIn or Handshake, or send emails. You do those yourself. If the AI offers to, refuse.
- It is not legal advice. For visa and work-authorization questions, ask your school's international student office (the DSO).

### Your data

Your files stay in a folder on your computer and are never sent to a jobhunt server. But whatever the AI reads is sent to the AI service you use. So do not type your Social Security number, passport number, I-20 or SEVIS number, bank account numbers or passwords to the AI, and do not put them in the folder.

### The first time you open the program

The `jobhunt` program in the folder opens the tracker and resume checker in your browser. It is optional. It is not code-signed (that costs money), so Windows and macOS show a warning the first time. This is expected.

- **Windows:** when it says "Windows protected your PC", click "More info", then "Run anyway".
- **Mac:** the screens differ by macOS version. `START-HERE.md` has the steps. On older Macs, right-click the program, choose "Open", then "Open" again.

You can skip the program and use only the chat. The resume still works.

### Already using an older version?

Replace only the program file. Do not unzip the new zip over your folder.

1. Close the program's text window.
2. Download the zip for your computer and unzip it into a different folder, for example your Desktop.
3. Copy only the program file (`jobhunt.exe` on Windows, `jobhunt-mac-arm64` or `jobhunt-mac-x64` on a Mac) into the folder you use now, and choose Replace.
4. Open the program again.

The `resume.yaml` and `data/applications.csv` inside a new zip are blank templates. Unzipping over your folder would replace your confirmed experience and your application progress.

When a newer version exists, the local page also shows a reminder at the top (see "For developers" below for how to turn it off).

## Report a problem

Open an issue at [GitHub Issues](https://github.com/Ben0126/jobhunt-kit/issues) (needs a GitHub account). Say whether you use Windows or Mac, which step you were on, and what the screen said. A screenshot helps, but cover your personal details.

## For developers

Everything lives under `jobhunt-kit/`:

- `jobhunt-kit/jobhunt/scaffold/workspace-us/`: the US edition folder users get (`AGENTS.md` is the rule file for the AI, `START-HERE.md` is the user guide).
- `jobhunt-kit/jobhunt/scaffold/workspace-general/`: the Taiwan edition folder (`AGENTS.md`, `開始使用.md`).
- `jobhunt-kit/app/`: the local program (Bun, one executable). It runs the checks, the tracker page and the Word resume reader. See [`jobhunt-kit/app/README.md`](jobhunt-kit/app/README.md).
- An earlier Python CLI and web app for engineers: [`jobhunt-kit/README.md`](jobhunt-kit/README.md).

Run the tests:

```sh
cd jobhunt-kit/app && bun test                          # local program (Bun 1.4.2, no bun install needed)
cd jobhunt-kit && pip install -e ".[dev]" && pytest     # Python CLI (Python 3.10 or later)
```

On Windows, set `PYTHONUTF8=1` before running pytest.

### Versions and releases

- The version number is built into the program: `jobhunt --version` prints it (a dev build prints `dev`).
- The local page checks GitHub at most once a day for a newer release (the version number only; nothing about you is sent). If there is one, it shows a reminder at the top. To turn that off, set `update_check: false` in `jobhunt.yaml`. A dev build never checks.
- Before tagging a release, write what changed in `release-notes/<tag>.en.md` and `release-notes/<tag>.zh.md`, for example `v0.9.en.md` and `v0.9.zh.md`, and commit them. The release workflow stops if either file is missing. In the `.zh.md` file, point Chinese readers to [README.zh-TW.md#已經在用舊版怎麼更新](README.zh-TW.md#已經在用舊版怎麼更新) for the update steps instead of repeating them.
- The Releases page is English first. Its first line links to the Chinese notes for that version and to [README.zh-TW.md](README.zh-TW.md).

GitHub Actions:

- `.github/workflows/app.yml`: tests and builds on Windows, Apple-silicon Mac and Intel Mac, then runs the built program through a basic flow.
- `.github/workflows/release.yml`: when a tag like `v0.6` or `v0.6.1` is pushed, packages each edition's folder with the program into a zip (six zips in all), unzips and tests them again, and publishes them as a GitHub Release.
