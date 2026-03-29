# YouShellNotPass — Project Context

> This file is auto-loaded by Claude Code and Cursor. It contains full project and user context.

---

## Who I Am

- **Name:** Dr. Idan Katz
- **Role:** Year 3 Resident — Anesthesia, Intensive Care & Pain Medicine
- **Hospital:** Ichilov (Tel Aviv Sourasky Medical Center)
- **Exam:** Step 1 (שלב א') — target ~June 2026 (~96 days from March 2026)
- **Language:** Hebrew preferred. English OK for code/technical terms.
- **Code background:** Zero. Explain everything like teaching a child. Never assume familiarity with code.

## The App — YouShellNotPass

- **URL:** https://anesthesiology-mentor.vercel.app
- **Purpose:** Study app for Step 1 exam — past exam questions + simulations based on Miller's Anesthesia 10th ed.
- **Future vision:** Personalized learning companion for residents from Day 1 — all medical departments
- **Status:** Live, used by department residents. Non-commercial.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui |
| Hosting | Vercel (auto-deploy on git push, ~1min) |
| Backend/DB | Supabase — project ID: `ksbblqnwcmfylpxygyrj` |
| Auth | Email+password + Google OAuth (email confirm OFF) |
| AI (explanations) | Anthropic API → Supabase Edge Function `matot-report` |
| Source | https://github.com/idankatz64-commits/anesthesiology-mentor.git |

**Local code:** `/tmp/anesthesiology-mentor/`

**WARNING:** Do NOT touch Supabase project `agmcauhjhfwksrjllxar` — it's the old inactive project.

## How Changes Work

- **DB (tables, RLS, functions):** Via MCP directly — instant
- **Edge Functions:** Edit in `/tmp/anesthesiology-mentor/supabase/functions/` → deploy via Supabase CLI
- **Frontend:** Edit in `/tmp/anesthesiology-mentor/src/` → `git push` → Vercel auto-deploys

## Active Edge Functions

| Function | Purpose |
|---|---|
| `sync-questions` | Sync from Google Sheets (admin only) |
| `daily-csv-export` | Send daily CSV to email |
| `admin-manage-users` | Add admins/editors |
| `matot-report` | Explain question via Claude API |

## Feature Plan (Approved)

### Before Step 1 Exam
1. **Image uploads** — "Upload image" button in RichTextEditor → Supabase Storage → `<img>` in HTML. Solves: ECG, graphs, photos from book.
2. **Similar questions** — Bottom of each question: more questions from same Miller chapter. Click → jump to that question.

### After Step 1 Exam
3. **Summaries module** — Sub-category in "My Notebook". Tag to Miller chapter, edit with RichTextEditor, save to Supabase.
4. **Link summaries to explanations** — Manual link from explanation to related summary. Future: Claude API auto-generates and links.

### Planned for Current Session (March 29, 2026)
1. **Formulas + Calculator** — User will upload formulas file. Update formulas window + calculator. Add `description` field to existing JSON per formula.
2. **HTML links in toolbar during practice** — Add HTML links as separate icon visible always (including inside SessionView). Currently Notebook is accessible but HTML files are not.
3. **Design polish (Apple style)** — Not a redesign. Spacing + consistent colors + micro-interactions. Same style, more refined.
4. **CSV export without image HTML** — Filter out `<img` tags before export, or export only basic text fields.
5. **AI chapter agent (future idea)** — One smart agent per chapter with dynamic context (questions + summary + formulas + performance). NOT 76 separate agents — one agent with RAG.

## Communication Rules

- **Always ask clarifying questions** before starting. Better 100 questions than a bad result.
- **Say directly** if hitting context/capability limits — offer to continue later.
- **Give real answers** even if not what he wants to hear — never sugar-coat.
- **Explain all technical actions** in plain language.
- **Never assume** he understands code.

## Context: Previous Stack (do NOT revert to)

App started as Google Sheets + NotebookLM → Gemini HTML → Lovable → now Vercel + Claude Code.
**Lovable crashed** (DB overload, 544 errors). Current stack is completely independent.
**Never suggest Lovable as a solution.**

---

*Last updated: March 2026*
