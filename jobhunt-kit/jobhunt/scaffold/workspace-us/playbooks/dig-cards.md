# Confirmation cards, confirming and changing (dig-cards)

Part of `dig-experience.md` (section numbers continue across `dig-experience.md`, `dig-questions.md` and this file). Read `dig-experience.md` first. The red lines and way of talking in AGENTS.md, including the cross-language card, apply. Story file format is in `dig-experience.md` section 6.

---

## 7. Confirmation cards

Show **one** card at a time. Keep it short: only what the user must judge. No STAR notes, no header, no box lines.

### 7.1 The card (aim for 14 lines at most, as AGENTS.md says)

A heading of two lines, then four parts in this order, as AGENTS.md "Cross-language confirmation card" requires: (1) their words, (2) the English resume sentences, canonical, (3) a literal back-translation of the English into their language, (4) the numbers. The two heading lines show what the resume will print for this item: the title (with its back-translation), the organization and the dates. If they were promoted at this employer, part 1 quotes their words for both the start and the promotion month, and the `Dates:` line starts at the promotion (`dig-experience.md`, `dates`). Example for a user writing in Spanish (the back-translation is in Spanish):

```text
Card S-003: Campus bookstore cashier   Goes under: Experience
Title: Cashier (en español: cajero/a)   Org: Northfield State University Bookstore   Dates: Sep 2024 – May 2025
1. Your words: "Trabajé en la caja los fines de semana." / "enseñar la caja a los nuevos, a unos 5 en total" / "contar la caja conmigo ... ella dijo que lo manejé con calma"
2. Resume sentences (English):
   a. Worked the register on weekends.
   b. Taught about 5 new employees to use the register at the manager's request.
   c. Counted the register with the manager to settle a customer's change dispute.
3. What this says (word for word, in Spanish):
   a. Trabajé en la caja los fines de semana.
   b. Enseñé a unos 5 empleados nuevos a usar la caja a petición de la gerente.
   c. Conté la caja junto con la gerente para resolver una disputa de un cliente por el cambio.
4. Numbers: about 5 <- you said "unos 5 en total"
Check: you said "enseñar la caja", I wrote "to use the register". Same meaning? (yes / no)
Type "confirm S-003", or tell me what to change, or "delete S-003".
```

Rules:
- **Heading line 2 is what gets confirmed as the title, organization and dates.** `Title:` is the title that will print, in English, followed by a literal back-translation of it in their language in brackets (never "Manager" shown back as "Supervisor"; a title you cannot translate literally is rewritten in English instead). `Org:` is the official English name (the exact text for `org`, or for `name` of a project). `Dates:` is the exact English string for `dates` (`Sep 2024 – May 2025`, `Jun 2025 – Present`, `Expected May 2027`, `Summers 2019 – 2022`, `2025`; none known -> the card says `Dates: (none given)`, and the story file gets `Dates:` with nothing after it). Their words for the title, the organization and the dates belong in part 1 too, so the user can see where each came from. Writing these three English lines is also what makes later checks possible: the program compares `resume.yaml` with them (8.1). No title -> leave out `Title:` (and say in one line why, e.g. "no title: you said you just helped out"); skills, languages and software cards have neither `Org:` nor `Dates:`.
- **A date they gave in their own language is converted without a card of its own.** "2027 年 5 月畢業" shown as "Expected May 2027", or "otoño de 2024" as "2024", is only a format change: the card's `Dates:` line (or the Basics line for education) already shows the English form next to the numbers line "<- you said ...", and that is enough. Do not add a separate question for it. Never work out a month they did not give.
- **Part 3 is a fresh literal translation of the English sentence, not a copy of their words.** Copying their words would hide differences. Check each sentence: every number is the same in parts 1, 2, 3 and 4; each verb has the same strength (never "led" shown back as "helped", or "helped" as "ran"); nothing added, nothing dropped, and no softer or stronger adjective. Brackets with the English word are only for proper names and software names. Verbs, job titles, scope words and quantity words are always translated; if you cannot translate one literally, rewrite the English sentence.
- Their words already in English: parts 1 and 3 become one line ("Your words (English, so nothing to translate): ..."). If they ask for the translation anyway, give part 3.
- **No open questions on the card.** Who did it, how much: ask before the card (section 3, `import-resume.md` 5). The card only has yes/no rewording questions with the same meaning (red line 4), original and new side by side, at most 1 or 2. Then answering them does not invalidate the card by "adding new content".
- **Goes under**: at the end of the first heading line, from the table in 8.2 ("Experience", "Projects & Activities", "Skills", "Certifications").
- **Numbers**: all in one line, separated by commas, each with their words or "<- old resume, you said it's exact". Include rough ones ("about a dozen <- you said 'a dozen or so'"). None -> "Numbers: none". Dates are listed only when they differ from how they said it (e.g. "Sep 2024 <- you said 'second year, fall'"). If they gave no month, don't write one.
- **Verb**: if a sentence uses "Handled" or "independently", or the verb comes from the role question, add a line: "Verb: Scheduled <- you said 'I made the schedule myself'" or "Verb: Handled <- you chose 'lead, with help'". No such sentence -> no line.
- **Removed**: when you changed or dropped something, one line: "Removed: 'managed' (you said the president decided how it was spent)."
- **Length**: a card is at most 14 lines (AGENTS.md), counting the two heading lines; any message you send around a card is at most 10 lines. Check the count before you send. The `Title / Org / Dates` line, "Numbers", "Verb", "Removed" and "Basics" lines **cannot be cut to save lines**. Quote fewer words in line 1 and shorten the sentences instead. Use at most 3 sentences per card; if there are more, split the experience into two stories (same org).
- **Basics on the first card**: education and contact details copied from the old resume, or given in another language (the English is yours), and not yet confirmed go on the last-but-one line of the first card: "Basics: <name>, <school, degree, dates>, email, phone, <City, ST> <- old resume, confirmed together with this card." Education English goes through the card like experience: official English school name, their degree words, English dates, and its own back-translation in part 3. When this card is confirmed they count as confirmed (source `Education`); `me/profile.md` education line becomes "confirmed with S-001 (date)". If no experience card is coming (for example only LinkedIn text is wanted), make a story `type: other`, `title: Education`, holding only the education lines, and show it as a card so it has a code.
- Skills, languages and certificates are cards like any other: the English skill line (e.g. "Languages: Spanish (native), English (conversational)") with its back-translation. Level words: use one of the standard words **Basic, Intermediate, Advanced, Fluent, Native** (or "Conversational"). If they say "so-so", "average", "normal" ("普通", "還可以"), map it to the nearest standard word ("Intermediate"), show their words and the new word side by side in the yes/no line, and write the standard word only on a yes. Never write "average" or "OK" as a level. A level they gave you in one of these words is theirs.
- If they answer "no" or "not sure": change the sentence to their words and show a new card.
- **First card of the conversation**: above the card say once: "Each card needs you to name it, like `confirm S-001`. Just 'ok' or 'yes' does not count. Typing it in your own language is fine; I'll repeat the English command." Later cards don't repeat this. When helping someone else, say 7.3's line instead.
- Last line: the first card as above; later cards: "Type `confirm S-004`, or tell me what to change, or `delete S-004`." The three replies are equally fine. Don't enlarge or bold "confirm", and don't push.
- With an option tool (AGENTS.md "Tap, don't type"): the card is the question; options `confirm S-003`, "change it (I'll type what)", `delete S-003`.

### 7.2 What counts as confirming

- **Only** a reply that names this card and means confirm: `confirm S-003`, "S-003 confirm", "confirm 3". In another language, if they clearly name the card and the action ("confirmo S-003"), echo it as the **first line** of the message where you save: "Recording: confirm S-003". Do this every time, not only in the file. The echo counts. If unclear, ask them to type or click `confirm S-003`.
- The card must have appeared in full in **your previous message**. Exception: after the card, you only sent a line or two that didn't count ("that doesn't count yet", refusing inflation) and the card did not change -> it still counts, no need to show it again. If they type `confirm S-005` at the start of a new conversation, or the card is from long ago with other talk in between -> show the whole card again, then ask them to confirm.
- A card with yes/no questions: the answers and the confirm can be in one message ("yes, confirm S-003" counts). Just "yes" -> one line: "Good. Last step: type `confirm S-003` to put it on the resume."
- "Good", "right", "OK", "all fine", "confirm all", "confirm S-003 to S-006" **do not count**. Say: "OK. For this card type `confirm S-003` and it goes on the resume." A bare "yes" in any language never creates a fact.
- **Chinese replies**: 好 / 好的 / 嗯 / 可以 / OK are "OK", not an answer to a yes/no line. Only 是 / 對 / 对 / 一樣 / 一样 / 沒錯 / 没错 (or yes / same) answer it. If the card has a yes/no line and they reply only OK, send one line asking for 是 or 不是, or "yes, confirm S-xxx". The same holds when a reply names the card but the yes/no line is still unanswered ("确认 S-001" after only "好"): ask for the answer first, and do not record the confirm. Apply this the same way to every card; do not accept it on one card and block it on the next.
- They say the old resume is all correct and want no card-by-card review (not an answer to this card) -> the rest of the old-resume sections follow `import-resume.md` 8 (self-attestation). That covers only old-resume text, and only if it is already English. Sentences you rewrote or translated still need a card.
- One card at a time. The only exception is the quick confirmation before the resume file (`make-resume-file.md`). With a saved posting, show the card most relevant to it first. **When a tailored resume is waiting** (the cards listed in step 3 of `tailor-resume.md`), after those cards are confirmed, changed or declined, go straight back to the tailored resume: no other cards, no other "Still to ask".
- New content in the confirm reply ("confirm S-003, I also helped with inventory") **does not count as confirmation**. Write the new content into the words and sentences, then show a new card.

### 7.3 Helping someone else (a friend, family member or advisor is typing)

- Talk to the typist normally; call the job seeker "she"/"he" or by name. Ask the questions as usual; they may relay them to her.
- What the helper says about the experience (not relayed from her) is marked "(helper said)" in "Your words". Ask open questions about it as usual.
- **Confirmation must come from the job seeker.** At the first card say once: "She needs to see this card herself. She types `confirm S-001`, or you copy her exact words, like `She said: confirm S-001`." Not repeated.
- Two things count: she types a named confirm herself, or the helper copies her exact words with a named confirm (`She said: confirm S-001`). The helper's opinion or a summary ("I think it's fine", "she looked and said ok") does not count. A bare `confirm S-001` with no "She said:" is treated as typed by the helper; she must type herself, after typing "I am the job seeker". When it doesn't count reply with one line: "It needs her own words, like `She said: confirm S-001`." Don't re-show the card.
- The helper's words are no source for "handled", "independently", "led", "managed", "planned", "directed". Those need her own words (`She said: ...`). The role question too: what the helper picks for her doesn't count; copy her answer (`She said: assisted someone`), or write "Participated in".
- When helping, ask the role question, "needs your decision" and cards as text, not with option tools.
- After confirmation: `confirmed_via: helper`, `confirmed_reply: "<the reply>"`, `helper_note: "<who helped, e.g. a friend typing>"`.
- **Show her once before handing over**: before a resume file or profile text is handed over, if it has `confirmed_via: helper` sentences, reworded sentences in a self-attested story that has a `helper_note`, or education, location, job goals relayed by the helper, or rewrites and summaries the helper answered "yes" to -> list them all in one message (with codes, or "Education", "Job goals") and ask the helper to show her. Only after she replies with her own words like `She said: these are all correct` can you hand over and say it can be sent; education and job goals count as confirmed from then. Anything she already confirmed this way in this conversation is not listed again; no new items, no new question. If she says a sentence is wrong, that card goes back to draft and is confirmed again.
- Self-attesting the old resume also needs her words: `She said: I confirm my old resume is accurate`. List every sentence that will be used (`import-resume.md` 8.2). Save with `confirmed_via: self-attest` and `helper_note`. Self-attested sentences that print exactly as at confirmation, and education/contact details in the vouched scope, are **not** listed again before handing over; only reworded sentences (8.4 point 4) and the items in the previous point are.
- If the helper asks for stronger wording, refuse by red line 15.

## 8. After confirmation

### 8.1 Update the story file

```yaml
status: confirmed
confirmed: "2026-10-09"
confirmed_via: chat                   # helper when helping; self-attest for a vouched old resume (import-resume.md 8.4)
confirmed_reply: "yes, confirm S-003 (Recording: confirm S-003)"   # their reply, plus your echoed command if they typed in another language; clicked: "clicked: confirm S-003"
```

Use today's date. `confirmed_reply` holds only the reply that named the card (plus your echoed command); earlier replies such as "好" or "OK" are not copied into it. Copy the card's `Title:`, `Org:` and `Dates:` values, English sentences and back-translation word for word into the end-of-file section "## Sentence at confirmation (do not change)" in the exact format of `dig-experience.md` section 6 (`Title:`, `Org:`, `Dates:` lines in that order, then the numbered sentences, then one blank line, then the translation; no note ever goes inside that block). The program checks `resume.yaml` against these lines, so what you write there must be what the card showed. In the file write the English value only: no `(en español: ...)` back-translation after the title and no `<- you said ...` or `<- old resume` note after any of the three values (those belong on the card on screen and in the "Shown back" part). A Title/Org/Dates block with no numbered sentence is not accepted, so never make a card without at least one sentence. Never edit that section afterward. To change the content, go through section 9; after reconfirming, replace the whole section with the new card's text.

### 8.2 Write into `resume.yaml`

Save the story file and `resume.yaml` at once; don't wait. The first time say: "Added to your resume data." After that: "Campus bookstore cashier (S-003) is saved." Always refer to an experience as "name (code)". Don't paste YAML.

Where it goes:

| Story type | `resume.yaml` section | Heading on the resume |
|---|---|---|
| job, internship, student-org | `experience` | Experience |
| project, volunteer, competition | `projects` | Projects & Activities |
| cert-language | `skills`, label "Certifications" or "Training" | Certifications |
| cert-language (language) | `skills`, label "Languages" | Skills |
| other (software) | `skills`, label "Software" | Skills |
| other (badge, online course) | `skills`, label "Training" | Certifications |
| other (everything else) | by content: job-like -> `experience`, activity-like -> `projects`; dean's list, scholarship, GPA -> `details` of `education` | depends |

How to write it (for the AI, not shown to the user):

```yaml
experience:
  - id: s003
    org: Northfield State University Bookstore
    role: Cashier
    location: Columbus, OH
    dates: "Sep 2024 – May 2025"
    variants: [en]
    bullets:
      - id: s003_a
        text: Worked the register on weekends.
        source: S-003
      - id: s003_b
        text: Taught about 5 new employees to use the register at the manager's request.
        source: S-003
      - id: s003_c
        text: Counted the register with the manager to settle a customer's change dispute.
        source: S-003

projects:
  - id: s005
    name: "Class project: campus coffee shop survey"
    dates: "Jan 2025 – May 2025"
    variants: [en]
    bullets:
      - id: s005_a
        text: Designed a survey with 3 teammates and cleaned the responses.
        source: S-005

skills:
  - {label: Software, items: [Microsoft Excel (pivot tables), Canva], sources: [S-009], variants: [en]}
  - {label: Languages, items: [Spanish (native), English (conversational)], sources: [S-008], variants: [en]}
  - {label: Certifications, items: [CPR certified], sources: [S-007], variants: [en]}
```

Rules:
- Every bullet has an `id` and a `source`, and the source is the story code `S-xxx` of a confirmed card (never `Education` or `Job goals`: the program reports a bullet without an S- code). `id` is the story number plus a letter (`s003_a`, `s003_b`); the whole item is `s003`. Ids are unique in the file.
- `text` is **word for word** the English sentence on the card. `role` is the card's `Title:`; `org` (or `name` for a project) is the card's `Org:`; `dates` is the card's `Dates:`, each character for character. `location` only if the user gave it for this job (City, ST).
- **A title, an organization and dates come only from the card the item cites.** A card with no `Title:` line means `role` is empty or left out: never write a title there, not even one the user mentioned elsewhere (that is new content, so it goes through a new card). One card cannot support an item with a different organization or different dates, and a bullet cannot borrow another card's sentence under a new employer.
- Two stories at the same place (cashier and inventory at the same shop) whose `Org:` and `Dates:` lines are **identical**: add the second story's bullets to the item that already exists, each with its own `source`. If the dates or the title differ, make a separate item (next id, e.g. `s004`).
- **Every skills item comes from a skill card.** Each skills line records its sources in `sources: [S-007, S-009]` (not a `#` comment; the program cannot read comments), and every code there is the code of a confirmed skills, languages, software or certificate card whose line holds that exact item. A line sourced only by `Education` or `Job goals` is an error: a language, tool or credential the user mentioned while giving their education or goals still needs its own card first. `resume.yaml` already has "Software", "Languages", "Certifications" lines: add items to the existing line and add the code to its `sources`. Do not open a second line. "Certifications" is for formal credentials only (a license, an exam, CPR). A badge or an online course goes on a "Training" line, which does not exist yet: add `{label: Training, items: [...], sources: [S-0xx], variants: [en]}` the first time, then add to it.
- Honors, GPA, scholarships: write into `details` of that education entry, and change its source to `sources: [Education, S-010]`; the detail is word for word a sentence on that card. A detail with only `Education` as source must be written word for word under "Education" in `me/profile.md`, or the program reports it.
- Every card an item names (on the item or on one of its bullets) is compared on its own with the item: its `Title:` must be `role`, its `Org:` the `org` or `name`, its `Dates:` the `dates`. Naming a second card does not give the item that card's employer, dates or title. An item with no S- code anywhere (no bullet, no item `source`) is reported.
- Every item gets `variants: [en]`; the bullets don't. The variant is named `en` and nothing else. Do not change `basics`, `variants`, `sections`, `section_titles`, `summary`.
- A section that is `[]` (empty): replace the `[]` with the list.
- Read `resume.yaml` back: indentation, unique ids, quoted dates, and `text`, titles, organizations and dates identical to the card. The program (`check`) compares `resume.yaml` with the confirmed card text and reports differences, but it cannot judge meaning, so still read it back yourself and do not say "checked" until the program has run and passed.
- Until the resume file is made, don't say "it's on your resume". Show the next card or ask about the next experience in the same message as the "saved" line.

### 8.3 Drafts are unusable

A `status: draft` story is not a fact. It cannot go into `resume.yaml`, `targets/`, LinkedIn or Handshake text, or interview scripts, and it cannot be used to say "you meet the requirement".

### 8.4 What the number check can and cannot catch

The program checks every number and year in a card's confirmed sentences against the same card's "Your words" and "Numbers" sections (a year also against the card's `Dates:`). Number words count ("twelve", "a dozen" = 12, "half a dozen" = 6, "two dozen" = 24). Not counted as said: the "Old resume text (...)" paragraph of "Your words" unless the card is `self-attest`, a Numbers line that says the number was dropped or unknown, and a clause where they say they do not know it. List every number of a sentence in the Numbers section with the words that make it theirs (for an old-resume number they vouched for: "120 people: you said it's exact").

Known limits, so nobody over-trusts the check: it is a consistency check, so if the card and `resume.yaml` are both edited to match, it does not notice; it does not know which thing a number counts ("30" said for customers per shift passes for 30 trainees); the word "one" is read as the number 1 ("one of the volunteers"), so say it the way they said it; the file header's `org` and `dates` stand in when a card has no `Org:` / `Dates:` line, and editing the header and `resume.yaml` together is not caught. A date the user gave in their own language and you wrote in English ("2027 年 5 月畢業" as "Expected May 2027") needs no card of its own.

## 9. Changing, deleting, changing a confirmed story

- **They want to change something**: ask what, change "Your words" (their added words as they said them) and the sentences, then show a full new card. Don't only say what changed.
- **`delete S-003`** (a draft): **don't delete the file**. Set `status: deleted`, add `deleted: "<today>"`, and say "S-003 is deleted and won't be used on the resume." The code is never used again. If they only say "not now" or "later": don't delete; add "user said not now (date)" to "Still to ask" and don't show the card again unprompted.
- **Changing a confirmed story** (e.g. "S-003 was 3 people, not 5") follows AGENTS.md "How an experience becomes confirmed" point 5:
  1. Set the story back to `status: draft`, clear `confirmed` and `confirmed_via`, update the words and sentences.
  2. Leave `resume.yaml` for now. With the story a draft, tailored resumes, resume files and profile text cannot use bullets with `source: S-003`, so they won't be printed. Tell them: "This one is back to draft, so it won't appear on a resume you send until you confirm it again."
  3. Show a new card. After confirmation, replace the bullets with `source: S-003` in `resume.yaml` (ids unchanged); drop bullets for sentences that are gone.
  4. Search `targets/`, `jobs/` and `profiles/` for these bullets (`s003_` or `S-003`). If found, tell them: "<posting>'s tailored resume uses this sentence, so that one needs a new check." Do not edit those files yourself.
- **`delete S-003` on a confirmed story**: first say which sentences leave the resume; after they agree, remove the bullets with `source: S-003` from `resume.yaml` (and from `sources` in skills), then set `status: deleted` (file stays). Do step 4 too.
