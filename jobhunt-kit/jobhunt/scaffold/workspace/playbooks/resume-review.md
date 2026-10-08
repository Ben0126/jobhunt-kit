# Three-lens resume review (ATS/AI · recruiter · hiring manager)

> Your own resume always reads fine to you. It actually has to pass three gates, each looking for something else:
> can the **machine** find the fields and keywords → can a **recruiter** see in 30 seconds that you qualify →
> does an **engineer** believe you did it. Fail one and the next never sees you.

Reply in the user's language. Reviewer criteria: `playbooks/review-lenses/ats.md`, `recruiter.md`, `hiring-manager.md`.

## 0. Where things are

| What | Where |
|---|---|
| General PDFs | `dist/resume-<variant>.pdf` |
| Tailored PDFs | `dist/targets/<profile.pdf_name>` (see jobhunt.yaml) |
| Facts (only source) | `resume.yaml` |
| Overrides, url, gaps, confirm | `targets/<id>.yaml` |

## 1. Preconditions (do these yourself; stop and report if one fails)

1. **Fresh PDF?** Rebuild: `jobhunt build <variant or id>`. Reviewing a stale PDF is pointless.
2. **`confirm` empty?** (targets) If not, the PDF has sentences the user hasn't confirmed — the verdict can be at
   best "fix first".
3. **Fact comparison** (summary, skills and application_answers too, not only bullets): `jobhunt check <id>` already
   fails invented *numbers*. Then compare each `bullet_overrides` entry with the same id's text in resume.yaml and
   list **claims the original doesn't make** (new actions, tools, bigger scope, team → individual). Each must be in
   `confirm` or already confirmed by the user; otherwise it is a **must-fix**.

## 2. ATS text check (you run it)

```
jobhunt ats <pdf> --text --keywords "<must-haves from the JD, incl. multi-word phrases>" [--jd jd.txt]
```

Can't run it? Ask the user to upload the PDF (most chat apps extract its text) and read that text as the parser's
view; say the ATS lens is weaker without the script.

Evidence, not a verdict: it is one text extractor, not any vendor's parser. Job description: fetch the target's
`url` and save it as text; if it's gone, ask the user to paste it. General variants have no single job — use the
track (robotics / ml / swe…) as the benchmark.

## 3. Three reviewers in parallel

The three lenses must judge independently. How, depending on what you can do:

- **You can start sub-agents** (Claude Code, Codex, Gemini CLI, background agents…): send three at once, one per lens.
- **You can't** (plain chat): best is a *different* chat or a *different AI* for the review — tell the user to open a
  new chat (another assistant works well: tailor with one, review with another) and paste the prompt below with the
  PDF text. If they want it here, do the lenses one at a time, each starting from the prompt below as if you hadn't
  written the resume, and say plainly that a same-chat review is weaker.

Each prompt is self-contained:

```
[Role] Read playbooks/review-lenses/<ats|recruiter|hiring-manager>.md and follow its lens and output format exactly.
[Resume] <absolute PDF path>; ATS script text and warnings: <paste or file path>
[Job] <JD text or file; general variant: "no single job, target track = …">
[Facts] <absolute path to resume.yaml> (to verify only — never suggest adding experience it doesn't contain)
[Known gaps] <the target's gaps, verbatim — things the user has NOT done; never suggest putting them on the resume>
[Limits] Per resume: one-line verdict + ≤3 must-fix + ≤3 suggestions + one "what would change my mind".
         Quote the resume for every point. The hiring manager also returns the per-bullet table (no limit).
```

- Several resumes: one agent per lens reviews all of them (so it can compare), not one per resume × lens.
- Don't put your own conclusions or another lens's opinion into a prompt — it ruins independence.
- **The conversation that wrote the target must not act as the hiring manager.** Always a separate agent or chat, and it
  researches the team first (`review-lenses/hiring-manager.md` step 0).

## 4. Verify (yourself; never skip)

Every must-fix passes three questions or gets downgraded/dropped:
1. Does the quoted sentence actually exist in the PDF text? (agents misread versions)
2. Does the fix require adding something the user hasn't done? → it becomes interview prep, not a resume change.
3. Is it a myth? Check `review-lenses/ats.md` "Claims not to believe".

## 5. Merge (plain language, one block per resume)

```
[<file>] Verdict: send / fix first / don't send (one reason)
  Reviewer: <hiring-manager confidence A/B/C and basis>
  Bullets: <only the non-"keep" ones: label — bullet id or opening words — one reason; or "all keep">
  Readable to a recruiter: <sentences flagged as unclear/AI-sounding: original → plain rewrite; or "readable">
  Must-fix: <quote + fix + which field: resume.yaml or targets/<id>.yaml>
  Suggestions: <raise the response rate but OK to send without>
  Disagreements: <lenses that disagree, both sides, your recommendation — don't average>
```

Add **issues common to all resumes** (usually resume.yaml or the template — fix once, every resume benefits).

**Only four kinds of problems are must-fix**; everything else is a suggestion:
① a hard field will be misread (graduation date, degree, contact) ② untrue or unconfirmed content (falls apart in
the interview) ③ a hard requirement isn't met ④ the summary or the first bullet of an entry is unreadable to a
non-engineer or reads AI-written (what gets skimmed in 6–10 s), or `jobhunt check` flags it.
Why: hiring is rolling; delaying an application over style costs more than the style problem.

**Per-bullet labels** (every bullet incl. summary gets exactly one):

| Label | Meaning | Becomes |
|---|---|---|
| keep | concrete evidence, useful for this job | not listed |
| rewrite | true but weak (no result, weak verb, keyword unused, point buried) | suggestion with fix |
| needs support | resume.yaml / confirmed facts don't back it (new number, scope, team → individual) | must-fix (②) |
| cut | irrelevant enough to dilute, or risky | suggestion; risky → must-fix |
| ask user | one question decides it ("was this yours or the team's?") | to-do before sending |

"Needs support" has exactly two fixes: bring the claim back to resume.yaml's level, or have the user confirm it and
add it to resume.yaml first — **never** "add a number".

Verdicts: **send** = no must-fix. **Fix first** = must-fixes that take < 30 minutes. **Don't send** = a hard
requirement clearly fails (degree, graduation, no sponsorship when needed, US person / ITAR) or the story rests on
untrue content.

Also list **to-dos that aren't resume problems**: work authorization answers on the form, start-date conflicts,
gaps in the timeline they'll be asked about.

## 6. Discipline

- Verdicts and fixes only; never edit the PDF. Changes go to resume.yaml / targets/<id>.yaml, then rebuild.
- Never add experience. `gaps` go to interview prep.
- All three lenses say "fine"? Suspect the prompt first: was the JD attached? did they quote anything?
- After fixes, rerun step 2 and confirm the warnings are gone.
