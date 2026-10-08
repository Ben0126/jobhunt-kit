"""Follow-up reminders from data/applications.csv → data/followup.md.

  - next_action_date due (any active status)           → "to do today"
  - applied, no update for followup.nudge_days, contact → suggest a follow-up to that contact
  - applied, no update for followup.ghost_days          → "probably ghosted", suggest marking it
Days and status names come from jobhunt.yaml (followup:, statuses:).
"""
from __future__ import annotations

import datetime as dt

from jobhunt.tracker import applications
from jobhunt.util import strings


def _d(s):
    try:
        return dt.date.fromisoformat(str(s).strip())
    except ValueError:
        return None


def run(cfg, today: dt.date | None = None, write: bool = True) -> dict:
    today = today or dt.date.today()
    s, st, fu = strings(cfg.lang), cfg["statuses"], cfg["followup"]
    _, rows = applications.load(cfg)
    todo, ghost, stats = [], [], {}
    for r in rows:
        stats[r["status"]] = stats.get(r["status"], 0) + 1
        if r["status"] not in st["active"]:
            continue
        last = _d(r.get("last_update", "")) or _d(r.get("applied_date", ""))
        nxt = _d(r.get("next_action_date", ""))
        name = f"{r['company']} — {r['role']}"
        if nxt and nxt <= today:
            todo.append(f"- [ ] **{name}** ({r['status']}): {r.get('next_action') or s['due']}")
        elif r["status"] == st["applied"] and last:
            days = (today - last).days
            if days >= int(fu["ghost_days"]):
                ghost.append(f"- {name}: " + s["ghost"].format(days=days, status=st["ghosted"]))
            elif days >= int(fu["nudge_days"]) and r.get("contact"):
                todo.append(f"- [ ] **{name}**: " + s["nudge"].format(days=days, contact=r["contact"]))
    sent = sum(v for k, v in stats.items() if k not in st["not_sent"])
    replied = sum(stats.get(k, 0) for k in st["responded"])
    rate = f"{replied / sent:.0%}" if sent else "—"
    lines = [f"# {s['followup']} {today}", "",
             f"{s['stats']}: " + " | ".join(f"{k} {v}" for k, v in sorted(stats.items())),
             f"{s['reply_rate']}: {rate}", "", f"## {s['today']}", ""]
    lines += todo or [s["none"]]
    lines += ["", f"## {s['ghosted']}", ""] + (ghost or [s["none"]])
    if not write:
        return {"todo": todo, "ghost": ghost, "text": "\n".join(lines)}
    cfg.data.mkdir(parents=True, exist_ok=True)
    (cfg.data / "followup.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (cfg.data / ".has_todo").write_text("1" if (todo or ghost) else "0")
    return {"todo": todo, "ghost": ghost, "text": "\n".join(lines)}
