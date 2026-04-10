# Claude Working Memory System — Design Spec
**Date:** 2026-04-10  
**Status:** Implemented

---

## Problem

Every Claude Code session starts cold. There is no mechanism to automatically recall:
- Decisions made in previous sessions
- Features that were built and how
- Context that took tokens to re-establish

The previous `/wrap-up` skill was supposed to save to NotebookLM but the MCP didn't exist — sessions were lost silently.

---

## Solution: Approach 1 — Clean Separation

```
NotebookLM  →  "Miller Brain" — irreplaceable for study content (94 PDFs, semantic search)
Obsidian    →  "Claude Working Memory" — project decisions, sessions, context
```

Each tool does what it does best. No overlap.

---

## Architecture

### Memory Storage
```
/Users/idankatz15/Documents/Obsidian Vault/_claude-memory/
├── INDEX.md          ← master index: sessions, key decisions, open items
├── 2026-04-10.md     ← session summary (created by /wrap-up)
├── 2026-04-11.md
└── ...
```

### Session Start (Automatic)
```
SessionStart hook fires
    ↓
claude-memory-loader.js runs
    ↓
Reads 3 most recent session files (≤2000 chars each)
    ↓
Reads Key Decisions + Open Items from INDEX.md
    ↓
Prints as system context → Claude has working memory
```

### Session End (Manual)
```
User runs /wrap-up
    ↓
Claude scans full conversation
    ↓
Creates structured summary (topics, decisions, medical insights, open items)
    ↓
Saves to _claude-memory/YYYY-MM-DD.md  ← ALWAYS works
    ↓
Updates INDEX.md (sessions table + decisions log + open items)
    ↓
Tries NotebookLM save if MCP available  ← optional bonus
```

---

## Files Changed

| File | Change |
|------|--------|
| `~/.claude/skills/wrap-up/SKILL.md` | Rewritten — saves to Obsidian as primary |
| `~/.claude/hooks/claude-memory-loader.js` | New — SessionStart hook |
| `~/.claude/settings.json` | Added claude-memory-loader to SessionStart hooks |
| `Obsidian Vault/_claude-memory/INDEX.md` | New — master index |

---

## Token Economics

| Before | After |
|--------|-------|
| ~0 tokens of context (everything lost) | ~3-6K tokens of targeted context |
| Re-explanation cost: ~5-20K tokens per session | Re-explanation cost: ~0 |
| Net: expensive cold starts | Net: cheap warm starts |

Loading 3 recent sessions costs ~3-6K tokens but saves 5-20K tokens of re-explanation. **Net positive every session.**

---

## What NotebookLM Still Does

NotebookLM remains the primary engine for:
- Questions about Miller's Anesthesia content (94 PDF sources)
- Study session summaries and medical insights
- Board exam question analysis

It is NOT used for Claude's working memory — that role now belongs to Obsidian.

---

## Usage

**End of session:** `/wrap-up` → saves automatically  
**Next session:** memory loads automatically via hook  
**Manual check:** read `_claude-memory/INDEX.md` in Obsidian

