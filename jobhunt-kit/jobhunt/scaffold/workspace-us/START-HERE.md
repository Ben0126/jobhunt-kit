# Start here

This folder is your private job-search helper (jobhunt-kit, US edition). You talk to an AI in chat. It turns what you tell it into a one-page US resume, writes text for your LinkedIn and Handshake profiles, and helps you get ready for interviews.

You can chat in your own language. The AI answers in the language you write in, but everything that goes on your resume and profiles is in English. For each experience it shows you the English sentence and a word-for-word translation back into your language, so you can see exactly what you are claiming.

You need:

- A Windows or Mac computer.
- A paid Claude plan (Pro or above). The free plan cannot use the Code tab.
- Chrome, Edge or Safari (to save your resume as a PDF).

Do the steps in order.

## Step 1: Unzip and put the folder somewhere easy

1. You downloaded a .zip file. Unzip it first:
   - Windows: right-click the file, choose "Extract All", then "Extract".
   - Mac: double-click it.
2. From now on, use the unzipped folder, not the .zip.
3. Put the folder somewhere easy to find, for example inside Documents. You can rename it, for example "Job Search".

Do not move it afterwards. If you move it, the AI cannot find it.

## Step 2: Install the Claude desktop app

Download it from https://claude.ai/download, install it and sign in. You do not need to install anything else.

## Step 3: Pick this folder in the Code tab

1. Open the Claude desktop app and click the "Code" tab at the top.
2. Choose a folder (the button may be called "Select folder" or show a folder icon) and pick the folder from Step 1.
3. Type "start" in the message box and send it.

The AI reads the rules in the folder by itself. You do not need to paste anything.

The first time you pick this folder, you may be asked whether to trust it. Choose Trust (or Yes). If you do not, the AI cannot open your finished resume for you.

Button names and positions on your screen may differ from this page. Look for the one with a similar meaning.

## Step 4: Chat with the AI

The first time, the AI explains in a short paragraph what it will do and where your information goes. Then you can:

- Give it your old resume (send the file or paste the text) and it goes through it one section at a time.
- Put a Word resume in the "inbox" folder and say "read the resume in inbox". Before you do, open it in Word and delete the lines with your date of birth, ID numbers and street address, then save. If you want to keep the original, save a copy first.
- Paste a job posting. It tells you right away whether it fits, and it checks the posting for work-authorization blockers such as "no sponsorship".
- Or tell it what kind of job you want. It asks what you have done: part-time jobs, campus jobs, clubs, class projects, volunteering and internships all count.

Many questions show buttons you can click. For questions about your experience, type your answer. If you do not want to answer one, say "skip".

The AI never invents experience. For each experience it shows you a confirmation card with four parts: your own words, the English resume sentence, a word-for-word translation of that sentence into your language, and the numbers. If the card is right, click or type `confirm S-003`. A plain "yes" does not count. To change it, say what to change. To remove it, type `delete S-003`.

You can type the command in your own language, for example "confirm S-003" in Chinese or Spanish. The AI then repeats the English command back to you, and that repeated line is what gets recorded.

If your old resume is already in English and everything on it is correct, you can say "my old resume is accurate, just use it". The AI first lists the places an interviewer may push on. Then you click "I confirm my old resume is accurate" (or type `I confirm my old resume is accurate`), and it uses what you wrote without asking about every line. Anything the AI adds or rewrites still gets a card.

Helping a friend or family member: tell the AI who you are helping. Every card must be seen by the person themselves. If you type for them, copy their exact words, for example `She said: confirm S-001`. Your own opinion does not count.

### If a "Do you allow this?" window appears

The AI edits files inside this folder without asking. If it wants to do something else, such as open a web page, you may see a question:

- Opening your resume file, or reading a job posting page you pasted: allow.
- Logging in to LinkedIn, Handshake or any site, submitting an application, sending an email: refuse. You do those yourself.

## Each time you come back

Open the Code tab, pick the same folder, start a new conversation and type "continue". The AI reads where you stopped from the folder.

## Open the app (optional)

If the folder contains the "jobhunt" program, you can open a small page in your browser. Its "Progress" tab is your application tracker. Its "Resumes" tab checks your resume and saves it as a PDF. You can use the kit without it.

- Windows: double-click "jobhunt" in the folder (the one whose type is "Application"). The first time, if Windows says it protected your PC, click "More info" and then "Run anyway".
- Mac: double-click the program whose name starts with "jobhunt-mac" (there is only one). If it says it is not supported on this computer, you downloaded the wrong version. Open the Apple menu, then "About This Mac": if "Chip" says Apple, you need the Apple version; if "Processor" says Intel, you need the Intel version.
- Mac, first time: this program has no paid Apple signature, so it is blocked once. On macOS 15 or later, button names may differ slightly:
  1. Double-click the program. When the warning appears, click "Done".
  2. Open System Settings, then "Privacy & Security". Scroll down to the jobhunt line and click "Open Anyway".
  3. Enter your computer password.
  4. Double-click the program again and click "Open Anyway". From then on, double-clicking just works.

  Older Macs: right-click the program, choose "Open", then "Open" again in the warning.
- A text window opens too (a black window on Windows, Terminal on a Mac). That window is the program. Do not close it while you use the page. Close it when you are done. On a Mac, if it asks whether to terminate, choose Terminate.
- If the browser does not open by itself, copy the line that starts with http://127.0.0.1 from that window into your browser.
- If you closed the browser tab by accident, double-click the program again. It opens a new one.
- To open it from your Desktop with one click, make a shortcut to the program.
  - Windows 11: in the folder, right-click "jobhunt" (the one whose type is "Application"), choose "Show more options", then "Send to", then "Desktop (create shortcut)". Windows 10: right-click it, choose "Send to", then "Desktop (create shortcut)".
  - Mac: right-click the program whose name starts with "jobhunt-mac", choose "Make Alias", then drag the alias to your Desktop or Dock (probably, to be confirmed: not yet tested on a Mac).
  - A shortcut is only a door. It opens the program that stays in your job-search folder. **Never move the program itself out of the job-search folder; move only the shortcut.** The program must sit in the job-search folder to find your data. If you move it somewhere else alone and double-click it, it says "This folder does not look like a job-search folder".
  - If you move the whole job-search folder, the Desktop shortcut may stop working. If it does, delete it and make a new one.
- The program runs on your computer and does not send your information anywhere. The only thing it goes online for: at most once a day it asks GitHub whether a newer version exists (it asks for the version number only and sends none of your information). If there is one, a reminder appears at the top of the page and tells you how to update. To turn the reminder off, open jobhunt.yaml in this folder with Notepad (or TextEdit), find the line "update_check: true", change true to false, and save. If you cannot find that line (folders from older versions do not have it), add this line at the very end of the file: update_check: false

## If you use Cowork instead (backup)

If you have no Code tab, or you prefer Cowork:

1. In the Claude desktop app, start a new task in Cowork. It must be the desktop app.
2. In that task click "Add folder" and choose this folder. Do not use "Create project, then Use an existing folder": that way the AI can only read, cannot write, and does not follow the rules (tested).
3. Open "opening-prompt.txt" in this folder with Notepad (or TextEdit), select all, copy, paste it into the message box and send.

You must repeat all 3 steps every time you come back. If you skip one, the AI turns into a normal chat and will not follow the rules.

## Where your information goes

Your files stay in this folder on your computer. They are not sent to any jobhunt server. But whatever the AI reads is sent to the AI service you use to be processed (with Cowork, it processes the files it needs in the cloud).

So:

- Do not type your Social Security number, passport number, I-20 or SEVIS number, A-number, bank account numbers or passwords to the AI, and do not put them in this folder. If you do by accident, tell the AI and delete the message or file.
- Easiest way to share an old resume: open it, copy the text, and delete the lines with your date of birth, ID numbers and street address before you paste. Do the same to a Word file before you put it in "inbox".
- Your immigration status (visa type, CPT or OPT dates) is kept in `me/work-auth.md` only to help you answer application questions. It never goes on your resume or profiles.

## Save your resume as a PDF

If you opened the app, the easiest way is the "Save as PDF" button on its "Resumes" tab. It checks first, then opens the print window; continue from point 3 below.

The resume files the AI makes are in the "resumes" folder and end in .html. The file name is the company and job title, for example northfield-hr-assistant. The AI tells you which company it is for.

1. Open the resume file:
   - Windows: double-click it. It opens in your browser.
   - Mac: right-click, "Open With", Google Chrome. If you have no Chrome, use Safari.
2. Look at the yellow tip at the top. If it says the resume runs over one page, tell the AI to cut it. The yellow tip does not print.
3. Press Print: Ctrl + P on Windows, Cmd + P on a Mac.
4. Follow your browser (button names may differ slightly):
   - Chrome: Destination "Save as PDF". Paper size "Letter". Open "More settings" and turn off "Headers and footers". Click Save.
   - Edge: Printer "Save as PDF". Paper size "Letter". Open "More settings" and turn off "Headers and footers". Click Save.
   - Safari: bottom-left "PDF" menu, "Save as PDF". Click "Show Details", set Paper Size to "US Letter" and turn off "Print headers and footers". Safari may shift the layout. Open the PDF and check it; if it looks wrong, use Chrome or Edge.
5. Save it to your Downloads folder, not into this job-search folder. The PDF contains your phone number and the AI would read it here.

Always open the PDF and read it once: typos, missing pages, any "[Company Name]" or "TBD" left over, and whether every line is something you really did.

This version gives you a PDF, not a Word file. A PDF looks the same on every computer.

## Your LinkedIn and Handshake text

When you ask for it, the AI writes text blocks for your LinkedIn and Handshake profiles into the "profiles" folder (`linkedin.md` and `handshake.md`). You copy each block and paste it into the site yourself. The AI never logs in for you. Each block has a "Source:" line under it. Do not paste that line.

## Work authorization

The AI cannot give legal advice. It can check a job posting for lines like "no sponsorship now or in the future" and warn you before you spend time on it, and it can help you write truthful answers to "Are you authorized to work in the US?" and "Will you require sponsorship now or in the future?". Always confirm your situation with your school's international student office (the DSO).

## Stuck?

- The AI says it cannot read or write the folder: pick the folder again in the Code tab (in Cowork, click "Add folder" again).
- The AI seems to have forgotten the rules: say "Please read AGENTS.md in full, then continue". If that does not work, start a new conversation and say "continue".
- The conversation is long and the AI is slow or confused: start a new conversation and say "continue".
- You want to check the AI really saved your work: open "me", then "stories". Each confirmed experience is one file there.
- Messages like "Ran a command" or "Edited": the AI is saving files. That is normal.
- The AI offers to log in, press Submit or send an email for you: refuse. Applying is always your job.
- A .md file will not open when you double-click it: right-click, Open With, Notepad (Mac: TextEdit).
- Not sure what to do next: ask "What should I do now?"

If the folder contains the jobhunt program, the AI uses it to check numbers, wording, placeholders, ID numbers, visa words and profile length. Without it, the AI checks by hand following the rules. The program cannot tell whether the meaning is right, so read everything yourself before you apply.

To back up, copy the whole folder to a USB drive or cloud drive.

## If you use ChatGPT

Codex app: you need an OpenAI account (probably, to be confirmed). Open this folder in Codex and type "start". Codex should read AGENTS.md by itself (probably, to be confirmed). The same rule applies: do not let it log in to any site or apply for you.
