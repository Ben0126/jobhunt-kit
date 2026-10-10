# Handshake profile text (handshake-profile)

**When to use**: the user says "Handshake", "write my Handshake profile", "My Journey", or starts the `handshake` skill.
**What it produces**: `profiles/handshake.md`, plain-text blocks the user copies into Handshake themselves. You never log in, never open Handshake, never click anything for them (AGENTS.md red line 5).
AGENTS.md red lines always win. You talk in the user's language; the file and every block are English.

## 1. File format (the program check reads exactly this)

### 1.1 Syntax (identical in `linkedin.md` and `handshake.md`)

1. Line 1 is `# Handshake profile text (draft)`. Then header lines up to the first `## ` heading: `Updated: YYYY-MM-DD`, `Stories used: S-001, S-003`, and one line `Draft text for you to paste yourself. Lines starting with "- " and "Source:" are notes; do not paste them.`
2. A **block** starts with `## Name` or `## Name: label`. `Name` is spelled exactly as in the table in 1.2 (capital first letters, English). `label` is free text for people (`## Work Experience: Sales Associate at Northfield State University Bookstore`). Only blocks marked "repeat" may appear more than once. Other `##` names are not allowed. Use no `#` or `###` headings.
3. Right under the heading come **meta lines**, one per line: `- Key: value`. Keys are one word, spelled as in 1.2: `Fill`, `Limit`, `Length`, `Title`, `Company`, `Location`, `Dates`, `School`, `Degree`, `GPA`. A meta line is never pasted. Leave out a meta line when its value is unknown; never write a blank or placeholder value.
4. `Fill` is one of: `paste` (the body, if any, is pasted; meta lines such as `Title` are the values to type or choose in the matching boxes), `pick` (the user chooses from menus on the site; the body lists what to look for and is never pasted), `guide` (an explanation for the user; nothing is pasted).
5. Then one blank line, then the **body**: paragraphs separated by blank lines. Bullets are `• ` (U+2022 and a space), one per line. No `-`, `*`, `#`, bold, links, emoji or tables inside a body.
6. **Every paragraph of a `paste` or `pick` block ends with one line `Source: S-003, S-007`**, in the same paragraph (no blank line before it). Tokens are separated by a comma and a space. Each token is exactly `S-` plus digits, `Education` or `Job goals` (capital first letter, one space in `Job goals`). Use `Source:` with this capital S. A block with no body text (for example an Education block with no details) is just the meta lines, a blank line and one `Source:` line. `guide` blocks have no `Source:` line.
7. The **copy text** of a block is its body without `Source:` lines: trailing spaces removed, three or more line breaks shortened to two, ends trimmed. Length is counted on that text in characters; each line break counts 1. The program recounts and ignores your `Length` line, so write `- Length: about 190 characters` only as a guide.
8. Each bullet line (after `• `) must be a sentence from `resume.yaml` word for word (see 3.1), except in the Courses, Skills and Career Interests blocks. The `Source:` line must contain the `source` code of every bullet in the paragraph. A paragraph sourced only by `Education` or `Job goals` must not name an experience.
9. No phone number, email address, street address, visa or work-authorization word, ID number, photo or placeholder (`[Name]`, `TBD`, `XX`) anywhere in the file, `guide` blocks included. **The work-authorization questions are explained in the chat only; they never go into this file** (section 4).

### 1.2 Blocks

| Block name (`## `) | Repeat | Fill | Meta lines | Body | Limit, and what the program does at the limit |
|---|---|---|---|---|---|
| `My Journey` | no | paste | Limit, Length | one or two sentences + Source | 300 characters, **warning** (inferred from the title of Handshake's help page, which could not be opened: uncertain) |
| `Education: label` | yes, one per school | paste | School, Degree, Dates, GPA (only if confirmed) | optional `•` details + Source | no known limit, none applied |
| `Work Experience: label` | yes, one per job, internship or research role | paste | Title, Company, Location (optional), Dates | `•` lines + Source | no known limit, none applied |
| `Organizations: label` | yes | paste | Title (the role), Company (the organization), Dates | `•` lines + Source | no known limit |
| `Projects: label` | yes | paste | Title (the project name), Dates (optional) | `•` lines + Source | no known limit |
| `Courses` | no | paste | none | `• Course name` lines + Source | no known limit |
| `Skills` | no | paste | none | `• Skill` lines + Source | no known limit |
| `Career Interests` | no | pick | none | `• ` lines + Source | none |
| `Privacy and Documents` | no | guide | none | explanation lines | none |

Block order in the file: My Journey, Education, Work Experience, Organizations, Projects, Courses, Skills, Career Interests, Privacy and Documents. Write only blocks you have confirmed material for. Handshake shows its own counter; if the user tells you a limit they see on screen, write it as `- Limit: N characters` on that block (the program uses the smaller of your number and its table). `Dates` is copied from `resume.yaml` word for word (`Sep 2024 – May 2025`, with the en dash).

### 1.3 Example

```
# Handshake profile text (draft)
Updated: 2026-10-09
Stories used: S-001, S-004
Draft text for you to paste yourself. Lines starting with "- " and "Source:" are notes; do not paste them.

## My Journey
- Limit: 300 characters
- Length: about 190 characters
- Fill: paste

B.A. in Business Administration student at Northfield State University (Expected May 2027).
Looking for administrative assistant and HR assistant roles in Columbus, OH.
Source: Education, Job goals

## Work Experience: Sales Associate at Northfield State University Bookstore
- Title: Sales Associate
- Company: Northfield State University Bookstore
- Dates: Sep 2024 – May 2025
- Fill: paste

• Worked the register on weekends.
• Taught about 5 new employees to use the register at the manager's request.
Source: S-001

## Organizations: Treasurer at Campus Food Drive Club
- Title: Treasurer
- Company: Campus Food Drive Club
- Dates: 2025
- Fill: paste

• Sorted donations with a team of volunteers.
Source: S-004

## Career Interests
- Fill: pick

• administrative assistant
• HR assistant
Source: Job goals
```

(The example people and employers are made up. Never copy them into a real file.)

## 2. Before you write anything

1. Read `AGENTS.md` red lines, `me/profile.md`, `resume.yaml` and the stories in `me/stories/` with `status: confirmed`. Drafts, deleted stories and `me/work-auth.md` are never material (the last one is never readable as a source).
2. **Say the split once**: "I'll write the text block by block. You copy and paste it into Handshake yourself; I never log in to Handshake." Then work.
3. Ask only what is missing, in one short message, at most 3 numbered questions, no sample answers. Education not confirmed yet (seen only on an old resume, or given in another language): show it as a card first (`dig-cards.md`, "Basics on the first card"). Job goals missing or only "inferred": the open question "What kind of work are you looking for?" (never "is it X?"). No confirmed experience yet: write only My Journey, Education and Career Interests, and say in one line that the profile will look short until they confirm some experience. Never pad.
4. A helper typing for someone else: AGENTS.md "Helping someone else" applies.

## 3. Writing the blocks

### 3.1 The one rule: nothing new, only chosen and arranged

- A bullet is a sentence from `resume.yaml` copied **word for word** (the sentence the user confirmed on a card). You may choose, drop and reorder bullets. You may **not** reword, merge, shorten, strengthen or add a number. If the text will not fit a limit, drop a bullet.
- A new fact (a new job, number, stronger verb) is not written. Save it as a draft per `dig-experience.md`; it needs a card first.
- Home-country employer unknown to US readers: do not add an explanation yourself; a one-line description from the user goes through a card first.

### 3.2 Block by block

- **My Journey**: one or two sentences, 300 characters at most, each on its own line, and every line exactly one of these two shapes: `<degree> student at <School> (<end date>).` for a current student or `<degree> graduate of <School> (<end date>).` if graduated; `Looking for <role> and <role> roles in <location>.` or `Looking for <role> roles.` `<degree>` and `<School>` are copied from one `resume.yaml` `education` entry; `<end date>` is the part of its `dates` after the en dash, word for word (`Expected May 2027`, `May 2025`; the whole value if there is no dash; leave the line out if `dates` is empty). Roles come from `Job goals`, only re-cased: each role is written in `me/profile.md` under `Work they want`, the location under `Location and work type`, or the program reports the line. Leave out ` in <location>` unless they stated one. An end date that starts with `Expected` is always `student at`, never `graduate of`. Any other sentence is an error. No job-title word (Manager, Lead, Director, Supervisor, Head, Chief, President, Founder, Owner, Captain, Team Lead...) unless it is a `role` in `resume.yaml`; write the plain function instead. Source: `Education, Job goals`. If it is over 300 characters, drop the location, then the second role; never abbreviate the school or degree. No adjectives, no first-person story ("I am passionate...").
- **Education**: `School`, `Degree` (the whole confirmed string, nothing split), `Dates` from `resume.yaml`. `GPA` only if the entry's `details` has it, copied exactly; add one line in the chat: "Handshake lets you choose whether employers see your GPA; that choice is yours." Body: other `details` as bullets with `Source: Education` (the `Source:` line alone if there are none). Handshake asks for the major and degree level from menus; tell the user to pick the option that matches, never invent a menu name.
- **Work Experience**: stories with `type: job` or `type: internship` (read the type in the story file of the entry's first bullet `source`). `Title` = `role`, `Company` = `org`, exactly. Usually 3 to 6 bullets.
- **Organizations**: stories with `type: student-org` or `type: volunteer`. `Title` = the role, `Company` = the organization name as on the card. A `projects` entry without a role: `Title` is its `name`, and `Company` is left out.
- **Projects**: stories with `type: project` or `type: competition`.
- **Courses**: course names only if they appear word for word in an education entry's `details` or in a confirmed bullet (the program reports any other name). No course list from memory or from the major's name.
- **Skills**: items from `resume.yaml` `skills` word for word; every item comes from a confirmed skill card (an `S-` code), never from `Education` or `Job goals` alone. A tool named only inside a sentence needs its own skill card first (`dig-cards.md`). Handshake suggests names as the user types; tell them to pick the suggestion that matches and skip the rest. Never invent a skill to reach a count.
- **Career Interests**: Handshake asks for job types, roles, industries and locations from menus. List only what is in `Job goals`, or an option name the user typed to you from their screen ("the menu has 'Administrative Services'"). `Fill: pick`, with `Source: Job goals`. This block is never pasted and never filled from a posting.
- **Privacy and Documents** (`guide` block, short, no digits): the three visibility choices and the public-document rule in the neutral terms below. No visa words.
- Stories of other types (`cert-language`, `other`): their content lives in Skills or Education details; do not make a block of their own.
- **Photo box and "Name"**: you do not open, describe or write about photos (red line 7). If they ask, say "that box is yours to fill." Name, school email and phone are typed by them; never in the file.
- **No screenshots** of Handshake pages: a page can show their photo, which you never open. Ask them to type the names they see.

### 3.3 Who sees the profile, and the public document (explain neutrally; the user decides)

Say this once, in the user's language, when you reach the `Privacy and Documents` block. Do not recommend a choice. Sources are school career-center guides quoting Handshake (`careers.tufts.edu/resources/handshake-for-students`), so treat them as "check what your own Handshake shows".

- **Profile visibility** (Settings, Privacy): Community (students and alumni at other schools and employers approved by their school can see the profile), Employers (only employers approved by their school), Private (nobody sees it; they can still apply to jobs). Some schools start accounts on Private.
- The trade-off, in neutral words: wider visibility means more people can find you; Private means fewer people see your details.
- **Documents**: Handshake allows several uploaded documents but only one marked public at a time. Public documents are shown to an employer when they apply to that employer's job or register for its event. Sources disagree on whether an employer can also see a public document by browsing profiles: **uncertain**, so say "check Handshake's help page or your career center".
- Which resume to upload, and whether to make it public, is their decision. Do not say which resume.

## 4. Work authorization in Handshake (chat only, never in the file)

Handshake does not ask about work authorization on the profile page. It asks in Settings, and again the first time they apply to a job. The answers are optional. Explain, in the user's language, only what follows, and do not write any of it into `profiles/handshake.md`:

- **The two questions** (as career-center guides quote them): "Are you legally authorized to work in the United States?" and "Will you now or in the future require visa sponsorship?" There is also a choice "Prefer not to answer these questions".
- **What the choices do**, as Handshake's help pages are summarized (the pages themselves could not be opened, so **uncertain**; ask them to read the page in Handshake): employers can filter applicants by work authorization; a student who chose "Prefer not to answer" shows up in both the "needs sponsorship" and "does not need sponsorship" filters; for a job that does not require work authorization, all students are treated as eligible. Employers can also mark a job as open to sponsorship, open to OPT, open to CPT, not requiring authorization, or unknown, and "unknown" does not mean international students are excluded (Amherst College Career Center page, `careers.amherst.edu/resources/navigating-handshake-as-an-f-1-international-student`).
- A separate "visa status" setting may exist for the school's statistics (uncertain).
- **What you do not do**: you do not pick an answer for them, and you never describe "Prefer not to answer" as a way to avoid a question. The answers must be true and must match what they put on application forms. If they want help, draft the truthful answers per `work-authorization.md` (kept in `me/work-auth.md`), then end with: "Confirm with your school's international student office (DSO)." No legal advice.

## 5. Check, then hand over

1. **Show first** (if the user's language is not English): My Journey with a **literal back-translation** below it (never softer or stronger; names, school, dates and numbers unchanged), marked "for you only, do not paste". Ask one yes/no: "Is this accurate? If something is wrong, tell me which part." Yes means the frame matches the facts; it never creates a new fact. No or "not sure": fix that part and ask again. Bullets copied from confirmed cards need no new question.
2. **Manual check** (AGENTS.md "Manual check", all 7 items) on every pasted line. Extra points: each bullet equals its `resume.yaml` sentence; dates equal `resume.yaml`; My Journey within its limit; no phone, email, address; no visa or work-authorization word anywhere in the file. Write the result in `checks/_profiles.md` under `## Handshake profile`, replacing only that section. The first line of the file is always `# AI manual check (not the program check)`.
3. **Program check** if the program is in the folder: run `.\jobhunt.exe check` with no id (AGENTS.md "Program check"; Mac: the program name in the folder). Fix and rerun, at most 3 rounds.
4. **Hand over** one block per message: a code block with only the text to paste (never the `Source:` line, never a `- ` line), then at most 2 lines: where it goes in Handshake and the typed fields ("Title: ..., Employer: ..., Dates: ..."). At most 14 lines per message. `pick` and `guide` blocks are shown as plain lists, not as text to paste. They say "next" for the next block. Say red line 14's sentence once for the whole profile. Tell them the "Source:" lines and the "- " lines are notes.
5. If they change the text on Handshake, the folder does not know; new facts go through a card first.

## 6. Not covered

Job search and saved searches on Handshake, career-fair and event sign-ups, employer messaging, the school's AI summary of profiles, any claim about how many more views a complete profile gets, any advice on which answer to give for work authorization. As of 2026-10-09.
