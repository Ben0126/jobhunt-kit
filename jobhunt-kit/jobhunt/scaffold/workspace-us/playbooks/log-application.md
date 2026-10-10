# Logging application progress (log-application)

Use this when the user says "I applied to...", "they invited me to interview", "they want me to do an assessment", "I was rejected", "I got an offer", "I'm not applying anymore" or "I never heard back".
The red lines in AGENTS.md always come first. Talk to the user in their language, in plain words.

Only change the row in `data/applications.csv` that the user talked about. This playbook only records. It never applies, emails or replies to a company for the user.

## 1. Status codes

The `status` column stores an English code. When you talk to the user, use the plain name (in their language), not the code.

| Plain name (say this) | Code (store this) |
|---|---|
| To apply | todo |
| Applied | applied |
| Online assessment | oa |
| Interviewing | interview |
| Offer | offer |
| Rejected | rejected |
| No response | ghosted |
| Withdrawn | withdrawn |

How to map what they say: "I applied" -> applied; "they sent me an online test, a HireVue video interview or a skills test" -> oa; "they invited me to interview", "second round", "phone screen" -> interview; "I got an offer" -> offer; "they said no", "I got the regret email" -> rejected; "never heard back" -> first ask whether to mark it "No response"; change it to ghosted only if they say yes; "I'm not going to apply", "I turned them down" -> withdrawn. If you cannot tell, ask.

## 2. Columns

The header row is:

```
job_id,company,role,track,tier,resume_version,status,applied_date,last_update,next_action,next_action_date,contact,source,notes,resume_file,resume_commit,resume_rev,link
```

- **Never change the header row or the column order, and never add or remove a column.** If the file has no `link` column, do not write a URL (not in `notes` either); tell the user to report it to whoever maintains the kit.
- `job_id`: the id used for the posting in `jobs/` and `targets/` (rules in AGENTS.md, "Job ids").
- `company`, `role`: as written in the posting.
- `track`, `tier`: leave empty.
- `resume_version`: `targets/<id>` if `targets/<id>.yaml` exists, otherwise empty.
- `status`: the code above.
- `applied_date`, `last_update`, `next_action_date`: always `YYYY-MM-DD`.
- `next_action`: a short plain phrase, e.g. "Interview Oct 14, 2:00 pm", "Send thank-you email". If they gave an interview but no time, ask one question ("What time?"); if they are not sure, write "time not set". Time zone: if the interview is online and they did not say, do not guess.
- `contact`: only the name and title the user gave, e.g. "Ms. Rivera, recruiter". No phone number, no email address.
- `source`: where they found it, e.g. Handshake, LinkedIn, company site, career fair, referral, Indeed. If they did not say, leave it empty and do not ask.
- `notes`: one line, no line breaks. Never put an SSN, passport number, I-20 or SEVIS number, bank account number or password here.
- `resume_file`, `resume_commit`, `resume_rev`: leave empty.
- `link`: the posting URL, only if the user gave it.

CSV format: if a value contains a comma, a double quote or a line break, wrap the whole value in double quotes and write each inner double quote twice. Save as UTF-8 and keep the file's byte-order mark as it was (do not add or remove one).

## 3. Steps

### 3.1 Find the row

Match the company and title against `data/applications.csv`, `jobs/<id>/jd.md` and `targets/`:
- One match: that is the row.
- Several matches: list them and ask "Which one?", e.g. "Northfield HR Assistant (applied Oct 2) or Northfield Operations Coordinator?"
- No match: add a row (3.3).

### 3.2 Always say the date back

- "I applied": `applied_date` defaults to today. Say it: "I'll record the application date as today, Fri Oct 9. Right?"
- Relative dates ("next Wednesday", "the day after tomorrow", "end of the month"): work out the real date, say it with the weekday, and wait for a yes before writing it, e.g. "Next Wednesday is Oct 14 (Wed), at 2:00 pm. Right?"
- If you are not sure what today's date is, ask. Do not guess.

### 3.3 Add a row

- Choose the `job_id` first (section 4).
- `jobs/<id>/` does not need the posting text yet. Save it later if they want to tailor a resume or prepare for the interview.
- Add the new row at the end of the file.

### 3.4 Change a row

- Change only the fields that go with what the user said, and set `last_update` to today.
- When the status becomes interview or assessment, also fill `next_action` and `next_action_date`.
- Do not touch other rows, re-sort, or "tidy up" the file.
- **Never delete a row.** If they say "delete it", ask: "Do you want to mark it Withdrawn, or delete the whole row? A deleted row cannot be brought back." Delete only if they clearly say delete.

### 3.5 Report back

Say what changed in one sentence, e.g. "Recorded: Northfield HR Assistant is now Interviewing, Oct 14 (Wed) at 2:00 pm."

Then suggest at most one next step:
- Interview -> "Want to prepare for the interview now?" (`interview-prep.md`)
- Assessment -> "Want to go through what the test may cover?"
- Rejected -> one calm, short sentence of sympathy, then "Want to look at the next posting?"
- Offer -> "Congratulations! Want to list the questions to ask before you answer (pay, start date, schedule)?" If the offer, or the employer's paperwork, depends on their work authorization (CPT, OPT, sponsorship), say once to confirm with their school's international student office (DSO), and see `work-authorization.md`. Do not give legal advice.

## 4. Job ids (job_id)

1. Match the company and title against the headers of `jobs/*/jd.md`, `targets/` and the CSV. If the posting is already there, reuse its id.
2. If not, make a new id by AGENTS.md "Job ids" (look at `jobs/`, `targets/`, `checks/`, `resumes/` and the `job_id` column). Never reuse an id, even if that row is withdrawn.
3. The id is only for files. Talk to the user about the company and title, not the id.

## 5. What not to do

- Do not log in to Handshake, LinkedIn or any site, press Apply, send email or reply to an interview invitation. If they want a reply, write a draft in the chat for them to send themselves.
- Do not change any file in `submitted/`.
- If the user's message contains an SSN, passport number, I-20 or SEVIS number, bank account number or password, do not write it into the CSV or any file, and tell them not to paste it.
