# Opening and basic details (onboarding)

**When to use**: first use (`me/profile.md`, `me/stories/` and `jobs/` have no files yet; `.gitkeep` does not count), the user says "start", or the user only says what job they want. Later, whenever basic details are needed, follow section 3.
**What it produces**: `me/profile.md` (job goals, only what is already known), and `basics` and `education` in `resume.yaml` (only once known).

The red lines and the way of talking in AGENTS.md always apply. This file only describes the steps.

**This is not a gate.** Do whatever the user gives you first. Ask for basic details only when a task needs them (table in 3.2). Never block their request with "let's fill in your details first".

Language: reply in the language of the user's latest message. Everything you write into files is English. Examples below are shown in English; translate your messages, not the file contents.

---

## 0. Look at the folder first (do not tell the user)

1. Any file in `me/profile.md`, `me/stories/` or `jobs/` -> not the first time, no opening. Say in one or two sentences where they stopped last time and the suggested next step. If this message already gives you something (old resume, posting, question), handle that right away.
2. `me/stories/` has `status: draft` stories -> note it; `dig-experience.md` handles them.
3. `inbox/` has an old resume not yet imported -> note it and ask at the next step: "Is <file name> in your inbox your old resume? Want me to go through it?"

## 1. The opening (once, the only time in this whole folder)

Give it before any question. You may soften the tone, but no point may be dropped, and the privacy sentence stays **word for word** when the user writes English:

> I'll help you turn your experience into a one-page US resume, check whether a job posting fits you, and write text for your LinkedIn and Handshake profiles. I only write what you really did and never make things up, and I'll ask a few questions so what you did is written fully.
> Your files stay in a folder on your computer and are not sent to any jobhunt server, but whatever the AI reads is sent to the AI service you use. Do not give me your SSN, passport number, bank account number or passwords.
> If you don't want to answer a question, say "skip".

- Add "(Cowork processes the files it needs in the cloud.)" after "service you use" only in Cowork. Do not add it in Claude Code or Codex.
- If the user is not writing in English: say the three lines below in their language as a faithful translation (every point of the privacy sentence kept: files stay on their computer, not sent to a jobhunt server, what the AI reads goes to the AI service, no SSN, passport, bank account or passwords), not English plus a short paraphrase. The English text is the content standard. Tell them once that they can write in their own language and you will answer in it, while everything that goes on the resume stays in English.

Then:
- They already gave something -> finish the opening and handle it **in the same message** (old resume: `import-resume.md`; posting: `tailor-resume.md`). The opening counts toward the 10-line limit, so keep it short.
- They gave nothing yet -> add one line: "You can send your old resume, paste a job posting, or tell me what kind of work you want." Then wait.

**Do not say these in the opening.** Say each once, when it is needed:
- How to confirm (`confirm S-001`, and the other fixed commands): when the first confirmation card appears (`dig-experience.md` section 7).
- Who checked what (AI by hand or the program): when you hand over a resume file or profile text (AGENTS.md red line 14).
- Photos: never ask; if they raise it, say US resumes have no photo.

## 2. Follow what they give you

| What they gave | What to do |
|---|---|
| An old resume (file or pasted text), or "look at my resume" | `import-resume.md` |
| A job posting | `tailor-resume.md`: save it, then do the fit analysis at once (it starts with the work-authorization screen, `work-authorization.md`) |
| The kind of work they want ("an admin job") | Note it in the profile, then go to the "dig experience" row in 3.2 and `dig-experience.md` |
| "I don't know what I want" / "I have no experience" | Ask: "Do you have an old resume? Sending it is the fastest. If not, we can start from things you have done." |
| A visa, CPT/OPT or sponsorship question | `work-authorization.md` |

If they change topic midway (for example they paste a posting while you are digging), do the new thing first, then ask whether to go back.

## 3. Basic details: extract first, ask only when needed

### 3.1 Extract first

What the old resume, the posting or the conversation **already states**, use directly. Do not ask again.
- Name, email, phone, city and state, school, major, start and end months from the old resume: copy **word for word**. Street addresses are never kept (keep City, ST only). Only dates change to the English form (`2021/09` -> `Sep 2021`) and the card shows the changed form. A school or employer name that is not in English: do not translate it yourself; ask for the official English name (3.3).
- The target role the old resume states: note it in the profile marked "inferred (from the old resume)".
- A posting's job type and location are "inferred" only. They are never something the user said.

Copied education and contact details (and education given in another language, translated by you) go on the **last-but-one line of the first confirmation card**, in the form they would print, and are confirmed together with that card (`dig-experience.md` 7.1). Do not ask "is this right?" separately, and do not put them in the middle of other messages. Once that card is confirmed, education and contact details count as confirmed (source `Education`; see AGENTS.md "How an experience becomes confirmed"). If the user vouches for the whole old resume and includes education and contact details, they are confirmed with the vouching instead (`import-resume.md` 8.4). Shown but not answered does not count.

"Inferred" items are not a source for `Job goals`. When you need the job goal (for the fit analysis, LinkedIn headline), ask one open question: "What kind of work are you looking for?" (never "is it X?"). What they say themselves counts (source `Job goals`).

### 3.2 When to ask what

Ask only what the current task needs and you do not know yet. Short fact questions may be bundled: at most 3 per message, numbered, answerable in one line, no sample answers.

| Current task | Needed | If missing |
|---|---|---|
| Fit analysis of a posting | Nothing | Ask at the end only what would change the conclusion (location, schedule, full/part time), at most 3 |
| Digging experience | Target role | One question: "What kind of work are you looking for? You can name 1 to 3." If they don't know, note "not decided" and dig anyway |
| Making the resume file | Name, contact details, education (and graduation month) | Ask these together; if skipped, use placeholders (3.4) |
| LinkedIn or Handshake text | Job goal, location, graduation month and degree | Ask together, at most 3 |
| Application form questions, visa questions | See `work-authorization.md` | Do not collect visa details here |

Bundled example:
> Three quick ones, one line each is fine:
> 1. Which city or cities do you want to work in?
> 2. Full time, part time or internship?
> 3. When can you start?

If an answer is "skip" or "not sure", note "not stated" or "not sure" for that one, record the rest, and do not push.

### 3.3 How to record each item

- **Target role**: in their words. Roles outside the usual list (front desk, warehouse, event coordination) are fine. "I don't know" or "anything" -> note "not decided" and say: "That's fine. After we go through your experience I'll help you see which roles fit." Never decide for them.
- **Location**: City, ST as they say it. Do not complete it for them ("Columbus" stays "Columbus" until they say the state; ask only if the resume file needs it). Remote is fine if they say so.
- **Education**:
  - Record only the highest 2 or 3. High school only if there is nothing higher.
  - **Their words**: do not expand or add a degree. "business major" stays "Business"; they say "B.A. in Business Administration" -> that. Minors, GPA, coursework, honors: only if they say them, and each goes through a card (`dig-experience.md` 4.9, 7).
  - **School name**: the official English name, asked from them ("What is the school's official English name?"). If they gave the school or degree in another language, or cannot say the English name, the English form goes on a card with your best translation marked "my translation of what you wrote" (the `Basics:` line of the first card, or a story `type: other`, `title: Education` when no experience card is coming; `dig-cards.md`). Write it into `resume.yaml` only after they name that card.
  - **Dates, never worked out**: month and year -> `"Aug 2023 – Expected May 2027"` (future end date) or `"Aug 2019 – May 2023"` (past); only graduation known -> `"Expected May 2027"` or `"May 2023"` (no start date made up); only a year -> the year only; unknown -> an empty string (nothing printed). Other calendars or date styles: convert to the Gregorian month and year, say the converted date out loud, and let them confirm it.
  - Unsure of the school -> `school` is `[School]`; tell them: "The resume will show [School] for now, so that file cannot be sent."
- **Start date**: "after graduation" / "next month" -> work out the real date from what they said and show it in your reply. Not sure -> "not sure"; leave it out of application text and say so.
- **Conditions they cannot accept**: record in their words. Do **not** ask about pay expectations; if they raise it, record their words, otherwise "not stated" (resume text and application text use "open to discussing" unless the posting gives a range).

### 3.4 Contact details

- Ask only when making the resume file (copy from the old resume if it has them): "The top of the resume has your name, email, phone and city and state. Would you like to give them to me now? You can skip."
- City and state only. Never ask for a street address.
- Do not ask for date of birth, gender, marital status, nationality, age, SSN, passport number or any visa details. If they want any of these on the resume, say: "US employers don't need these, and a resume works better without them." If they still insist, record it under "Other" in the profile and do not put it in `resume.yaml`. (Visa and ID numbers never go in any file: AGENTS.md red line 6.)
- If they skip the name: `basics.name` is `[Name]`, other fields empty strings, and tell them: "The resume file will show [Name] for now, so it cannot be sent. Tell me your name before I make the file."

## 4. Saving

Save as soon as you get or change basic details (one save for several items in the same answer). Do not wait until everything is asked.

### 4.1 `me/profile.md`

Use this format. Write "not stated" for what you do not know and mark anything inferred as "inferred". Do not guess. **Never write visa, CPT/OPT or work-authorization status in this file**; that goes only in `me/work-auth.md` (`work-authorization.md`).

```markdown
# Job goals

Updated: 2026-10-09

## Work they want
- Administrative assistant, HR assistant
- Inferred (old resume): event coordination. Not asked yet.

## Location and work type
- Columbus, OH
- Full time

## Education
- Northfield State University, Business, Expected May 2027 (copied from the old resume; confirmed with S-001 on 2026-10-09)
- Until confirmed, write "copied from the old resume, shown to them, not confirmed yet". That state is not a source.

## Available to start
- After May 2027 (they said "after graduation")

## Conditions they cannot accept
- No overnight shifts

## Pay expectation
- Not stated (use "open to discussing")

## Why this kind of work, plans
- Not stated (when they say it, record their words with the date)

## Old resume
- inbox/old-resume.pdf (imported 2026-10-09)

## Helper
- None (if there is one, write "a friend types; the job seeker confirms every card")

## Other
- Not stated
```

### 4.2 `basics` and `education` in `resume.yaml`

- Change only `basics` (name, email, phone, location) and `education`. Do not touch `variants`, `sections`, `summary`, `experience`, `projects`, `skills`.
- Do not add GitHub to `basics.links`. Add a portfolio or LinkedIn URL only if they gave it.
- Quote phone numbers and dates, e.g. `phone: "(555) 555-0100"`, `dates: "Aug 2023 – Expected May 2027"`.
- Every English item carries `variants: [en]` (the comment at the top of `resume.yaml` explains why the name must be `en`).

```yaml
education:
  - school: Northfield State University
    degree: Business               # their words or the old resume's words; do not expand or add a degree
    dates: "Aug 2023 – Expected May 2027"
    details: []
    source: Education
    variants: [en]
```

### 4.3 Tell them

Say in one line what you recorded (e.g. "Noted: Columbus, full time, can start after graduation."). Education they typed themselves in English: write out the exact form that would print, only the first time or when changed; education copied from an old resume, or given in another language, is not stated here and not yet in `resume.yaml`: it goes on a card first (3.1, 3.3). If they say something is wrong, fix the file and repeat only the corrected item.

Experiences are never confirmed here. Every experience goes through the confirmation cards in `dig-experience.md`, one at a time.

## What not to do

- Do not ask for date of birth, SSN, passport or I-20 numbers, street address, marital status, family background, health, religion or politics. If they volunteer them, do not write them into any file (except what 3.4 allows them to insist on).
- Do not decide for them what work to look for. After their experience is organized you may offer options with reasons; they choose.
- Do not treat `me/profile.md` as resume facts. It is direction, not experience.
- Do not paste YAML or raw file contents into the chat unless they ask.
