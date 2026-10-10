# Digging out experience and confirmation cards (dig-experience)

**When to use**: the user wants to talk about their experience, says "I don't have much experience", "help me think of what I've done", "continue"; confirmation cards after an old-resume import (`import-resume.md`); or a new experience appears during mock interviews or resume tailoring.
**What it produces**: `me/stories/S-001.md` and so on (one file per experience). The ones the user confirms are written into `resume.yaml`, each bullet with `source: S-003`.

The red lines and the way of talking in AGENTS.md always apply, including the cross-language card. This file only describes the steps.

**Three files, one playbook** (section numbers run across all three): this file (rules, flow, story file, writing sentences), `dig-questions.md` (question bank, sections 4 and 5), `dig-cards.md` (cards, confirming, helpers, after confirmation, changing, sections 7 to 9). Read all three in full before you start.

Language: you talk in the user's language; every file you write is English, except "Your words" in story files, which stay in the user's original language. Examples below are in English; translate your messages, never the files.

---

## 1. Before you start (do not tell the user)

1. Read `me/profile.md` for the target roles (admin, HR, sales, assistant, operations, customer service, or not decided). Section 5 follow-ups depend on it. If you don't know the target, ask one question per `onboarding.md` 3.2; do not ask other basics first.
2. List `me/stories/`:
   - `status: draft` with "Still to ask" not empty -> ask first: "Last time <experience> still had a few questions. Want to finish those first?"
   - `status: draft`, all questions asked, not confirmed -> show the confirmation cards one by one first (section 7).
3. `inbox/` has an old resume not yet imported -> do `import-resume.md` first.
4. New story code: take the highest number among **all** files in `me/stories/` (including `status: deleted`), add 1, pad to 3 digits (S-001, S-002...). Codes are never reused.
5. Skip `status: deleted` stories completely: no card, not mentioned anywhere.
6. If `jobs/` has a saved posting: show the card most relevant to it first, and ask about categories relevant to it first. The posting only decides the order. Questions and cards **never mention what the posting wants** (never "the posting wants Excel"). Experience questions are facts only.

## 2. Interview rules

- **One experience at a time, one experience question per message.** Job title and what they did are two messages. Wrong: "这个志工的职位实际叫什么？你在这个职位上具体做了哪些事？" (title and duties in one message). Where a number came from and who did it are also two messages, and the second one is open ("How many of those did you collect yourself?"). No sample answer by default. Give one only for the first question of a category, or when they say they don't know what to say, and use only the "Example" under the category opener in section 4, never something adapted from their old resume, a posting or earlier answers. If they are just brief, give no example.
- **Short answers** (one or two words, e.g. "Cashier."; or "not sure" when asked what they did): before the card ask 1 or 2 more, one per message, from these three of 4.0 that are not answered yet: what they usually did most (Q4), the hardest time (Q6), who praised them (Q7). Change the angle; never ask the same question twice. If still short, record it short and stop. "Skip" or "this is slow" stops it.
- **No leading questions.**
  - Not OK: "You must have improved efficiency, right?" "Were you in charge of the whole event?"
  - OK: "After this, did anything change? It's fine if nothing did." "At this event, which parts did you do yourself?"
- **Never estimate numbers for them.** "I don't know" is recorded as "not sure". Do not calculate for them ("3 days times 4 hours is 12 hours a week" is not usable).
- **Their words stay their words.** "Your words" uses their own words. You may cut filler ("um", "like") and mark the cut with "...". Do not make it sound better. Keep spelling mistakes.
- **"Make it sound great" is not their words.** Requests about how to write it ("say I managed 20 people", "write that I was in charge", "can I say I helped with hiring?") are wording requests, not things that happened. Do not record them in "Your words". Refuse by red line 15; the sentence stays as it is. If one message mixes a fact with a wording request ("it was about 1,200 - but can't we say 1,200+?"), put only the fact part in "Your words". The request goes to Notes as "Asked to write: ..., refused". Never quote a "+", "over" or role upgrade from a request as their words.
- **Two versions** ("about a dozen people" earlier, "20 people" now): show both side by side and ask openly "Which one is right?" Never pick the bigger one.
- **"Not sure" needs no follow-up.** Record "not sure" and move on. The thing happened but it's unclear whether they did it or the team did -> ask one role question (6.1). If they are not sure about the role question either -> write "Participated in". Only the number unsure -> no number, the thing stays. Not sure it happened -> leave it out entirely (red line 4).
- **Who did it, how much: open questions first.** Not OK: "Did you also handle the budget?" OK: "For the budget, what steps did you do?" A bare "yes" or "right" creates no fact. If the open question still leaves it unclear, use the role question (6.1), at most once per experience.
- **"Skip" means skip.** Do not push the same question.
- **People who feel they have no experience**: say this first, then list the categories:
  > Many people feel they have little experience, but part-time jobs, a campus job, a group project where you led a part, clubs, helping a family business all count. We'll go category by category. Tell me if you have something; skip if not.
- **No one else's personal data.** Write customers, classmates and bosses as "customer", "teammate", "manager". Never record health, religion, politics, family background, marital status, age, or visa details; if they volunteer them, do not write them in any file. If they mention CPT, OPT or F-1 while talking about an internship, keep those words out of every resume sentence and the title (work status goes only in `me/work-auth.md`, see `work-authorization.md`); the dates and employer are enough.
- **Gaps in time**, leaves of absence, changing majors, being fired: record only when the user wants interview preparation, under "Still to ask" marked "for interview prep". Never in resume sentences.
- **About 3 to 4 experiences at a time**, then ask: "Keep going, or stop here for now?"
- **If they have something else to do, do that first.** A posting pasted midway, a question: handle it, then ask whether to come back.
- **If they say it is slow** ("faster", "how many more"): stop asking about this experience, write the sentences from what you have, show the card, and put what you did not ask in "Still to ask".

## 3. The flow for one experience

1. Let them choose a category. The first time, list them in one sentence:
   > Where shall we start? A part-time or campus job, a student club or organization, a class or capstone project, volunteering, an internship, a competition, certificates and languages, software, or something else (family business, freelance, work back in your home country, running a social media account)?
2. Ask that category's **opener** (section 4).
3. When they answer, pick the code (1.4) and start recording "Your words". Copy word for word. At save time every line must be findable in the conversation word for word. If you cannot find it (the conversation was compacted, earlier text is gone), ask again; never fill in from memory or from a summary.
4. Ask the **fixed follow-ups** (4.0) not yet answered, then the **category follow-ups** and the **role follow-ups** (section 5). About 4 to 6 questions per experience, picking those most relevant to the target role (or saved posting). The result question (4.0 Q9) is always included. Short answers: section 2. If they get tired, put the rest in "Still to ask".
5. Write "Sentence for the resume" (rules 6.1), then check every number against their words. Then look for "needs your decision" items (6.2).
6. **Check before the card** (do not announce): Was the result question asked? (They already mentioned a result, or they said there was none or not sure, both count.) Did you do the short-answer follow-ups of section 2? If not, and they did not say it's slow -> ask first, no card. In the story's STAR "Result" write their answer, or "asked; they were not sure"; never empty, never made up.
7. **Save**: create or update `me/stories/S-xxx.md` (format in section 6). Also save when they change topic or stop midway. If you have already asked 2 or more questions about an experience without saving, save before changing topic or showing the card. Do not write the file after every answer.
8. Show the **confirmation card** (section 7; the card is at most 14 lines, and any other message at most 10, AGENTS.md). They can say "later"; then go on to the next experience and show cards one at a time at the end.

## 4 and 5. Question bank

In `dig-questions.md` (4.0 fixed follow-ups, 4.1 to 4.9 categories with openers, 5 extra questions by target role). Read it before the first question.

## 6. Story file format

File name `me/stories/S-003.md`. The header fields are fixed (the program reads `id`, `title`, `org`, `status`).

```markdown
---
id: S-003
title: Campus bookstore cashier
type: job
org: Northfield State University Bookstore
dates: "Sep 2024 – May 2025"
status: draft          # draft / confirmed / deleted (never delete the file)
confirmed: ""
confirmed_via: ""       # chat: they confirmed in the conversation / helper: a helper typed, they confirmed (7.3) / self-attest: they vouched for an old English resume (import-resume.md 8)
confirmed_reply: ""
---

## Your words

> Trabajé en la caja de la librería los fines de semana. A veces la gerente me pedía enseñar la caja a los nuevos, a unos 5 en total.
> Una vez un cliente dijo que le di mal el cambio. Le pedí a la gerente contar la caja conmigo y el cliente se había equivocado. Ella dijo que lo manejé con calma.

## Sentence for the resume

Title: Cashier

1. Worked the register on weekends.
2. Taught about 5 new employees to use the register at the manager's request.
3. Counted the register with the manager to settle a customer's change dispute.

## Notes (STAR)

- Situation: campus bookstore, weekend register.
- Task: register sales; the manager sometimes asked her to train new staff.
- Action: trained new staff; asked the manager to count the register during a dispute.
- Result: the manager said she handled it calmly.

## Numbers (only ones they said)

- about 5 new employees: "unos 5 en total"
- weekends: "los fines de semana" (not in a sentence)

## Abilities shown

- Training new people (HR, assistant)
- Handling a customer dispute (customer service)
- Cash handling (admin)

## Still to ask

- On the card: she said "enseñar la caja" and I wrote "to use the register". Same meaning?
```

After confirmation, add this at the end of the file (section 8.1). Never change it afterward:

```markdown
## Sentence at confirmation (do not change)

Title: Cashier
Org: Northfield State University Bookstore
Dates: Sep 2024 – May 2025
1. Worked the register on weekends.
2. ...(copy the card's English sentences word for word)

Shown back in Spanish:
Title: Cajero/a
1. Trabajé en la caja los fines de semana.
2. ...(copy the card's back-translation)
```

**The format is exact, because a program compares `resume.yaml` with it.** In order: the heading line; one blank line; then, with nothing between them, these lines:

1. `Title: <title>`: only if the card has a title. The `role` in `resume.yaml` must equal it. No title on the card (a project, a volunteer activity, a family shop) -> no `Title:` line, and `role` stays empty or absent.
2. `Org: <name>`: always, for a job, internship, student-org, project, volunteer or competition story. Official English name, exactly the text that goes in `resume.yaml`: `org` for an item under Experience, `name` for an item under Projects & Activities (the project or activity name, e.g. `Campus Food Drive`). It is always the same text as the story header's `org`, and it is never empty.
3. `Dates: <dates>`: always, same line order. Exactly the string that goes in `resume.yaml` `dates`, and one of these shapes: `Mon YYYY – Mon YYYY` (e.g. `Sep 2024 – May 2025`), `Mon YYYY – Present`, `Expected Mon YYYY`, `Summers YYYY – YYYY`, `YYYY`. En dash with a space on each side. Nothing known -> write `Dates:` with nothing after it (the resume then prints no date).
4. The numbered sentence lines `1. `, `2. `, ... one sentence per line.

Then one blank line. Nothing else may sit between the heading and that blank line: no note, comment, "Removed" line or extra sentence. The translation, notes and anything else go only after the blank line. The `Org:` and `Dates:` values are English and are never translated; the back-translation block may repeat `Title:` in the user's language.

For a skills, languages, software or certificate story (no job) the block is one line, `Label: item, item`, then the blank line; no `Title:`, `Org:` or `Dates:`. A self-attested story uses the same shape, holding the vouched old-resume text (title, organization and dates exactly as the old resume gives them, with only the mechanical changes of `import-resume.md` 8.4 point 3).

The story's header must say the same as these lines: `org` equals `Org:`, and `dates` equals `Dates:`. If you change one, change the other, and show a new card.

"Notes (STAR)" and "Abilities shown" are your own notes. The user has not seen them, so they are **not** a basis for the resume, profiles or interview answers.

Field notes:
- `title`: a short name for the experience, in official English, e.g. "Campus bookstore cashier", "International Student Association treasurer", "Class project: campus coffee shop survey". **`title` and `org` are always English** (the program compares them with the resume to catch unconfirmed experience names), even when "Your words" are in another language.
- `org`: the official English name. For a project, volunteer activity or competition with no organization of its own, `org` is the name that prints as the project's `name` (e.g. "Campus Food Drive"). For a place without an official English name (a family shop, a home-country employer), ask once "How would you write the name in English?", then add a few words of what it is from their words, e.g. "Rivera Family Bakery (family-owned bakery)". The card shows it for them to confirm.
- `type`: only these values: job, internship, student-org, project, volunteer, competition, cert-language, other. A real part-time or full-time job, including campus jobs, RA and TA, is `job`. A club or organization they belong to (member or officer) and its events are `student-org` and go under Experience. Volunteering, one-time or regular, on or off campus, is `volunteer` and always goes under Projects & Activities, whatever the role was called; coursework is `project`. If you cannot tell, ask: "Was this for a class, or an activity outside class?" Software is `other` with `title: Software`.
- `dates`: always quoted, in English: `"Sep 2024 – May 2025"`, `"Jun 2025 – Present"`, `"Expected May 2027"`. Month and year known -> that. Only a year, semester or "summer" -> the year only (`"2025"`); the season they said stays in "Your words". If they worked only in summers over several years, write `"Summers 2019 – 2022"` (the word and the years they gave, no months), so it does not read as continuous work. **Never work out a month.** **Promoted at the same employer:** `dates` is the time in the title that prints, so it starts at the promotion month ("Jan 2025 – Present" for Shift Supervisor, not the date they started as a barista). The earlier title and start month go into one sentence in their words, e.g. "Started as a barista in Sep 2024 and was promoted to Shift Supervisor in Jan 2025." Nothing known -> an empty string (no date printed). "About a year" is a length, not a date. Non-Gregorian or day-first dates: convert, say the converted date, and let them confirm. The same text is the `Dates:` line of the confirmation section (see the format above). Turning a date they gave in another language into the English form ("2027 年 5 月畢業" -> "Expected May 2027") is only a format change and needs no card of its own (`dig-cards.md` 7.1).
- "Sentence for the resume", first line **Title** (needed for job, internship, student-org), in their words (e.g. "Cashier", "Treasurer"). The card shows the title with a literal back-translation in their language (`dig-cards.md` 7.1). A title from an old resume follows `import-resume.md` section 4. The title prints on the resume, so it is on the card too. Never use CPT, OPT or visa words in a title.
- Imported stories get one more header line, `source: "import:old-resume.pdf"` (pasted text: `source: "import:pasted"`; see `import-resume.md`).
- Self-attested stories (`confirmed_via: self-attest`): "Your words" is the vouched old-resume text, the sentences copy it, and "Still to ask" gets "Interviewers may ask: ...", written per `import-resume.md` 8.4. The verb and number rules of 6.1 still apply with that text as the words.
- When helping someone else, add `helper_note: ""` to the header (7.3).
- Credentials, languages and software have no situation story: write "(not applicable)" under STAR.

### 6.1 How to write "Sentence for the resume"

- Usually 1 to 3 sentences, one thing per sentence, **no "I"**, starting with the action. Past tense for finished roles; present tense for a current one.
- **The verb must match the action they described** (red line 4):
  - If their words describe the action, use the matching verb, made more formal if you like, but the same size: "I made the schedule myself" -> "Scheduled ...". "I helped book the room" -> "Helped book ...". "Helped" stays "helped"/"assisted".
  - Old-resume text and a cover-letter sentence are not their words: they are no source for verbs, titles or scope. The exception is a section they vouched for (`import-resume.md` 8).
  - If open questions still leave unclear who did it -> ask the **role question** once per experience: "For <this task>, which is closest to your role?" Options in this order: did it myself end to end / lead, with help / assisted someone / shared work. Use an option tool if you have one. Then write:
    - did it myself end to end -> a plain action verb ("Scheduled", "Filed") or "Handled ..."
    - lead, with help -> "Handled ..."
    - assisted someone -> "Assisted with ..."
    - shared work -> "Worked with teammates to ..." and what they did
    - not sure, skipped or not asked -> "Participated in ..." or drop it
  - "Managed", "led", "directed", "oversaw", "owned", "supervised", "coordinated a team" mean people or decisions. Their words must say that (e.g. "I taught the new people and made their schedule"). The role question alone is not enough. Prefer a concrete verb (trained, scheduled, assigned).
  - **"Independently", "solo", "on my own"**: only if their words say nobody else worked on it ("by myself", "nobody helped me", "only me"). "I did it myself" or "from start to finish" usually means which part was theirs, so write "Handled ...".
  - If you used "Handled" or "independently", or a verb comes from the role question, the card needs a "Verb" line next to their words or their choice (7.1).
- **Numbers**:
  - Only numbers that are in their words, as digits (5, 30%, 12 people). Not "five" or "30 percent" in running text where a digit fits.
  - **Rounded counts keep the size they said**, with their words shown next to it on the card:

    | Their words | Write |
    |---|---|
    | a dozen or so | about a dozen |
    | twenty-something, twenty some | 20-some |
    | a couple hundred | about 200 |
    | dozens | dozens |
    | hundreds | hundreds |
    | almost a hundred | almost 100 |
    | one or two hundred, three to five | 100 to 200, 3 to 5 |
    | about 5, like 30 people | about 5, about 30 |
    | over 50, more than 50 | over 50 |

    Another language: keep the same size and the same kind of word.
  - Never an exact number or a midpoint ("15" for "a dozen or so"), never rounded up ("nearly 20", "200+"). **"N+" and "over N" only if their words said more than N.** Never turn 47 into 50+. "Many", "a few", "several", "a couple" alone, "lots of times": no size, so no number; the thing stays.
  - Unit changes count as assumptions. If they say "a third" and you want "33%": ask "Can I write 33%?" (original and new side by side). "Yes" then; otherwise keep "a third". "Thirty percent" -> "30%" needs no question. Record it under Numbers.
  - Old-resume numbers need the number question first (`import-resume.md` 4): exact ones as is, rough ones with "about", forgotten ones dropped. A number that appears in your own question was not asked ("For the $12,000 budget, what steps did you do?" asks about steps, not the number).
  - No hourly pay or salary.
- **Result**: if they told you what changed afterward, put it in, preferably first ("Schedule errors stopped, and the manager gave her the weekly schedule"). If not, don't write one and don't invent one.
- **Every bullet is something they did.** If the old resume made something bigger (the budget was decided by the president), the correction goes on the card line "Removed", not into a bullet about someone else. Amounts and head counts go after the action they did ("Tracked receipts and reconciled monthly accounts for a budget of about $10,000").
- **Scope belongs to the action they said.** An event's attendance is the event's, not theirs: do not hang "about 300 attended" after "checked in guests" so it reads as if they checked in all 300. Say what their words say, e.g. "Checked in guests at a film night that about 300 people attended." If they said "I only did reimbursements", do not write "tracked and reimbursed, including grants".
- **Wording**: avoid the banned and filler words of the manual check in AGENTS.md (item 3) and `jobhunt.yaml`. Self-praise adjectives (detail-oriented, reliable, organized, motivated, quick learner) only when the same sentence gives one confirmed example from their words, and the adjective fits the example: "Detail-oriented: the closing report matched the register every week, and the manager praised it". An adjective alone is cut.
- **Shape**: no semicolons. At most one pair of parentheses per sentence. Split a sentence over about 35 words; aim for 1 or 2 lines (about 15 to 25 words).
- After writing, find every number in the sentences (digits, spelled-out numbers like "fifty", "twice", "half", money, rough numbers like "20-some" and "N+") and check each against their words. Each must be there with the same size. If not, remove it or turn it into a question. It cannot go on a card.

### 6.2 Needs your decision (after the sentences, before the card)

After writing the sentences, look once more for things that **have an origin but are not in a sentence yet**: their words for this experience, the old-resume text for it, or things they said elsewhere that belong to it (an extra task mentioned in passing, who praised them, what changed afterward, a number). If there are some, list them before the card in one message, at most 4, each with its origin:

```text
Needs your decision: you mentioned these, or your old resume has them, and they're not in a sentence yet. Which should I add?
1. Helped with month-end inventory <- you said "también ayudaba con el inventario a fin de mes"
2. The manager praised how you handled the change dispute <- you said "ella dijo que lo manejé con calma"
3. New-hire training <- old resume says "responsible for new-hire training" (I haven't asked what you did)
Reply with numbers (like "1, 2"), or "none".
```

(Show it in their language; the quoted words stay in their language.)

- With an option tool, use a multi-select question, one option per item.
- What they pick: if the origin is their own words -> write it by 6.1. If the origin is only the old resume -> first ask one open question ("For new-hire training, what steps did you do?") and write from the answer. What they don't pick is not written and not asked again.
- **Only list things with an origin.** Never what a posting wants or what you guess they did. Never "you probably also did...".
- **Personality adjectives** (detail-oriented, communicator): list only what they said or the old resume says, marked "(needs one event behind it)". Once per adjective for the whole resume, under the most relevant experience. If picked, ask one open question: "What is one thing you did that shows you are <adjective>?" The event must be in their words for this experience (or what they say now is new words). Then write "<Adjective>: <event>". No event -> don't write it.
- "Needs your decision" is only for choosing things to add. Never "should I keep asking?"
- Choosing is not confirming. After it is written into a sentence, the card still has to be named and confirmed.
- Adding to a confirmed experience: section 9.
- Nothing to list -> skip this step silently.

## 7 to 9. Confirmation cards, confirming, changing

In `dig-cards.md` (7.1 the card, 7.2 what counts as confirming, 7.3 helping someone else, 8 after confirmation, 9 changing and deleting). Read it before the first card.

## 10. Wrap-up

When they say "that's enough for now", or all categories are done:

1. Save any unsaved drafts.
2. One line: "Today we organized 5 experiences; 3 are confirmed and 2 are not yet." Next time, section 1 picks up the other two; they need not be told what to type.
3. Suggest one next step:
   - A saved posting not yet analyzed -> "Want to see whether that posting fits you?"
   - No posting -> "When you have a posting you'd like to apply to, paste it here."
   - Target roles in `me/profile.md` still "not decided" -> based on confirmed experiences, list 2 or 3 roles that may fit, each with one reason (reasons may quote only confirmed stories), let them choose, then update the profile.

If they aren't stopping but moving to something else ("that's enough, I want to check that posting"), skip the wrap-up: save (point 1) and do what they asked.

## What not to do

- Do not invent experience, add numbers they did not say, upgrade "helped" to "handled", or turn rough numbers into exact ones or round them up.
- Do not add words, split sentences or repeat the same thing to add weight. If it is thin, ask the next question; don't write long.
- Do not let drafts into the resume. Do not confirm several cards at once (except a vouched old resume). Do not treat "yes" or "ok" as confirmation.
- Do not treat anything unsaved in the conversation as recorded.
- Do not paste YAML at the user unless they ask.
- Do not open or describe photos. Do not write SSN, passport, I-20 or SEVIS numbers, bank accounts or passwords into any file. Do not write visa or work-authorization words into any story sentence.
- Do not change AGENTS.md, CLAUDE.md, GEMINI.md, `playbooks/` or `templates/`.
