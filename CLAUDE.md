# YouShellNotPass — Project Context

> This file is auto-loaded by Claude Code and Cursor. It contains full project and user context.
> **Last synced from live repo + Vercel + GitHub: April 6, 2026**

---

## Who I Am

- **Name:** Dr. Idan Katz
- **Role:** Year 3 Resident — Anesthesia, Intensive Care & Pain Medicine
- **Hospital:** Ichilov (Tel Aviv Sourasky Medical Center)
- **Exam:** Step 1 (שלב א') — target ~June 2026
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
| Hosting | Vercel — team: `team_9nc4gBGF5aLVsHGGf7vJiWld`, project: `prj_TVptaSlthQVDRSlxyN5gjslw5Y0s` |
| Backend/DB | Supabase — project ID: `ksbblqnwcmfylpxygyrj` |
| Auth | Email+password + Google OAuth (email confirm OFF) |
| AI (explanations) | Anthropic API → Supabase Edge Function `matot-report` |
| Source | https://github.com/idankatz64-commits/anesthesiology-mentor.git |

**Local code (CORRECT PATH):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/`

> ⚠️ IMPORTANT: There is also an OLD copy at `/Users/idankatz15/Desktop/3_APP_DEV/anesthesiology-mentor-main/` — DO NOT use it. It is outdated. Always use `repo-temp`.

**WARNING:** Do NOT touch Supabase project `agmcauhjhfwksrjllxar` — it's the old inactive project.

## How Changes Work

- **DB (tables, RLS, functions):** Via Supabase MCP directly — instant
- **Edge Functions:** Edit in `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/supabase/functions/` → deploy via Supabase CLI
- **Frontend:** Edit in `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/` → `git push` → Vercel auto-deploys (~1 min)

## Active Edge Functions

| Function | Purpose |
|---|---|
| `sync-questions` | Sync from Google Sheets → Supabase (admin only) |
| `daily-csv-export` | Send daily CSV to email |
| `admin-manage-users` | Add/manage admins and editors |
| `matot-report` | Explain question via Claude API (Anthropic) |
| `weekly-report` | Weekly 7-day question digest email |
| `ai-summary` | AI learning summary (daily/weekly via Claude) |

## Supabase Tables (current as of April 2026)

| Table | Purpose |
|---|---|
| `questions` | All exam questions (fetched with sessionStorage cache) |
| `user_answers` | Per-user answer history with atomic upsert via `increment_user_answer()` |
| `answer_history` | Full answer log per attempt |
| `spaced_repetition` | SM-2 algorithm data per user+question |
| `admin_users` | Admin/editor roles |
| `categories` | Topic classifications |
| `formulas` | 98 Miller formulas (chapter filter) |
| `calculator_formulas` | Interactive calculator formulas with expressions |
| `user_favorites` | Bookmarked questions |
| `user_notes` | Per-question notes |
| `user_ratings` | easy/medium/hard ratings |
| `user_tags` | Custom tags on questions |
| `user_feedback` | User-submitted feedback |
| `user_weekly_plans` | Weekly study plan |
| `saved_sessions` | Auto-saved session state |
| `topic_summaries` | Miller chapter summaries (Summaries module) |
| `resource_links` | External resource links (shown in toolbar) |
| `community_notes` | Shared notes between users |
| `question_audit_log` | Audit log for question edits |
| `question_edit_log` | Edit history per question |
| `study_rooms` | Multiplayer study rooms |
| `room_participants` | Room participants |
| `room_answers` | Answers within rooms |
| `anki_decks` | Anki-style decks |
| `anki_cards` | Anki-style flashcards with SM-2 |

## Current Features (LIVE as of April 6, 2026)

### Study Core
- **Session mode** — practice questions with answer selection, confidence rating, flagging
- **Simulation mode** — exam-style timed session
- **Smart question selection** — two-stage topic-aware selection (Hamilton method, SRS urgency)
- **SRS (Spaced Repetition)** — SM-2 algorithm, 'לחזור' button to reset and force review
- **Resume session** — auto-saves and resumes interrupted sessions

### Content
- **Formulas** — 98 Miller formulas, chapter filter, descriptions
- **Formula calculator** — interactive calculator with clinical descriptions (Hebrew)
- **Miller study guide** — 72 chapter summaries (public/study-guide/)
- **Summaries module** — SummariesView for per-chapter notes

### Admin / Editor
- **QuestionEditorTab** — edit questions, explanations, correct answers inline
- **FormulaManagementTab** — manage formulas and calculator formulas
- **SummariesManagementTab** — manage chapter summaries
- **ResourceLinksTab** — manage external resource links
- **UserManagementTab** — manage user roles
- **ImportQuestionsTab** — import from CSV/Google Sheets
- **EditorActivityTab** — view editor activity log

### UI
- **Image gallery** — Critical Visuals from explanations, lightbox zoom
- **Resource links** — in TopNav and session toolbar (🔗 popover)
- **AI explanation drawer** — Claude API explains any question
- **AI summary** — daily/weekly learning summary
- **Flashcard mode** — FlashcardView
- **Stats dashboard** — StatsView with 10+ tiles (ERI, forgetting risk, heatmap, treemap, etc.)
- **Notebook** — per-question notes with RichTextEditor
- **Comparative stats** — community performance comparison
- **Dark/light mode** — full theme support
- **Mobile support** — MobileBottomNav, MobileHeader
- **Keyboard shortcuts** — full keyboard navigation
- **Share question** — ShareQuestionButton
- **Feedback modal** — user feedback submission
- **Weekly plan** — WeeklyPlanView
- **Reset password** — full forgot password flow
- **Google OAuth** — sign in with Google

### Data
- **CSV export** — strips `<img>` HTML before export
- **Daily CSV email** — automated daily export

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
Questions were previously fetched from Google Sheets CSV — **now fetched from Supabase `questions` table with sessionStorage cache.**

---

*Last updated: April 6, 2026 — synced from GitHub + Vercel MCP*
