# Roadmap

## 0.1 (now)

- Pluggable, combinable job sources: SimplifyJobs lists, 14 career-site readers, custom modules
- Tracks, exclusions, tiers, H-1B records; daily digest with baseline and failure carry-over
- resume.yaml + targets; fact, voice, layout checks; built-in HTML → PDF renderer; versions; archive
- applications.csv, follow-ups
- Any AI: AGENTS.md + playbooks (Claude Code, Codex, Gemini CLI, background agents), chat kit for ChatGPT /
  Claude Projects and Gemini Gems, `jobhunt tailor` with Anthropic / OpenAI / Gemini, GitHub Actions for
  check + build on commit and issue-driven tailoring

- Web app (no install): daily feeds, resume form, AI bridge with the same checks (shared test cases with Python),
  print-to-PDF, versions, applications, backup; MCP server with guardrails in the tools; backup ⇄ workspace

## Next

- **One-click MCP install** for Claude Desktop (.mcpb extension) so nobody edits a JSON config.
- **Web app: optional API key** to run the AI step inside the page.

- **Taiwan**: `is_tw` location matcher; sources for Taiwanese job boards and company career sites
  (check each site's terms of service before writing a reader; prefer official APIs or RSS);
  Chinese resume template (CJK fonts, 中文履歷 conventions); zh-TW skills.
- **Interview prep**: question cards from resume.yaml, spaced repetition (`drill`), mock-interview skill.
- **Local web UI**: browse jobs, edit targets with a live PDF preview, update application status.
- **More US sources**: GitHub README-table lists (with history replay so nothing between runs is missed),
  posting liveness checks for sources without open/closed flags, repost detection.
- **Upgrade command** for workspaces: refresh AGENTS.md / playbooks / workflows from a newer kit, showing a diff.
- **Claude Code plugin packaging**: install the skills with `/plugin install` and update them with the package.
- **More templates**: modern sans, two-column-safe variant, academic CV.

## Non-goals

- Auto-applying. You read every posting and send every application yourself.
- Scraping sites that forbid it, or hiding keywords for ATSs.
- Writing experience you don't have.
