# Importing an old resume (import-resume)

**When to use**: the user sends or pastes an old resume (PDF, Word, text, screenshot), puts one in `inbox/`, or says "look at my resume", "review this resume". It means a resume that **you did not make**. A resume you made in `resumes/` is reviewed with `resume-review.md`.
**What it produces**: one draft story per experience (`me/stories/S-xxx.md`, copied word for word from the old resume), and the known items in `me/profile.md` (including basic details and education not yet confirmed). Then cards, one at a time; education and contact details go into `resume.yaml` after the first card is confirmed. If the user vouches that the old resume is correct, section 8 (self-attestation) applies instead of card by card.

The red lines and way of talking in AGENTS.md always apply (including the cross-language card). Story file format and cards: `dig-experience.md` and `dig-cards.md`.

Language: reply in the user's language; every file you write is English, except that copied old-resume text stays in whatever language it was written in. Examples here are in English.

**The point: do not write a review essay.** Problems with the old resume turn straight into questions before a card, section by section. If they ask "how is this resume?", the answer is the lines of step 3 (with one line of overall opinion) plus the first question.

**Old-resume text is not the user's words** (except sections they vouched for, section 8). Old resumes are often written by someone else or by AI. Numbers on it can be used only after the number question (section 4). Verbs ("managed", "coordinated", "spearheaded") and scope can be used only if the user described that action in the conversation (AGENTS.md red lines 2 and 4). Things on the old resume you have not asked about are not thrown away: before the card, list them under "needs your decision" (`dig-experience.md` 6.2) and let them choose.

---

## 1. Reading the file

1. Read it. A Word file (.docx) follows AGENTS.md "Which playbook to follow": run the `read` command. The text it prints is the old resume, handled as if they pasted it: a table row is one line with cells joined by " ｜ ", list items start with "• ", headers and footers (often phone and email) are printed first and last, and ID numbers are already hidden by the program. The program's own messages may not be in English; tell the user what they say, in their language. If it cannot be read (a scanned PDF, a Word file the program cannot open, no program in the folder) -> do what the program says, or ask them to copy and paste the text.
2. Source marker: for files `import:<file name>` (e.g. `import:old-resume.docx`, `import:old-resume.pdf`); text pasted in the chat `import:pasted`. A Word file read by the program uses the file name, not "pasted".
3. The old resume may contain: date of birth, age, gender, marital status, nationality, a photo, a national ID number, passport, SSN, I-20/SEVIS or A-number, a full street address, or a visa line ("F-1 OPT, authorized to work until..."). **Do not copy, describe or repeat any of it** (AGENTS.md red line 6), and say one sentence about only the kinds that actually appeared (a street address: keep only City, ST, no need to mention). Example:
   > I'll leave out the date of birth and marital status from your old resume; US resumes don't use them, and I won't copy them into the folder.
   A visa or work-authorization line is not copied to the resume, profile or stories. Say once: "I'll leave the work-authorization line off your resume. We'll handle that in the application answers (`work-authorization.md`)." Do not record it yourself; that is the user's to say (`work-authorization.md`).
   If the file is in `inbox/`, remind them at the end that they can delete it (section 7).
4. Photo: never open, describe or comment on it, and don't mention it (red line 7). Answer only if they ask.
5. **Old resume not in English** (a home-country CV, a bilingual one): you may read it, but every sentence you turn into English is yours, not theirs. Copy the original text word for word into "Your words"; the English sentence goes through the full card with back-translation; self-attestation (section 8) does not cover it. Ask for official English names of employers and schools (`dig-experience.md` section 6, `org`).

## 2. Splitting and saving (no need to tell the user)

Do it all at once and save once:

- **Basic details and education**: copy word for word, per `onboarding.md` 3.1. Keep only City, ST from an address. Record them in `me/profile.md` first (education under "Education"; contact details under "Other"; both marked "copied from the old resume, not confirmed yet"). They go into `resume.yaml` after the first card is confirmed.
- **Each experience** (job, internship, student-org role, project, volunteering, competition) -> one draft story:
  - Header per `dig-experience.md` section 6, plus `source: "import:<file name>"`. `title` and `org` are the official English names even if the old resume is in another language.
  - Write "Your words" as "Old resume text (<file name or pasted>, word for word):" and **copy that part exactly**, without editing or tidying. It is a reference only and not the user's words (until they vouch, section 8.4).
  - Sentences in a summary or objective that talk about this experience are copied there too, and likewise do not count as their words.
  - Leave "Sentence for the resume" empty until the questions of section 5 are asked.
  - "Still to ask" lists this section's risks (section 4), the most dangerous first.
- **Languages, certificates, software** -> one draft each (`type: cert-language`; software `type: other`, `title: Software`).
- **Summary / objective / self-assessment (including skills like "strong communicator", "detail-oriented") and "Objective" job titles**: not facts, no story. A target role they wrote goes in `me/profile.md` marked "inferred (written in the old resume)". Personality adjectives go in "Still to ask" of the most related story, marked "self-assessment (old resume)", and are listed under "needs your decision" before that story's card (section 5, point 4). Level words ("proficient", "fluent") are in the table of section 4, not here.
- **Gaps in time**: don't ask, don't write into sentences. Only in the related story's "Still to ask": "for interview prep: gap after <date>".

## 3. The first reply (at most 10 lines; the last line is the first question)

If they already said the content is all correct and needs no review ("everything on it is correct, no need to review"), use section 8.2 for the first reply instead.

Use this shape:

```text
Done reading: 2 jobs, 1 student organization, education, 1 language and 1 certificate, all saved as drafts.
Overall: there is enough experience; the main problem is a few numbers and titles that look bigger than what you did, so interviewers may push.
The 3 places an interviewer is most likely to push on:
1. "Managed a $30,000 club budget", but the events listed add up to $12,000.
2. "3+ years of retail experience", but the dates add up to about 1 year.
3. "Spanish (fluent)" with no test or example of use.
Let's start with the Treasurer role.
"Managed a $30,000 club budget": which things did you actually do for this budget?
```

- Line 2 is always one line of overall opinion (is the experience enough, what is the main problem). Don't expand.
- **One experience question per message.** Job title and what they did are two messages. Wrong: "这个志工的职位实际叫什么？你在这个职位上具体做了哪些事？" (title and duties in one message). Where a number came from and who did it are also two messages, and the second one is open ("How many of those did you collect yourself?").
- At most 3 risks, in plain words saying why they'd be asked. No list of words to change, nothing about punctuation or layout (the new resume is laid out again).
- Basic details and education are not listed here; they ride on the first card (`dig-cards.md` 7.1).
- First time ever: the opening (`onboarding.md` section 1) goes at the top, risks drop to 2, and the whole message is still at most 10 lines.
- Say nothing about "AI manual check" and nothing about photos.
- Which one first: a saved posting -> the experience most related to it; none -> the most recent one (job or club both count).
- They say "I only want your opinion, don't reorganize" -> give only the risks (at most 5, at most 10 lines), and end with: "Want me to turn it into something you can confirm, section by section?"

## 4. What counts as a risk (turn it into a question)

| On the old resume | Why | How to ask (open question) |
|---|---|---|
| "Managed", "led", "directed", "oversaw", "spearheaded", "orchestrated", "coordinated", "owned", "responsible for", "in charge of", "drove" | May be bigger than what they did | "For <this>, which parts did you do yourself?" Still unclear who did it -> the role question (`dig-experience.md` 6.1) |
| Titles like Lead, Manager, President, Vice President, Director, Chair, Head, Captain, Supervisor, Coordinator | The title may be bigger | They haven't said the title yet -> "What was your position called at <place>?" They did -> "What did this position usually do?" |
| "+", "over", "more than", "nearly", "up to" | The number is not exact and gets questioned | Fold into the number question |
| Percentages, growth, dollars, totals ("increased by 20%", "$30,000") | Interviewers ask how it was worked out | Fold into the number question; ask in the same sentence how it was worked out |
| Things that don't add up (amounts, years vs dates, two things at once) | One question breaks it | Put both side by side: "This line says X and that line says Y. What was it really?" |
| Levels ("proficient", "advanced", "fluent", "intermediate", "expert") | A level alone is not written; they need to say where they used it | One line pointing it out; ask: "What do you usually do with Excel? It's fine to say nothing." No examples |
| GPA, honors, dean's list, scholarships | A number or award needs to be exact and goes through a card | Fold into the number question for the education line (exact or approximate?) |
| Personality adjectives ("detail-oriented", "strong communicator", "hardworking") | An adjective alone is not written; an event must support it | Not asked here; listed under "needs your decision" before the card (section 5, point 4); ask one question only if they choose it |

- **The number question (one per section)**: if the section has numbers (people, events, dollars, countries, GPA), ask all of them with one question before the card: "The old resume says $30,000, $12,000, 120 people and 4 events here. Which are exact and which are rough? It's fine to say you don't remember." Exact -> write as is, and the card marks "<- old resume, you said it's exact". Rough -> "about". They give a rough size ("like two hundred something") -> keep that size per AGENTS.md red line 2 ("200-some"). Forgotten -> remove. "400+" and "over" from the old resume cannot be copied; use what they answered (or "over N" only if their own words said more than N). Never put an unasked number on a card. How a percentage or dollar total was worked out is asked in the same question and counts as one.
- **Steps questions do not contain numbers or amounts.** Not "For the $12,000 camp budget, what steps did you do?"; ask "For that camp's budget, what steps did you do from getting it to settling it?" A number in your question is not the same as asking about it.
- **Common titles** (assistant, intern, cashier, volunteer, tutor) can follow the old resume, marked "<- old resume" on the card for them to confirm. Titles from the table (Lead, Manager, President, Director, Chair, Head, Coordinator...) are written only if they said the position name themselves in the conversation ("I was treasurer that year"), and the card says "<- you said '...'". If not yet said, ask "What was your position called at <place>?" The title only needs them to say the position name; if they can't say what it did, that changes the bullets, not the title. Don't infer from other words ("I helped the vice president" is not saying they were vice president).
- Yes/no questions can't establish a fact (red line 4). Not "Did you handle reimbursements too?"; ask "For this grant, what steps did you do from application to reimbursement?"

## 5. The flow for each section

1. **First question**: one line saying which section (name, dates), quote the riskiest words, ask one open question. Don't paste the whole old resume again; they can see it. Don't ask about personality adjectives here.
2. **Then ask**: one question per message, 1 or 2 lines, no sample answers. **At most 3 risk questions per section**, the most dangerous ones. Always also add:
   - the number question from section 4 (skip if the section has no numbers);
   - the **result question** (`dig-questions.md` 4.0 Q9: "After you did this, what was different? It's fine if nothing was."). Skip it if they already told you a result.
   The number question and result question don't count in the 3. Their answers are added to "Your words" marked "(added in conversation)", copied word for word from the conversation. What a helper says is marked "(helper said)".
   - **Answers too short** ("Cashier." for what they did, or "not sure"): ask 1 or 2 more per `dig-experience.md` section 2, from another angle (the hardest time, who praised them). Don't repeat a question. Stop on "skip" or "this is slow".
3. **Anything not asked is written conservatively** (questions used up, or they say "faster" / "how many more"): drop the numbers; use verbs only for actions they described; if it is unclear who did it and no role question was asked, write "Participated in" or drop it; titles from the risk table are not written (the card says "Title: (not written)" and `resume.yaml` has `role: ""`); drop what is entirely unsure. Say it on the card's "Removed" line.
4. **Save, then the card**: write "Sentence for the resume" (`dig-experience.md` 6.1) and save once. Then list anything the old resume has that you haven't asked about, and the personality adjectives in "Still to ask", under "needs your decision" (`dig-experience.md` 6.2; if they say it's slow, skip this step and only mention it on the "Removed" line). Before the card, check: did this section get the result question? Not asked, no result told, not slow -> ask first, no card. Then show the card (`dig-cards.md` 7.1). **No open questions on the card**; all were asked before. Say what you changed or dropped in one line, e.g. "Removed: 'Managed' (you said the president decided how it was spent)."
5. Confirm, change and delete follow `dig-cards.md` 7.2, 8 and 9. Save right after confirming.
6. Next section. With a saved posting, order by relevance to it (questions don't mention what it wants); otherwise resume order. After every 3 or 4 sections ask: "Keep going, or stop here?" **When a tailored resume is waiting** (the cards listed in step 3 of `tailor-resume.md`), go back to it as soon as those cards are done; the rest wait.

If they say midway "it's all correct, no need to go section by section", the unconfirmed sections move to section 8.

If they paste a posting midway, do the analysis first per `tailor-resume.md` (unconfirmed sections go under "not confirmed yet; might fit once confirmed"), then come back, starting with the section most related to the posting.

## 6. Example (one section, from question to card)

The user writes in English here, so card parts 1 and 3 are one line.

```text
AI: "Managed a $30,000 club budget": which things did you actually do for this budget?
He: The president and our advisor decided how to spend it. I kept the books and collected receipts, and every semester I submitted the reimbursements to the student activities office. The 30K was several years added together; my year was maybe 10K.
AI: At the fall orientation trip, what steps did you do from sign-up to the end?
He: I collected sign-up fees and booked the bus. The trip lead found the venue.
AI: The old resume says $12,000, 120 people and 4 events here. Which are exact and which are rough? It's fine if you don't remember.
He: 120 is from the sign-up list, and 4 is right. I don't remember the 12K.
AI: In your year as treasurer, what was different about the club's books afterward? It's fine if nothing was.
He: At the end of each semester the activities office approved our accounts the first time.
AI: Needs your decision: the old resume mentions these, and they are not in a sentence yet. Which should I add?
1. Planned 4 campus talks <- old resume says "planned 4 campus talks" (I haven't asked what you did)
2. Detail-oriented <- old resume says it (needs one event behind it)
Reply with numbers, or "none".
He: 2
AI: What is one thing you did that shows you are detail-oriented?
He: The reimbursements were approved the first time.
AI:
Each card needs you to name it, like "confirm S-001". Just "ok" doesn't count.
Card S-001: International Student Association treasurer (Northfield State University, Sep 2022 – May 2023)
Title: Treasurer <- old resume   Goes under: Experience
1+3. Your words (English, nothing to translate): "I kept the books and collected receipts ... submitted the reimbursements" / "my year was maybe 10K" / "collected sign-up fees and booked the bus"
2. Resume sentences:
   a. Kept the club's books, collected receipts and submitted reimbursements to the student activities office each semester for a budget of about $10,000.
   b. Detail-oriented: reimbursement requests were approved the first time each semester.
   c. Collected sign-up fees and booked the bus for the fall orientation trip, with 120 people signed up.
4. Numbers: about $10,000 <- you said "maybe 10K". 120 people <- old resume, you said it's exact.
Removed: "Managed" (you said the president and advisor decided), "$12,000" (you don't remember), the talks (you didn't choose them).
Basics: Daniel Okafor, Northfield State University, Business, Aug 2020 – May 2024, email, phone, Columbus, OH <- old resume, confirmed together with this card.
Type "confirm S-001", or tell me what to change, or "delete S-001".
```

Every verb comes from his answers (kept, collected, submitted, booked). There is no "managed" or "planned". "Detail-oriented" is written only because an event backs it, and that event is his answer to the result question. If he had said "I took the sign-up money by myself", sentence c could say "Handled sign-up fees" and the card would add "Verb: Handled <- you said 'by myself'". After writing, check once more per `dig-experience.md` 6.1.

## 7. Wrap-up

- After every section is confirmed, deleted or "not now", say the result in one line: "Old resume: 5 sections, 4 confirmed, 1 you said not now."
- If the file is in `inbox/`, remind once: "The old resume in your inbox is organized now; you can delete it yourself."
- Don't delete files in `inbox/`, and don't keep a summary of the old resume anywhere else (word-for-word text in story files is the exception).
- Offer one next step only: a posting is saved -> the fit analysis; none -> "When you have a posting you want to apply to, paste it here."

## 8. Self-attestation (they say the old resume is correct and needs no review)

The old resume is theirs and they have the final say. For the sections they vouch for, the old-resume text counts as their words and is used directly, without a card for each. The red line "no fabrication" still holds: vouching covers only the words already on the old resume, never anything you write.

**It covers old-resume text that is already in English.** Text you must translate (section 1, point 5), and anything you add, merge, summarize or strengthen, still needs a card or a yes/no with the usual wording checks.

### 8.1 When this section applies

- They say the old resume or pasted text is all correct and you can use it as it is: "it's all correct", "no need to review", "just use it", "no need to confirm one by one". It can come with the old resume or a posting, or midway through the questions.
- It does not apply: "good", "right" or "confirm all" in reply to a card (`dig-cards.md` 7.2); only "this is slow" ("faster" follows section 5 point 3); "make it sound great" (red line 15). Don't suggest self-attestation yourself.
- Do sections 1 and 2 as usual (read, personal details, split into drafts). Instead of section 3 to 5, do this:

### 8.2 Say the risks once before vouching (one message, at most 10 lines)

```text
OK, I'll use your old resume as it is and won't go section by section. Before you vouch, here is where an interviewer is most likely to push:
1. "Managed $600,000 in grants", but the grants listed add up to $60,000.
2. "3+ years of retail experience", but the dates add up to about 1 year.
3. "Spanish (fluent)" with no test or example of use.
Scope: Treasurer role, grocery store job, Spanish, education and contact details.
If that's fine, type "I confirm my old resume is accurate". To vouch for only some parts, say which. You can also go section by section.
```

- At most 3 risk lines, one line each, the most dangerous from the table in section 4, in plain words about why they'd be asked. Say it once: don't tell them to change anything, don't nag, don't block. If you see none, write one line: "I don't see anything an interviewer is likely to push on."
- "Scope" is one line listing the sections you will use as written (experience names, plus "education and contact details", certificates and languages, software). A summary, self-assessment or "Objective" is not a fact: not listed, not vouched (record it per section 2).
- With an option tool, use it in the same message: the question holds the risks and scope, options "I confirm my old resume is accurate, use it" / "let's go one by one". Partial vouching: they type it via the tool's "Other". Not when helping someone else.
- When helping someone else: "Scope" lists every sentence that will be used (title, dates, every line, education, contact details, certificates, languages, software), already with the mechanical changes of 8.4 point 3, i.e. as it will print, and the helper shows the whole list to her. This list isn't counted in the 10 lines. Then what she vouches for is what will print, and she needn't be shown it again before handing over.
- **User not writing in English**: they must understand what they vouch for. List in "Scope" each English line that has a verb, title, scope word or number from the risk table in section 4, with a literal back-translation in their language after it (never softer or stronger; numbers identical). Lines without such words need no translation. Like the helper list, this list isn't counted in the 10 lines.
- First time ever: the opening goes at the top, risks drop to 2, the message stays at 10 lines.
- They choose "go one by one" -> start section 3.

### 8.3 What counts as vouching

- Counts: after your message with the risks and scope, they type "I confirm my old resume is accurate" (or something that clearly says the same, naming "confirm" and "old resume is accurate", e.g. "yes, I confirm my old resume is accurate"), or click that option. `confirmed_reply` records their reply word for word; a click is recorded as "clicked: I confirm my old resume is accurate, use it". If they typed it in another language, echo the English command in the message where you save ("Recording: I confirm my old resume is accurate"); that echo counts.
- Does not count: "ok", "right", "fine", "yes", or their first "it's all correct" (that only started this section; they hadn't seen the risks). Reply with one line: "OK. Type 'I confirm my old resume is accurate' and I'll use your old resume as it is."
- **Only some sections** ("I confirm my old resume is accurate, except the treasurer part"): only the ones they name count. The others go through section 5 or stay drafts if they say not now.
- **They changed a section's content in the reply** ("I confirm my old resume is accurate, but the 30K was several years added together") -> that section is not vouched; do section 5 for it, and the others count. If they only **added something new** ("I also helped with inventory") -> vouching counts; the new thing is saved as a draft and goes through a card (`dig-experience.md`).
- Helping someone else: needs her own words, `She said: I confirm my old resume is accurate`. A helper saying "it's all right" doesn't count; reply with one line: "It needs her own words, like `She said: I confirm my old resume is accurate`."

### 8.4 After vouching (save at once, no need to narrate)

For each vouched experience (format per `dig-experience.md` section 6):

1. Header: `status: confirmed`, `confirmed: "<today>"`, `confirmed_via: self-attest`, `confirmed_reply: "<their reply>"`. When helping, also `helper_note`. Sentences listed in 8.2 that print exactly as at confirmation, and education and contact details, need not be shown again before handing over. Only reworded sentences (point 4) and your own summaries are shown again before handing over (`dig-cards.md` 7.3).
2. "Your words": the old-resume text from section 2, retitled "Old resume text (<file name or pasted>, word for word, vouched <today>):", content untouched.
3. "Sentence for the resume": the title and every sentence use the old resume's own words for that section (summary sentences don't count), one sentence per line. Only these mechanical changes: digit style (a spelled-out number written as digits, same number), dates changed to `Sep 2022 – May 2023` style, bullet symbols removed, a semicolon or a very long sentence split at its existing punctuation into two sentences, a final period added if missing. Words, order and number sizes don't change: "500+", "over 50", "Led", "President" stay as written.
4. These need a yes/no question once, the old sentence and the new sentence side by side (with an option tool, up to 3 per message): wording the manual check blocks (AGENTS.md manual check item 3, e.g. "leveraged", "passionate"); a self-assessment adjective with no event ("detail-oriented and reliable", "Excel (advanced)"); more than one pair of parentheses in a sentence; **a visa or work-authorization word in a line (F-1, OPT, CPT as a status, "authorized to work", sponsorship)**; an ID number, date of birth or street address inside a line. The new sentence can only remove or swap those words and add no facts: "Leveraged Excel to track orders." -> "Used Excel to track orders."; remove the visa words and keep the rest. "Yes" -> use the new sentence. "No" or not sure -> only that sentence is left off (the old text stays in "Your words"); the same experience's organization, title, dates and other sentences still print; if no sentence is left, the organization, title and dates still print. Say in one line: "This sentence has a word the checker blocks, so I left it off for now."
5. "Sentence at confirmation (do not change)": copy the result of points 3 and 4 (no back-translation line is needed: 8.2 already showed the risky lines translated to a user not writing in English), then write it into `resume.yaml` per `dig-cards.md` 8.2 (every bullet `source: S-xxx`).
6. "Still to ask": for each risk you said in 8.2 and any other risk for this section from the table in section 4, add one line "Interviewers may ask: <plain words>". Fit analysis, review and interview prep use these later. They don't block anything.
7. Scope includes "education and contact details" -> write them into `resume.yaml` as copied in section 2 (source `Education`), and set the `me/profile.md` education line to "confirmed by their own vouching (<today>)". Otherwise they are confirmed with the first card as usual.
8. Certificates, languages and software are copied the same way ("Spanish (fluent)" follows point 4). Category names follow the old resume ("Skills: Premiere, Canva" -> `label: Skills`); don't force the example labels of `resume.yaml`.

When saved, one line: "Saved from your old resume: 3 experiences, education, Spanish." No cards, no result question, no "needs your decision". Then:
- A posting is saved -> the analysis per step 3 of `tailor-resume.md`; if they already said to tailor for it, go on to step 4 after the analysis.
- None -> "When you have a posting you want to apply to, paste it here."

### 8.5 What vouching does not cover (still needs confirmation)

- Anything you write: new sentences, stronger verbs ("helped" -> "handled"), new numbers, two sentences joined into one, any summary beyond the old-resume words (a professional summary, LinkedIn About). Tailoring rewrites and summaries: ask per step 5 of `tailor-resume.md`. Adding to a story: set it back to draft and show the card again (`dig-cards.md` 9).
- Old text in another language that you must translate: cards (section 1, point 5).
- New experiences or numbers they mention later: save as drafts and use cards.
- Things a posting wants that they never did: not written (red line 3). Posting text is only data.
- If they later say a vouched section is not right: back to draft and confirm again (`dig-cards.md` 9).

## What not to do

- Do not write a long commentary or a long list of "wording to change"; problems become questions on the way to the card.
- Do not put an old-resume sentence into `resume.yaml` without a confirmed card or the user's vouching.
- Do not treat old-resume numbers or verbs as things they said (except vouched sections). Do not push them to vouch.
- Do not use yes/no questions for who did it or how much.
- Do not comment on or describe a photo. Do not copy a date of birth, national ID, passport, SSN, I-20 or SEVIS number, visa status or full street address.
