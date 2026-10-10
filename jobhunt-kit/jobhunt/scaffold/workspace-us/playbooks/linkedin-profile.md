# LinkedIn profile text (linkedin-profile)

**When to use**: the user says "LinkedIn", "write my LinkedIn", "headline", "About section", or starts the `linkedin` skill.
**What it produces**: `profiles/linkedin.md`, plain-text blocks the user copies and pastes into LinkedIn themselves. You never log in, never open LinkedIn, never click anything for them (AGENTS.md red line 5).
AGENTS.md red lines always win. You talk in the user's language; the file and every block are English.

## 1. File format (the program check reads exactly this)

### 1.1 Syntax (identical in `linkedin.md` and `handshake.md`)

1. Line 1 is `# LinkedIn profile text (draft)`. Then header lines up to the first `## ` heading: `Updated: YYYY-MM-DD`, `Stories used: S-001, S-003`, and one line `Draft text for you to paste yourself. Lines starting with "- " and "Source:" are notes; do not paste them.`
2. A **block** starts with `## Name` or `## Name: label`. `Name` is spelled exactly as in the table in 1.2 (capital first letter, English). `label` is free text for people (`## Experience: Sales Associate at Northfield State University Bookstore`). Only blocks marked "repeat" may appear more than once. Other `##` names are not allowed. Use no `#` or `###` headings.
3. Right under the heading come **meta lines**, one per line: `- Key: value`. Keys are one word, spelled as in 1.2: `Fill`, `Limit`, `Length`, `Title`, `Company`, `Location`, `Dates`, `School`, `Degree`, `Suggested`. A meta line is never pasted. Leave out a meta line when its value is unknown; never write a blank or placeholder value.
4. `Fill` is one of: `paste` (the body, if any, is pasted; meta lines such as `Title` are the values to type or choose in the matching boxes), `guide` (an explanation for the user; nothing is pasted), `pick` (not used for LinkedIn).
5. Then one blank line, then the **body**: paragraphs separated by blank lines. Bullets are `• ` (U+2022 and a space), one per line. No `-`, `*`, `#`, bold, links, emoji or tables inside a body.
6. **Every paragraph of a `paste` block ends with one line `Source: S-003, S-007`**, in the same paragraph (no blank line before it). Tokens are separated by a comma and a space. Each token is exactly `S-` plus digits, `Education` or `Job goals` (capital first letter, one space in `Job goals`). Use `Source:` with this capital S. A block with no body text (for example an Education block with no details) is just the meta lines, a blank line and one `Source:` line. `guide` blocks have no `Source:` line.
7. The **copy text** of a block is its body without `Source:` lines: trailing spaces removed, three or more line breaks shortened to two, ends trimmed. Length is counted on that text in characters; each line break counts 1. The program recounts and ignores your `Length` line, so write `- Length: about 780 characters` only as a guide.
8. Each bullet line (after `• `) must be a sentence from `resume.yaml` word for word (see 3.1), except in the Skills block. The `Source:` line must contain the `source` code of every bullet in the paragraph. A paragraph sourced only by `Education` or `Job goals` must not name an experience. **Lines that are not bullets are checked too**: the Headline, the About opening, the first line of each About paragraph and the About `Skills:` line may only take the exact shapes in 3.2, built from `resume.yaml` text. Anything else ("Fluent in Mandarin", "Certified", a title or a skill that is not in `resume.yaml`) is an error.
9. No phone number, email address, street address, visa or work-authorization word, ID number, photo or placeholder (`[Name]`, `TBD`, `XX`) anywhere in the file, `guide` blocks included.

### 1.2 Blocks

| Block name (`## `) | Repeat | Fill | Meta lines | Body | Limit, and what the program does at the limit |
|---|---|---|---|---|---|
| `Headline` | no | paste | Limit, Length | one line + Source | 220 characters, **warning** (third-party source) |
| `About` | no | paste | Limit, Length | paragraphs + Source each | 2,600 characters, **warning** (third-party) |
| `Experience: label` | yes, one per job | paste | Title, Company, Location (optional), Dates, Limit, Length | `•` lines + Source | Description 2,000 characters; Title, Company, Location 100 each; all **warning** (third-party) |
| `Projects: label` | yes | paste | Title (the project name), Dates (optional), Length | `•` lines + Source | no known limit, none applied |
| `Education: label` | yes, one per school | paste | School, Degree, Dates | optional `•` details + Source | no known limit, none applied |
| `Skills` | no | paste | Limit, Length | `• Skill` lines + Source | **100 items, error** (official: LinkedIn help a549047) |
| `Custom URL` | no | guide | Suggested | one or two explanation lines | `Suggested` value: letters and digits only, 3 to 100 long, must not contain "linkedin" (any case): **error** (official: a542685) |
| `Open to Work` | no | guide | none | explanation lines | none |

Block order in the file: Headline, About, Experience (newest first), Projects, Education, Skills, Custom URL, Open to Work. Write only the blocks you have confirmed material for. `Limit` lines are written as `- Limit: 220 characters` or `- Limit: 100 items`; the program uses the smaller of your number and its own table, so a bigger number never lets longer text through. `Dates` is copied from `resume.yaml` word for word (`Sep 2024 – May 2025`, with the en dash).

### 1.3 Example

```
# LinkedIn profile text (draft)
Updated: 2026-10-09
Stories used: S-001, S-004
Draft text for you to paste yourself. Lines starting with "- " and "Source:" are notes; do not paste them.

## Headline
- Limit: 220 characters
- Length: about 110 characters
- Fill: paste

Seeking administrative assistant roles | B.A. in Business Administration, Northfield State University | Microsoft Word, Excel (pivot tables)
Source: Education, Job goals, S-006

## About
- Limit: 2,600 characters
- Fill: paste

B.A. in Business Administration student at Northfield State University (Expected May 2027).
Looking for administrative assistant and HR assistant roles in Columbus, OH.
Source: Education, Job goals

Sales Associate, Northfield State University Bookstore
• Worked the register on weekends.
• Taught about 5 new employees to use the register at the manager's request.
Source: S-001

## Experience: Sales Associate at Northfield State University Bookstore
- Title: Sales Associate
- Company: Northfield State University Bookstore
- Location: Columbus, OH
- Dates: Sep 2024 – May 2025
- Limit: 2,000 characters
- Fill: paste

• Worked the register on weekends.
• Taught about 5 new employees to use the register at the manager's request.
Source: S-001

## Education: Northfield State University
- School: Northfield State University
- Degree: B.A. in Business Administration
- Dates: Aug 2023 – Expected May 2027
- Fill: paste

Source: Education

## Skills
- Limit: 100 items
- Fill: paste

• Microsoft Word
• Excel (pivot tables)
Source: S-006
```

(The example people and employers are made up. Never copy them into a real file.)

## 2. Before you write anything

1. Read `AGENTS.md` red lines, `me/profile.md`, `resume.yaml` and the stories in `me/stories/` with `status: confirmed`. Drafts, deleted stories and `me/work-auth.md` are never material (the last one is never readable as a source).
2. **Say the split once**: "I'll write the text block by block. You copy and paste it into LinkedIn yourself; I never log in to LinkedIn." Then work.
3. **What you need and how to get it** (ask only what is missing, one short message, at most 3 numbered questions, no sample answers):
   - Education not confirmed yet (seen only on an old resume, or given in another language so the English is yours): show it as a card, `dig-cards.md` ("Basics on the first card"; if no experience card is coming, make the `type: other`, `title: Education` story). Education text waits for the confirmation.
   - Job goals missing or only "inferred": ask the one open question "What kind of work are you looking for?" (never "is it X?"). Location preference only if they volunteer it or you ask it as a short fact question; "not stated" means no location in the text.
   - No confirmed experience yet: write only Headline, About (education and goals only), Education and, if `resume.yaml` has skills, Skills. Say so in one line ("LinkedIn will look short until you confirm some experience; want to dig some out?"). Never pad.
4. A helper typing for someone else: AGENTS.md "Helping someone else" applies before you hand anything over.

## 3. Writing the blocks

### 3.1 The one rule: nothing new, only chosen and arranged

- A bullet is a sentence from `resume.yaml` copied **word for word** (the sentence the user confirmed on a card). You may choose which bullets to use, drop some, and put the most relevant first. You may **not** reword, merge, shorten, strengthen or add a number. LinkedIn is a general profile: order by the user's `Job goals`, not by one posting.
- If a bullet will not fit the limit, drop a bullet. Do not shorten one.
- A sentence or fact the user wants that is not in `resume.yaml` (a new job, a number, a stronger verb) is not written. Save it as a draft per `dig-experience.md`; it needs a card first.
- A home-country employer that US readers do not know: do not add an explanation yourself. If the user gives a one-line plain description in their own words, it goes through a card first.
- The words a person reads first count most (LinkedIn search shows only about the first 60 to 70 characters of a headline; About shows about 300 characters before "See more": third-party figures, uncertain). Put the target role first in the headline, and the education and goal sentences first in About.

### 3.2 Headline and About: fixed frames

These are the only sentences you may write yourself. They only restate confirmed data; no adjective, no claim.

- **Headline** (one line, segments separated by ` | `). The first segment is always `Seeking <role> roles` (or `Seeking <role> and <role> roles`): one or two roles from `Job goals`, only re-cased, never reworded: each role must be written in `me/profile.md` under `Work they want` (a line marked "Inferred" does not count), or the program reports the headline. Every later segment is exactly one of these three shapes, and nothing else:
  1. `<degree>, <School>`, both copied from one `resume.yaml` `education` entry.
  2. Skill items copied from `resume.yaml` `skills` word for word, whole (with their brackets), separated by `, `, up to 3: `Microsoft Word, Excel (pivot tables)`.
  3. `<role>, <org>` of one `experience` entry, or just that `role`, or just that `org`, copied exactly.

  Leave out a segment whose data is missing. No certification name, no "Certified", no title or skill that is not in `resume.yaml`. Do not write "Recent graduate", "Job seeker", "Open to work" or "Looking for opportunities" as the headline or its main part. Source line: `Education` if the degree or school is used, `Job goals` if roles are, the story codes of the skills or job used.
- **About, paragraph 1** (Source `Education, Job goals`; this is the pitch, so it stays first). Each sentence is its own line, and every line is exactly one of these two shapes:
  - `<degree> student at <School> (<end date>).` for a current student, or `<degree> graduate of <School> (<end date>).` if already graduated. `<degree>` and `<School>` come from one `education` entry; `<end date>` is the part of its `dates` after the en dash, word for word (`Expected May 2027`, `May 2025`; the whole value if there is no dash). An end date that starts with `Expected` is always `student at`, never `graduate of`. Leave the line out if `dates` is empty.
  - `Looking for <role> and <role> roles in <location>.` or `Looking for <role> roles.` Roles from `Job goals`, only re-cased: each role is written in `me/profile.md` under `Work they want`, and the location under `Location and work type`, or the program reports the line. Nothing else goes between "Looking for" and "roles", or after the location; leave out ` in <location>` unless they stated one.
- **About, next paragraphs**: for each of the one to three most relevant roles or projects, a first line that is exactly `<role>, <org>` of one `experience` entry, or exactly the `name` of one `projects` entry (an experience entry whose `role` is empty cannot head a paragraph; it still has its own Experience block), then its bullets (3 at most each), then `Source:` with that story's code (the first line must belong to an entry that code belongs to). Optionally a last paragraph with one line `Skills: item, item`, each item copied from `resume.yaml` `skills` word for word and whole, and the `sources` of those lines.
- First-person narrative ("I am passionate about...", "I believe...") is not allowed: it is a new claim. No phone, no email, no links.

### 3.3 Experience, Projects, Education, Skills

- **Experience**: one block per `experience` entry of `resume.yaml`, newest first. `Title` = `role` and `Company` = `org` exactly; `Location` and `Dates` as in the entry. Body: its bullets (usually 3 to 6; all that exist if the user asks).
- **Projects**: one block per `projects` entry (course projects, competitions, volunteering). `Title` = the entry `name`.
- **Education**: `School`, `Degree` (the whole confirmed degree string, nothing split or expanded), `Dates` from `resume.yaml`. Body: only the entry's `details` (GPA, coursework, honors) as bullets with `Source: Education` (add story codes if a detail came from a story). GPA only if the user confirmed it. No details: the `Source:` line alone.
- **Skills**: each `• ` line is an item from `resume.yaml` `skills` word for word. A tool named only inside a sentence needs its own skill card first (`dig-cards.md`). Group lines so each paragraph has one `Source:` line with the codes from `sources` of those items. Suggest the strongest 10 to 20 if they have that many; never invent or add a skill to reach a count; never more than 100. A skill with only a self-rating and no example ("fluent", "expert") is written exactly as the confirmed item says, nothing stronger.
- **Dropdowns** (employment type, month and year, school list, degree list, industry, "location type"): you cannot see them. Tell the user to pick the option that matches what they told you, and to type the option name they see if they want your help. Never invent an option name. **No screenshots of LinkedIn pages**: a page can show their photo, which you never open (red line 7). If they offer one, say so in one line and ask them to type what the box says.

### 3.4 Custom URL and Open to Work (explanations; the user decides)

Write these as `guide` blocks. Give the facts in the chat too, once, in the user's language. Do not tell them what to choose.

- **Custom URL**: a shorter web address for their profile, like `linkedin.com/in/jordanellis`. LinkedIn's rules (official, `linkedin.com/help/linkedin/answer/a542685`): 3 to 100 characters, no spaces, symbols or special characters, must not contain "LinkedIn", can be changed up to 5 times in 6 months. Hyphens: many profile addresses have them, but the official page says "no symbols", so this is uncertain; suggest letters and digits only. Offer one or two suggestions from `basics.name` (for example first name plus last name, joined). `Suggested: jordanellis`. If they set one, they tell you, and you may put it in `basics.links` as `linkedin.com/in/<name>` only after they say so.
- **Open to Work**: LinkedIn lets people signal they are looking. Three visibility choices (official, `linkedin.com/help/linkedin/answer/a507508`): all LinkedIn members (the profile photo gets an #OpenToWork frame, and people at their current employer can see it too), recruiters only (visible to people using LinkedIn Recruiter; LinkedIn says it cannot guarantee complete privacy), or visible only to you (used only to tune job suggestions). Preferences it asks for: job titles, workplace type, locations, start date, employment type. Say the trade-off neutrally (more people can find you vs. who might see it); never say which is better. Preferences are the user's own words; do not fill them from a posting.

## 4. Check, then hand over

1. **Show first** (if the user's language is not English): the Headline and the About frame sentences with a **literal back-translation** below them (never softer or stronger; names, school, dates and numbers unchanged), marked "for you only, do not paste". Ask one yes/no for the assembled lines: "Is this accurate? If something is wrong, tell me which part." Yes means the frame matches the facts; it never creates a new fact. A no or "not sure" removes or fixes that part and you ask again. Bullets copied from confirmed cards need no new question.
2. **Manual check** (AGENTS.md "Manual check", all 7 items) on every pasted line. Extra points: each bullet equals its `resume.yaml` sentence exactly; dates equal `resume.yaml`; no limit exceeded; no phone, email, address; no visa or work-authorization word (also not in `guide` blocks); the headline has no filler. Write the result in `checks/_profiles.md` under `## LinkedIn profile`, replacing only that section. The first line of the file is always `# AI manual check (not the program check)`.
3. **Program check** if the program is in the folder: run `.\jobhunt.exe check` with no id, as AGENTS.md "Program check" says (it checks `profiles/` too; Mac: the program name in the folder). Fix and rerun, at most 3 rounds. Warnings about third-party limits: shorten by dropping a bullet, or tell the user the site's own counter decides.
4. **Hand over** one block per message: a code block with only the text to paste (never the `Source:` line, never a `- ` line), then at most 2 lines: what to paste where (for Experience and Education, list the typed fields: "Title: ..., Company: ..., Dates: ...", with "Description" as the pasted block). A block is at most 14 lines in a message; if a description is longer, show it in two messages. They say "next" for the next block. Say red line 14's sentence once for the whole profile ("the program check passed; meaning and titles were checked by the AI by hand", or "this is an AI manual check, not a program check"). They can open `profiles/linkedin.md` themselves; tell them the "Source:" lines and the lines starting with "- " are notes, not text to paste.
5. After they paste: it is theirs. If they change the text on LinkedIn, tell them the folder does not know; new facts go through a card first.

## 5. Not covered

Featured, Recommendations and Publications (limits not confirmed), cover letters, messaging, connecting with alumni, scraping LinkedIn, buying or recommending paid LinkedIn features, any claim that a photo or a banner gets more views.

Facts above about limits: Headline 220, About 2,600, Experience title/company/location 100 and description 2,000 are from third-party guides (`app.unilink.us/blog/linkedin-character-limits-2026`, `authoredup.com/blog/linkedin-character-limit`), so the program only warns. Skills up to 100 is official (`linkedin.com/help/linkedin/answer/a549047`). As of 2026-10-09.
