# YSNP Debug Handoff pointer

**Full findings (canonical):**  
`Documents/Obsidian Vault/_claude-memory/plans/2026-07-17-ysnp-debug-findings-HANDOFF.md`

**Session:** `_claude-memory/sessions/2026-07-17-ysnp-debug.md`  
**Open items:** top entry 2026-07-17

Scope: YSNP only. No ATLAS.

Local state at handoff time:
- Branch: `main`
- Uncommitted: `src/components/views/HomeView.tsx` (smart practice + simulation → selectSmartQuestions)
- Env: `.env.local` parked as `.env.local.sandbox-HOLD` (live `.env` active)
