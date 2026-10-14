# Make the printable resume file (folder version)

Use this when the user says "make the resume file", "I need a PDF", "make my resume" or "can I print it?".

**Why this exists**: in this folder version the AI fills the template and writes `resumes/<id>.html`; the user opens it in the browser and uses Print -> Save as PDF. This is the exception allowed by AGENTS.md red line 13, and every condition must hold:

- The content comes **only** from confirmed facts (AGENTS.md "How an experience becomes confirmed"), `resume.yaml` and `targets/<id>.yaml`.
- The manual check passed and the result is in `checks/<id>.md`.
- If the jobhunt program is in the folder, the program check passes too (AGENTS.md "Program check").
- When you hand it over, say honestly who checked it (AGENTS.md red line 14) and that no second conversation has reviewed it yet.

You never produce PDF, Word or image files yourself: the jobhunt program's resume page does. If they want Word (or want to edit the text by hand), tell them to click "Download Word file" on the program's resume page, and say: "The Word file has the same words as this resume now, but anything you change in Word is no longer checked by the program, so check it yourself." With no jobhunt program in the folder, say a Word file is not possible this time; only the HTML resume file exists, and the browser can save it as a PDF.

## 1. Check the conditions (1 to 5: if any fails, stop; 6 is a question for them)

1. `targets/<id>.yaml` exists. If not, do `tailor-resume.md` first. If they want a general resume for no particular job, use id `general` and `targets/general.yaml`. It still goes through `tailor-resume.md` steps 4 to 6: the summary is in `targets/general.yaml` and asked in `confirm`.
2. `confirm` is empty, and every `bullet_overrides` entry and the `summary` has a "yes" in `answered`. If not, finish the questions (`tailor-resume.md` step 5).
3. Every bullet that will print has `source: S-xxx`, and `me/stories/S-xxx.md` has `status: confirmed`. If one does not: stop, say which bullet, and ask them to confirm it first (cards in `dig-experience.md`).
4. The bullet sentences and titles in `resume.yaml` are word for word the same as "## Sentence at confirmation (do not change)" in that story. If they differ: show the difference, re-confirm with a card, and do not pick a version yourself. Self-attested stories are compared with the vouched old-resume text copied into that section.
5. Education given in another language, or translated or reworded by you, and not yet confirmed on a card: stop and show that card first (`dig-cards.md`, "Basics on the first card"). Placeholders in `basics` or education (an empty name, "[School]" and so on): ask what to put. If they cannot or will not say, make the file anyway and say: "The resume will print '[Name]', so it can't be sent as is." The manual check records "failed: placeholder". (The "stop" in step 3 does not apply to this one.)
6. **Inventory unconfirmed experiences** (this does not block; they decide). Look in `me/stories/` for `status: draft` (not `deleted`). If there are any, ask in one message:
   "N experiences are not confirmed yet: <name (code)>, <...>. Confirm these N first (a fuller resume), or make the file now (without them)?"
   List the names on one line. Add "(you said skip for now)" after a name whose "still to ask" says they skipped. With an option tool, use options "Confirm these N first" and "Make it now".
   - **Confirm first**: for stories where the sentence is written, "still to ask" is empty or only "for interview prep", and the card has no yes/no questions, use quick confirmation: with the option tool, up to 4 cards at once, each its own question with the whole card inside (`dig-experience.md`), options "confirm S-003", "change it", "delete S-003". No "confirm all" and never merge cards. Record clicks per AGENTS.md "Tap, don't type", each saved separately. For "change it", fix one by one and show a new card. Everything else (still-open questions, yes/no on the card, no option tool, helping someone else) goes one card at a time per `dig-experience.md`. When done, return to `tailor-resume.md` step 4 to place the new bullets (rewordings go back to step 5), then start again at step 1.
   - **Make it now**: go ahead, note which N were left out, and say so when handing over (step 6).

(There is no template question: the template is always `us`.)

## 2. Work out what the resume prints

From `resume.yaml` and `targets/<id>.yaml`, by these rules (the program uses the same rules):

- **Start**: everything in `resume.yaml` in the `en` variant. An item with `variants:` that does not include `en` does not print. Bullets of a story with `status: deleted` do not print.
- **Section order**: `variants.en.sections`, else `sections` in `resume.yaml`. A section with no content is not printed at all.
- **Summary**: only the `summary` in `targets`. None: no Summary section.
- **Education**: `education` copied as is, at most 2 to 3 entries, newest first. GPA, coursework or honors only if `resume.yaml` has them (the user said them and confirmed them).
- **Experience** (`experience`): if `bullet_order` lists any bullet of an entry, print only the listed bullets, in the listed order. If it lists none of that entry's bullets, print all its bullets from `resume.yaml`.
- **Projects & Activities** (`projects`): if `bullet_order` lists any project, print only the listed ones, in the order they first appear. If it lists none, print all.
- **Bullet text**: the `bullet_overrides` entry for that `id` if there is one, else the `resume.yaml` sentence.
- **Title**: if `role` is an empty string, delete the whole `<span class="role">` (or it prints a dangling ", ").
- **Dates**: exactly as `dates` in `resume.yaml` ("May 2024 – Aug 2025", "Expected May 2027", "Present"). No change of format. An empty string: delete that date div.
- **Skills & Certifications**: if `skills_order` exists, print each line with the items word for word; otherwise use `skills` from `resume.yaml`, one category per line, items separated by commas. A line whose `items` is empty does not print.
- **Basics**: name, phone, email and "City, State" from `basics`, and a link such as `linkedin.com/in/xxx` as visible text if `basics.links` has one. Delete the whole `<li>` of anything missing. No street address.

**Copy only; never add.** Do not add: skills you thought of, requirements the posting wants that they lack, adjectives like "passionate learner", school names they did not give, titles you translated yourself.

**Never print**: date of birth, photo, marital status, gender, age, nationality, visa or work-authorization status, SSN or any ID number, street address. If they ask for one anyway: "US employers don't need that on a resume." Visa words (F-1, OPT, CPT, H-1B, visa, sponsorship, work authorization, green card) never appear on the resume. Work authorization is answered on application forms (`work-authorization.md`).

**Amount check (thin-resume warning)**: if an experience prints only 1 bullet, or experience and projects together print fewer than 6 bullets (probably under half a page), say this before writing, in at most 6 lines:
"This resume is a bit thin: <Campus bookstore job (S-003)> has only 1 bullet. I can add: <at most 2 concrete next steps>. I won't pad it with words. Add first, or make it as is?"
If they used self-attestation or said "just do it", don't ask: make it, and add one reminder line to the hand-over ("if you want more, tell me ___").
- Pick next steps from: the fixed follow-up questions not yet asked (result question first, `dig-experience.md` section 4.0), the story's "still to ask", unconfirmed experiences, and the "needs your decision" items you can find under `dig-experience.md` section 6.2. To add to a confirmed experience, set it back to draft and re-confirm (`dig-experience.md` section 9).
- They choose to add: follow `dig-experience.md`, then back to `tailor-resume.md` step 4, then here. They choose as is: go on, and do not warn about this resume again.
- Never add words, split sentences, repeat the same thing or add adjectives to fill space.

## 3. Manual check (check first; write the file only if it passes)

Use AGENTS.md "Manual check" on **every printed line**, not only the reworded ones. The only numbers you need not trace are the kinds AGENTS.md lists (calendar dates, phones, emails); every other number must match the original words of the source story. For a self-attested story the original words are the vouched old-resume text: numbers and verbs that match are fine, but wording, sentence shape and placeholders are still checked, and anything you changed or added must have been asked (`import-resume.md`).

Problem found: go back and fix `targets/<id>.yaml` (never the HTML), ask again (`tailor-resume.md` step 5), recompute and recheck the whole thing. At most 3 rounds; then stop, say where it is stuck, write no file and do not say it passed. Exception: if the only failure is a placeholder they chose (step 1 point 5), write the file, record "failed", and say "this one can't be sent as is".

## 4. Write the `## Resume file` section of `checks/<id>.md`

Always write it, passed or not. Replace only `## Resume file`; leave the other sections (`## Tailored resume`, `## Review`) alone. If the file does not exist, create it; the first line is fixed:

```markdown
# AI manual check (not the program check)

Job: <Company> <Title> (id <id>)

## Resume file

- Checked at: 2026-10-09 14:30
- Scope: every sentence printed in resumes/<id>.html
- Checked by: the AI, line by line by hand, not the jobhunt program
- Compared with: resume.yaml, targets/<id>.yaml, confirmed stories in me/stories/
- Reviewed in another conversation: not yet (the reviewer writes it under "## Review")
- Result: passed (or: failed, N items to fix)

### Numbers
- "3 days" in "Worked 3 days a week ..." <- S-001 "three days a week": found, same thing
- "<number>" ... -> no source: delete it or ask the user

### Meaning and titles
- Each sentence equals the sentence at confirmation (or list the extra words)
- Titles match the card

### Wording
- No banned or filler words, no unbacked self-praise (or list the words and sentences)

### Sentences
- No semicolons, at most one pair of parentheses (or list which sentence)
- Bullets over about 35 words: (none / list)

### Sources, placeholders, visa and ID words
- Source of each bullet: <first words> -> S-003 (confirmed 2026-10-09; self-attested: "self-attested 2026-10-09")
- Placeholders: none (or list "[Name]" and so on)
- Visa and ID words: none

### Amount and unconfirmed experiences
- Unconfirmed experiences left out: none (or N: S-004, S-006; they chose to go ahead)
- Thin-resume warning: none (or: warned that S-003 has 1 bullet; they chose to go ahead)

### Not checked
- Real layout and page count: the user opens the file and looks (US Letter, 1 page)
```

## 5. Create `resumes/<id>.html`

1. Use `templates/resume-us.html`. Only read the template; **never edit anything in `templates/`**. If the file is missing, stop and tell the user the template is missing (do not use another template).
2. Replace each double-curly-brace slot using the comments in the template. Copy repeating blocks (each school, job, bullet) as the comments say. **Copy the template's `<style>` and `<script>` blocks verbatim**: comments, spaces and line breaks too. The program compares these two blocks character by character; one missing comment fails it. Leave the template's own comments as they are, but no double curly braces may remain in the saved file.
3. In text, write `&`, `<`, `>` as `&amp;`, `&lt;`, `&gt;`.
4. No photo and no `<img>` at all (the template has none).
5. Save as `resumes/<id>.html`. Read it back and confirm: no `{{` left, no line starting with "Source:" printed, and every sentence is identical to what step 2 worked out. If the program is in the folder, run `check <id>` (AGENTS.md "Program check"); if it fails, go back to step 3.
6. Names of schools, employers and clubs, titles and sentences are the English ones from `resume.yaml` and the confirmed cards. If something is missing, ask the user; do not translate it yourself.

## 6. Hand it over (plain, short, in this order, at most 14 lines)

When helping someone else, say her name instead of "your".

1. "Your resume file is ready. It's in the resumes folder of this folder, named <id>.html (the <company> <title> one)." If the id is a date and a number, add "the number in the name is the 1st job on 10/9". Do not send them to read the checks file; say the result in one sentence: "I checked the numbers, wording and sources by hand and found no problems. This is an AI manual check, not a program check. One last check is still needed (point 6)." If it did not pass, say where it is stuck instead of "no problems". If the program printed "passed" for this one: "The program check passed, and I also checked meaning and titles line by line. One last check is still needed (point 6)."
2. How to open it: "On Windows, double-click it. On a Mac, right-click it -> Open With -> Google Chrome (or Safari if you have no Chrome)."
3. Page count (say this every time, word for word): "A US resume should be one page. After you open it, look at the yellow note at the top. If it says the resume runs past one page, tell me and I'll cut the least relevant bullet. You can still send it, but one page is strongly recommended." If they chose "make it as is" in step 1 point 6, add: "This one leaves out N unconfirmed experiences: <names>. After you confirm them, say 'redo the resume file' and I'll add them."
4. Saving as PDF: "Follow 'Save your resume as a PDF' in START-HERE. Save it to Downloads, not back into this folder." If a phone or email is printed, add "the PDF contains your contact details". Do not write your own print steps.
5. They say it runs over one page (or the yellow note does): list the 2 or 3 least relevant bullets and ask which to remove; take them out of `bullet_order` in `targets/<id>.yaml` and redo from step 2. Never shrink the font or change the template. If they want to keep the bullets, keep them; it does not block.
6. The final check (say it only if this conversation has not already): "Before you send it, **open a new conversation** (in Cowork, add the folder and paste the opening prompt again) and say 'review my resume for <company>'. The writer misses things the reviewer will see." Fill in the company name.
   If the jobhunt program is at the top of the folder (`jobhunt.exe` or a file starting `jobhunt-mac-`), always add: "After you send it, open the app (double-click jobhunt in the folder), go to its "Resumes" tab and press the button that saves a copy of this resume as the one you sent. If the tracker still says 'To apply', it changes to 'Applied'. Telling me in the chat only updates the tracker and does not keep the version you sent, so the button is the one that matters for that." (Never leave this out to save lines; describe the button, do not quote its label, which may be in another language.) **Look in `data/applications.csv` first.** Say the last sentence (the status change) only if a row has this `job_id` (or `resume_version: targets/<id>`) and still says `todo`; never say the status will change unless that row exists. If there is no such row at all, the button would fail: add the row first per `tailor-resume.md` step 4 (tell them in one line), or, for the `general` resume, leave out the whole button paragraph. No program: skip it.
   Do not say "I won't tell you it's ready until it's reviewed". Whether the job is worth applying for was in the fit analysis; here you only say the resume file needs one more check.
