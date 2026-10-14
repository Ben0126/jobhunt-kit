# Taiwan in this folder: the Chinese layer (taiwan)

**When to use**: this folder looks for work in the US and in Taiwan. Read this in full before writing any Chinese that leaves
the folder (a Chinese resume, 104 fields, a Chinese 自傳, cover letter or interview script) and before any 104 work.
**What it produces**: Chinese cards, the `## 中文確認時的句子（不能改）` section of a story, Chinese items in `resume.yaml`,
Taiwan targets and resume files, and (with `fill-104.md`) the 104 texts.

AGENTS.md red lines always win. English is the main language of this folder: every fact is first confirmed on an English
card (`dig-experience.md`, `dig-cards.md`). Chinese is made from those cards when a Taiwan application needs it, never before.
Talk to the person in their language; when you show Chinese resume text, it is Traditional Chinese (繁體中文).

## 1. The Chinese card

Make one only for a story that is `status: confirmed` and only when a Taiwan application needs it. One card per message,
the same way as the English cards. On screen (in Chinese; English only where it is the card's English):

```text
中文卡 S-003：Campus bookstore cashier
英文（你確認過的）：
1. Worked the register on weekends.
2. Taught about 5 new employees to use the register at the manager's request.
中文：
1. 週末負責收銀。
2. 應店長要求，教約 5 位新進同事操作收銀機。
職稱：Cashier → 收銀員
單位：Northfield State University Bookstore → 諾斯菲爾德州立大學書店（他寫的中文名稱）
日期：Sep 2024 – May 2025 → 2024-09 – 2025-05
數字：約 5 位 ← 原話「unos 5 en total」（和英文卡一樣）
對的話打「確認中文 S-003」。要改就直接說哪裡。
```

Rules for the Chinese sentences:

- **Same meaning, not bigger.** Every Chinese sentence says what its English sentence says and nothing more. Verbs follow
  the English card and the person's words behind it: helped -> 協助, worked/did -> 負責 only when the English says they did
  it themselves; 管理、帶領、主導、規劃 only when the English card says that and their own words describe it.
- **Numbers are the English card's numbers**, written the Taiwan way (section 3): "about 5" -> 約 5 位, "a dozen" -> 12 位,
  "20+" only if the English card had it and their words said "more than". Never a new number.
- **Title, organization, dates**: the title is translated word for word and shown next to the English one. The Chinese
  name of a school, company or club is the one the person writes (official name); never translate a name yourself, ask:
  「這個單位的中文名稱是什麼？照官方寫法打給我。」 Dates in the Taiwan format: `2024-09 – 2025-05`, `2025-06 – 至今`.
- Only a reply that names the card counts (「確認中文 S-003」, "confirm Chinese S-003"); "ok", "好", "都可以" do not. A reply
  that changes something: change it and show the card again. One reply confirms one card.

After「確認中文 S-003」, at once:

1. Add this at the end of `me/stories/S-003.md`, copied from the card word for word, in exactly this format (the program
   reads it; nothing else inside the block):

   ```markdown
   ## 中文確認時的句子（不能改）

   職稱：收銀員
   機構：諾斯菲爾德州立大學書店
   日期：2024-09 – 2025-05
   1. 週末負責收銀。
   2. 應店長要求，教約 5 位新進同事操作收銀機。
   ```

   Leave out `職稱：` when the card has no title, and `機構：` / `日期：` when the story has none. Never edit the block later; to
   change it, make a new Chinese card and replace the whole block after it is confirmed.
2. In `resume.yaml` add a **separate item** (never edit the English one): `id` with `_zh` (`s003_zh`, bullets `s003_zh_a`…),
   `variants: [tw]`, `org` = 機構, `role` = 職稱, `dates` = 日期, each bullet `text` = one card sentence word for word with
   `source: S-003`. The program check compares these with the block and reports any difference.

**Education and contact details in Chinese**: one card for all education lines (school and department as the person writes
them in Chinese, dates in the Taiwan format), confirmed by「確認中文學歷」. Then add `education` items with
`variants: [tw]` and `source: 學歷`. The phone number and email are the same as the English ones; the city is written in
Chinese only if they tell you which (台北市、新北市…).

**Skills in Chinese**: a skills line with `variants: [tw]`, a Chinese label (語言、證照、文書工具、軟體), items copied from the
English skills lines. Tool names stay as they are (Excel, Canva). Anything translated (Spanish -> 西班牙語、母語) goes on a
Chinese card first. `sources` are the same S- codes as the English line.

## 2. Taiwan jobs (targets)

- `targets/<id>.yaml`: `market: tw`. A Chinese resume: `base_variant: tw`, `lang: zh-TW`, `template: tw` (dark header) or
  `tw-classic` (refined single column), A4. An English resume for a foreign company in Taiwan: `base_variant: en`,
  `template: en`, A4, `market: tw`.
- `bullet_order` lists only the `_zh` bullets for a Chinese resume (only English ones for an English one).
- A Chinese `summary` (自我介紹) is a new sentence: put it in `confirm` as a yes/no question with the English sources next to
  it, the same way as every rewrite. Two or three sentences, only confirmed facts.
- Photo: Taiwan resumes may have one. Ask once, only when making a Chinese resume:「中文履歷要放大頭照嗎？（可以不放）」.
  `photo: true` or `photo: false`. The person adds the photo in the program (its 履歷 page). Never open, look at, describe,
  edit or create a photo.
- For a Taiwan job, skip the work-authorization screen of `tailor-resume.md`. Everything else in that playbook applies
  (save the posting word for word, fit analysis on confirmed facts only, `injected_lines`).

## 3. Chinese wording and numbers (every Chinese text that leaves the folder)

1. **Numbers**: only numbers the person said about the same thing. Exact ones in half-width digits (30%、12 位). Rough ones
   keep their size in written form, with their words next to it on the card: 「十幾」→「十多位」、「二十幾」→「20 多位」、
   「兩百多」→「200 多份」、「幾十」→「數十」、「上百」→「上百」. Never an exact or middle number for a rough one (not 15 位 for
   十幾), never bigger (not 近 20, not 200+ for 兩百多). 「很多」「好幾次」 have no size: no number.
2. **Words not allowed in Chinese**: 賦能、打造、致力於、全方位、無縫、極致、卓越、熱忱、充滿熱情、成功地、積極主動、具備優秀.
   Self-praise (細心、有責任感、認真、抗壓、學習力強、溝通能力佳、熟悉、精通) stays only when the same sentence gives one confirmed
   example; an adjective alone is cut.
3. **Sentence shape**: no semicolons (；or ;). At most one pair of brackets per sentence (not counting the skills line).
   A Chinese sentence over about 60 characters is split.
4. **Placeholders**: none of 「（姓名）」「（學校）」「【公司名稱】」「（待補）」、OO、OOO、○○、XX、某某、＿＿, `{{`, TODO.
5. **Sources**: every paragraph of 104 text, 自傳, cover letter or interview script has its source line under it:
   `來源：S-003、S-007`. Only S- codes, `學歷`, `求職方向` (what they said in me/profile.md about the work and places they
   want), joined by「、」. Tell them the line is not pasted into 104.

The manual check for a Chinese text is section 3 plus the meaning check of AGENTS.md (every sentence against its Chinese card).
Write the result in `checks/<id>.md` (104 master resume: `checks/_104.md`) like the English ones, in Chinese headings if
the text is Chinese.

## 4. The Chinese resume file

Follow `make-resume-file.md` step by step, with these differences:

- Template `templates/resume-tw.html` (or `resume-tw-classic.html` when the target says so). The notes inside the template
  mention step numbers of another playbook: ignore those numbers and follow `make-resume-file.md` and this section.
- Content: the `tw` variant of `resume.yaml` (only `_zh` items, Chinese education and skills). Section order:
  `variants.tw.sections` (default 自我介紹、學歷、工作與社團經歷、專題與活動、專長). An empty section is left out.
- 「希望職稱」 line: only a title the person said in Chinese for the work they want (me/profile.md); otherwise delete that line.
- Contact line: 手機, Email, 居住縣市 (only those they gave). No birthday, ID, address, marital status.
- Dates exactly as in `resume.yaml`. A4, one page is the goal: over one page is a reminder, never a block, and never a
  smaller font.
- The program check runs as usual (`check <id>`): it checks a Taiwan job with the Taiwan rules and the Chinese items against
  the Chinese cards.

## 5. 104

Follow `fill-104.md` (it comes from the Taiwan kit and is written in Chinese). Where it points somewhere else, read it this way:

| `fill-104.md` says | In this folder |
|---|---|
| AGENTS.md 紅線 2（數字） | section 3.1 above |
| AGENTS.md 紅線 13（來源行） | section 3.5 above |
| AGENTS.md 紅線 11、12、14（薪資、社團、截圖） | "Taiwan red lines" in AGENTS.md |
| AGENTS.md「經歷怎麼變成已確認」 | confirmed English cards; Chinese text only from their Chinese cards (section 1) |
| AGENTS.md 手動檢查（第 3 項、六項） | section 3 above, plus the meaning check against the Chinese cards |
| AGENTS.md「怎麼說話」 | AGENTS.md "How to talk" |
| `dig-experience.md`（挖經驗） | this folder's `dig-experience.md` (English cards first, then a Chinese card) |
| 確認時的句子 | the `## 中文確認時的句子（不能改）` block |

`104/履歷欄位.md` and `jobs/<id>/104-apply.md` are written as `fill-104.md` says, in Chinese, only from Chinese cards. Then
run the program check (`check --104` for the master resume, `check <id>` for an application).

## 6. me/profile.md

Keep one profile. Add a `## Taiwan` section for what they said about Taiwan jobs (the work and places they want, full or
part time, when they can start, expected salary only if they said a number). Mark anything you inferred as 推定 / inferred;
it is never a source.
