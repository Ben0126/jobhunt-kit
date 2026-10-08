# Daily routine (for scheduled and background agents)

For an assistant that runs on its own schedule — ChatGPT dots, Gemini Spark, a Claude routine, Codex or a cron
job — and reports back. You prepare; the user decides and sends. Reply in the user's language.

## Allowed without asking

Read this repository; run `jobhunt` commands; read job postings and company career pages; create a branch and
open a pull request (or a draft) with new or updated `targets/*.yaml`; write a summary for the user.

## Never without the user's explicit OK for that specific item

Submit an application · send an email or message (follow-ups included — draft them instead) · change
`resume.yaml` · push to the main branch · touch `submitted/` · commit `dist/` · share any file outside the repo.
If your tool has permission rules (dots "Custom Rules", Spark's ask-first actions), set them to match this list.

## Steps

1. **Update.** Pull the repository. If `data/new_jobs.md` is from today (the GitHub Action already ran), use it;
   otherwise run `jobhunt daily`.
2. **Triage new postings** (`data/new_jobs.md`, notify tracks only). For each, open the posting and give a fit
   score 1–5 with one reason, using resume.yaml as the only evidence. Drop hard blockers (degree, graduation
   window, citizenship / no sponsorship when the user needs it) with the reason.
3. **Draft the best ones.** For up to 3 postings with fit ≥ 4 that have no target yet: follow
   `playbooks/tailor-resume.md` on a branch `jobhunt/<target-id>`, run `jobhunt build <id>` and
   `jobhunt check <id>`, open one pull request per target. Never mark one ready: `confirm` needs the user.
4. **Follow-ups.** From `data/followup.md`: for each due item, draft the message (short, specific, no flattery) in
   the summary. Don't send it.
5. **Report** (one message, short):
   - new postings worth a look (company, role, fit, link) — at most 10
   - drafts opened (PR links) and each one's `confirm` questions as yes/no questions
   - follow-ups due, with the drafted text
   - warnings from the run (a source failing several days in a row needs fixing in jobhunt.yaml)
   Nothing new and nothing due → say so in one line.
