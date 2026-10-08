# Set up a job hunt workspace

Goal: in one sitting, the user ends with a resume.yaml that holds *their* facts, a jobhunt.yaml that finds
*their* jobs, one PDF per variant that builds clean, and a daily feed that runs. Reply in the user's language.

## 1. Ask (one message, then wait)

1. Your current resume — attach the PDF/Word file or paste the text (LinkedIn "About + Experience" works too).
2. What roles? (e.g. robotics software, ML, backend) — 2 or 3 groups is ideal; each becomes a track and a resume variant.
3. Internship or full-time? Which term/start (e.g. Summer 2027, new grad 2027)? Which country? (US today; Taiwan is planned.)
4. Do you need visa sponsorship / are you on F-1 / need CPT/OPT? (Decides exclusions and H-1B tagging.)
5. Companies you particularly want (any size) — we'll read their career sites directly.
6. Anything you can't do (relocation limits, no defense work, part-time during the semester…)?

## 2. resume.yaml

- Read the format at the top of `resume.yaml` (or `jobhunt/resume/model.py` in the package) and replace the example.
- **Copy facts, don't improve them.** Keep the user's numbers, dates and claims exactly. If a bullet is vague, keep it
  and ask a question instead of guessing a number. Collect every question in one list for the user.
- Give every experience/project and every bullet a short stable `id` (`acme_planner`) — targets refer to them.
- Create one variant per track (`major` 1, 2, 3 in track order) and tag bullets that only fit some variants with
  `variants: [...]`. Untagged = in every variant.
- Put the phone number in `basics.phone` (dist/ is git-ignored; the repo must be private).
- Run `jobhunt check` — fix AI-sounding wording it flags *with the user's agreement* (plain rewording only).

## 3. jobhunt.yaml

- `profile.name`, `language` (zh-TW if they wrote to you in Chinese), `search` (country, employment, term).
- `tracks`: one per role group, most important first; title fragments from real job titles of that kind;
  `resume:` = the matching variant. `notify.tracks`: the ones worth a daily email.
- `sources`:
  - US internships → `simplify` with `SimplifyJobs/Summer<YEAR>-Internships`; US new grad → `SimplifyJobs/New-Grad-Positions`.
  - Their must-have companies → `ats` entries. Find the system from the careers page URL
    (boards.greenhouse.io/X, jobs.lever.co/X, jobs.ashbyhq.com/X, X.wdN.myworkdayjobs.com/Site). Open only the
    careers page — no personal data in any query. Can't find a public ATS → tell the user, skip it.
- Visa: F-1 / needs sponsorship → keep the citizenship/clearance title exclusions and defense companies, set
  `visa.h1b_records: true`. Doesn't need sponsorship → offer to clear those exclusions.

## 4. Verify (show the output to the user)

Can't run commands (plain chat)? Give the user the finished `resume.yaml` and `jobhunt.yaml` as files, and tell
them the GitHub Action builds and checks them on push (see AGENTS.md, "What you can do"). Then skip to step 5.

```
jobhunt build          # every variant must be 1 page, no FAIL
jobhunt sources        # every source ok; 0 postings after filters → fix tracks/search, don't hide it
jobhunt daily          # first run = baseline, nothing listed as new — that's expected
```

Open one PDF and look at it (render a page to PNG if you can) — check the name, contact line and dates.

## 5. Hand-off

- Remind them: keep the GitHub repo **private**; enable Actions with "Read and write" workflow permissions; the
  daily Action opens an issue (GitHub emails it) only when there's something new.
- Delete `targets/example-acme-perception.yaml` once they have a real target.
- List the open questions from step 2 that still need answers.
