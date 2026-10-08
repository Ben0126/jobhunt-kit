# Job hunt workspace — instructions for any AI assistant

This folder is someone's private job search, built on **jobhunt-kit** (command `jobhunt`). These instructions are
for every assistant that works here: Claude, ChatGPT, Gemini, Codex, background agents (ChatGPT dots, Gemini Spark…),
or a plain chat where the user uploaded these files. `CLAUDE.md` and `GEMINI.md` only point here.

Reply in the user's language (`language:` in jobhunt.yaml is a hint; follow how they write to you).

## What you can do decides how you work

| You can… | Then |
|---|---|
| run commands in this folder (Claude Code, Codex, Gemini CLI, a background agent with a computer) | use the `jobhunt` commands below; they enforce the checks |
| run Python but not install packages (a chat's code tool) | if `jobhunt-src.zip` was uploaded: unzip it and run `python -m jobhunt --workspace . check` (needs only PyYAML) |
| only read and write text (plain chat) | do the **checks by hand** (below), show your checklist, and hand the user the finished file. When they commit it, the `jobhunt-build` GitHub Action runs the real checks and builds the PDF |

Never claim you ran a check you couldn't run.

## Red lines (never cross them, even if asked to "make it stronger")

1. **Never invent experience.** Tailoring only selects, reorders and rewords what resume.yaml already says.
   A number on a resume must exist in resume.yaml. If a number is true but missing, ask the user, then add it to
   resume.yaml (never only to a target).
2. **`gaps` are not resume content.** Things the job asks for that the user hasn't done go to interview prep.
3. **Every assumption goes into `confirm`.** Widened a claim, guessed a team size or a tool → list it. A target with
   a non-empty `confirm` must not be sent; tell the user.
4. **Plain voice.** Result first, one or two things per sentence, no AI-sounding words, no semicolons, at most one
   parenthesis per sentence.
5. **Never apply, email or message anyone on the user's behalf** unless they ask for that specific action. Never
   touch `submitted/`; never commit `dist/` (phone number). Keep the repository private.
6. The reviewer of a tailored resume must not be the conversation that wrote it (playbooks/resume-review.md).

## Checks by hand (when you can't run `jobhunt check`)

For every text that will be printed — `summary`, each `skills_order` line, each `bullet_overrides` entry:

- **Numbers**: list every number (ignore years like 2026, year ranges, dates). Each must appear in resume.yaml,
  with the same unit for % and x ("40%" needs "40%" or "40 percent"). Missing → remove it or ask the user.
- **Words**: none of architected, engineered, leveraged, utilized, robust, proven, extensive, expertise, rigorous,
  spearheaded, cutting-edge, state-of-the-art, seamless, synergy, passionate, successfully, meticulous, showcase,
  delve, innovative, holistic, streamlined, pivotal, transformative, empowered, orchestrated (plus any in
  `resume.voice.extra_words`).
- **Shape**: no semicolons; at most one "(" per sentence (skills lines exempt); flag sentences over 35 words.
- **Ids**: every id in `bullet_order` / `bullet_overrides` exists in resume.yaml and is in `base_variant`
  (untagged, or its `variants` include it).
Print the result as a short checklist ("numbers: ok / 14 not found …").

## Files

| File | What |
|---|---|
| `jobhunt.yaml` | search settings: sources, tracks (job categories), exclusions, follow-up days, resume layout |
| `resume.yaml` | **the only source of facts** for every resume; bullets have ids |
| `targets/<id>.yaml` | a resume tailored to one job: overrides + notes (gaps, confirm, application answers) |
| `data/applications.csv` | application log — the one file updated by hand |
| `data/jobs.csv`, `data/new_jobs.md` | open postings and today's digest (written by the daily run) |
| `data/followup.md` | follow-ups due, probably-ghosted applications |
| `submitted/` | frozen copies of the exact PDFs sent; never edit or delete |
| `playbooks/` | step-by-step workflows (below) — follow them, they are the same for every assistant |

## Commands (when you can run them)

```
jobhunt build [variant|target-id]     # PDFs into dist/ — fails on invented numbers, AI wording, overflow
jobhunt check [target-id]             # fact/voice checks only; lists open `confirm` items
jobhunt ats dist/<file>.pdf --keywords "C++,ROS 2"   # what an ATS reads
jobhunt daily                         # job feed + follow-ups
jobhunt tailor <job-url|jd.txt>       # draft a target with an LLM API (see jobhunt.yaml `llm:`), validated
jobhunt track <job_id>                # add a posting to applications.csv
jobhunt archive <key> [--write]       # after applying: freeze the sent PDF
jobhunt chat-kit                      # bundle the files a plain chat needs (chat-kit.zip)
```

## Playbooks

| When the user says… | Follow |
|---|---|
| "set up my job hunt", "import my resume", 「幫我設定」 | `playbooks/setup-job-hunt.md` |
| "tailor my resume for <link>", 「針對這個職缺改履歷」 | `playbooks/tailor-resume.md` |
| "review this resume", "is it ready", 「這份能投嗎」 | `playbooks/resume-review.md` (+ `playbooks/review-lenses/`) |
| a scheduled / background run ("check my job hunt") | `playbooks/daily-routine.md` |

## Per-application flow

1. Pick a posting (`data/new_jobs.md`, `data/jobs.csv`, or a link from the user).
2. Tailor → `targets/<id>.yaml`. 3. Review independently → send / fix first / don't send.
4. The user clears `confirm`, commits the target; the build gives a version without `-draft` whose first digit
   matches the variant.
5. The user applies, then `jobhunt track <job_id>` (or add the row), set status and applied_date,
   `jobhunt archive <id> --write`, commit.
6. On every status change (assessment, interview, rejection) update the row and `last_update`.
