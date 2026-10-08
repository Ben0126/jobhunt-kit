// Prompts for the "AI bridge": the person copies one into any assistant (ChatGPT, Claude, Gemini…) and pastes the
// answer back. Every answer that changes the resume is checked by rules.js before it is accepted.

import { AI_WORDS, bulletMenu, plainText, resolve, tailor } from "./rules.js";

const LANG_NAME = { en: "English", "zh-TW": "Traditional Chinese (Taiwan)" };

export const RED_LINES = `RED LINES — never cross them, even if asked to "make it stronger":
1. Never invent experience. Only select, reorder and reword what the resume JSON already says.
2. Every number you write must already appear in the resume JSON (same unit for % and x). No new numbers.
3. No new tools, no bigger scope, no team results written as individual ones, no "led" where it says "helped".
4. Requirements the person doesn't meet go into "gaps" (for interview prep) — never into the resume.
5. Any assumption or unsure wording goes into "confirm" as a yes/no question for the person.`;

export const VOICE_RULES = `PLAIN VOICE — write like the person would explain it to a recruiter:
- Result first, then how. One or two things per sentence. No semicolons. At most one parenthesis per sentence.
- Never use: ${AI_WORDS.map((w) => w.replace(/\(\?:[^)]*\)\??/g, "").replace(/[\\?]/g, "")).join(", ")}.`;

function json(obj) {
  return "```json\n" + JSON.stringify(obj, null, 1) + "\n```";
}

export function importPrompt({ lang = "en", tracks = [] } = {}) {
  const ids = tracks.map((t) => `"${t.id}" (${t.label})`).join(", ");
  return `I'm setting up my job search in jobhunt (a resume tool). Convert my resume — attached, or pasted below — into JSON.

Rules:
- Copy facts exactly: same numbers, dates, names, tools, claims. Don't improve, shorten or add anything.
- Give every experience and project an "id" (short, lowercase, e.g. "acme"), and every bullet an "id" ("acme_planner").
- My job types are: ${ids || '"main"'}. Create one entry per job type under "variants".
  Add "variants": [...] to a bullet, experience, project or skills line only when it clearly fits just some job types;
  leave it out otherwise (= shown everywhere).
- "summary": {"default": "..."} — use my existing summary if there is one; otherwise leave it as "".
- Anything unclear or missing (no dates, a vague bullet): don't guess — add a question to "questions".

Answer with exactly one JSON code block in this shape, then a short note in ${LANG_NAME[lang]} listing the questions:

${json({
    resume: {
      basics: { name: "", email: "", phone: "", location: "", links: [{ label: "github.com/you", url: "https://github.com/you" }] },
      variants: Object.fromEntries((tracks.length ? tracks : [{ id: "main", label: "Main" }]).map((t, i) => [t.id, { title: t.label, major: i + 1 }])),
      summary: { default: "" },
      education: [{ school: "", degree: "", dates: "", location: "", details: [] }],
      experience: [{ id: "", org: "", role: "", dates: "", location: "", bullets: [{ id: "", text: "" }] }],
      projects: [{ id: "", name: "", link: "", dates: "", bullets: [{ id: "", text: "" }] }],
      skills: [{ label: "Languages", items: [] }],
    },
    questions: [],
  })}

My resume (if not attached):
`;
}

export function tailorPrompt({ resume, target, job, jd = "", lang = "en" }) {
  const variant = target.base_variant;
  const menu = bulletMenu(resume)[variant] || [];
  return `Tailor my resume to one job posting. You are an editor, not an author.

${RED_LINES}

${VOICE_RULES}

THE JOB
Company: ${job.company}
Role: ${job.title}
Link: ${job.link || "(none)"}
${jd.trim() ? `Description:\n${jd.trim()}` : "Open the link and read the full posting. If you cannot open links, STOP and ask me to paste the description."}

MY RESUME — the only source of facts:
${json(resume)}

WHAT TO PRODUCE
Start from the "${variant}" version. You may only use these bullet ids: ${menu.join(", ") || "(none)"}.
- "bullet_order": for each experience/project id, the bullet ids to show, strongest evidence for this job first;
  leave out bullets that don't help.
- "bullet_overrides": only where rewording helps (the JD's words for the same thing, result first). Same facts.
- "summary": 1–2 sentences: who I am + the result that matters most for this job.
- "skills_order": "Label: item, item" lines, this job's must-haves first, only skills my resume lists.
- "fit": score 1–5 with one reason. "keywords_hit": JD keywords my resume truly has. "gaps": JD asks, I don't have.
- "confirm": yes/no questions for every assumption. "application_answers": drafts for likely form questions.

Answer with exactly one JSON code block, using id "${target.id}" and base_variant "${variant}":

${json({ id: target.id, base_variant: variant, summary: "", bullet_order: { "<experience or project id>": ["<bullet id>"] },
    bullet_overrides: {}, skills_order: [], company: job.company, role: job.title, url: job.link || "",
    fit: "", keywords_hit: [], gaps: [], confirm: [], application_answers: {} })}

After the code block, explain your choices in 3–5 short lines in ${LANG_NAME[lang]}.`;
}

/** Human-readable problems (English, for the AI) from rules.checkTarget(). */
export function describeErrors(errs) {
  return errs.map((e) => {
    switch (e.code) {
      case "numbers": return `${e.field}: the numbers ${e.numbers.join(", ")} are not in my resume. Remove them, or ask me in "confirm".`;
      case "voice": return `${e.field}: ` + e.problems.map((p) => p.code === "ai_word" ? `AI-sounding word "${p.word}"`
        : p.code === "parens" ? `${p.n} parentheses in one sentence (max 1)` : "semicolon (split into two sentences)").join("; ");
      case "tailor": return e.message;
      case "id": return `id must be lowercase-with-dashes (got ${JSON.stringify(e.id)})`;
      case "list": return `${e.field} must be a list`;
      case "json": return `not valid JSON: ${e.message}`;
      default: return "the answer must be one JSON object (the target)";
    }
  });
}

export function fixPrompt(errs) {
  return `Your tailored resume fails these checks:\n- ${describeErrors(errs).join("\n- ")}\n\n` +
    "Fix every one without adding facts, and answer with the complete corrected JSON in one code block.";
}

export function reviewPrompt({ resume, target, job, jd = "", lang = "en" }) {
  const doc = resolve(tailor(resume, target), target.base_variant);
  return `Review this resume before I send it. Important: if you wrote or edited this resume earlier in this chat, say so —
I should open a new chat (or another AI) for an independent review.

Judge it three times, independently, and quote the resume for every point:
1. ATS / AI screening: would a parser read name, contact, education dates and titles correctly? Are the job's
   must-have keywords present verbatim, ideally inside experience bullets? Grade A–D like an AI pre-screen.
   (Don't repeat myths: tables are not auto-rejected; never suggest hidden keywords.)
2. Recruiter (not an engineer, 10 seconds): is it clear what role I want? Degree and graduation date OK? Any sentence
   a non-engineer can't follow, or that reads AI-written? Rewrite those in plain words using only facts on the page.
3. Hiring manager on the team: which bullet is the strongest, which is least credible and how would you probe it?
   Label every bullet keep / rewrite / needs support / cut / ask me.

Never suggest adding experience I don't have. Things I lack are interview prep, not resume content.
Verdict: send / fix first / don't send. Must-fix only for: a misread hard field, untrue or unconfirmed content,
a failed hard requirement, or an unreadable summary / first bullet. Everything else is a suggestion.
Answer in ${LANG_NAME[lang]}.

THE JOB: ${job.company} — ${job.title} ${job.link || ""}
${jd.trim() ? `Description:\n${jd.trim()}\n` : ""}
THE RESUME (as text):
${plainText(doc)}

KNOWN GAPS (I have NOT done these — don't put them on the resume): ${(target.gaps || []).join("; ") || "none"}

MY FULL RESUME FACTS (to check claims against):
${json(resume)}`;
}

export function followupPrompt({ app, lang = "en", days = 0 }) {
  return `Draft a short follow-up email about my job application. Plain, specific, polite, under 120 words, no flattery,
no "I hope this email finds you well". Write the email in English; add one line of advice in ${LANG_NAME[lang]} after it.

Company: ${app.company}
Role: ${app.role}
Applied on: ${app.applied_date || "?"} (${days} days ago)
Contact: ${app.contact || "the recruiter"}
Notes: ${app.notes || "-"}`;
}

/** Pull the first JSON object out of an assistant's answer (code block or bare). */
export function extractJson(text) {
  const blocks = [...String(text).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = blocks.length ? blocks : [String(text).slice(String(text).indexOf("{"), String(text).lastIndexOf("}") + 1)];
  let last;
  for (const c of candidates) {
    try { return JSON.parse(c); } catch (e) { last = e; }
  }
  throw new SyntaxError(last ? last.message : "no JSON found");
}
