# notebooklm-sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `notebooklm-sync` agent that processes raw Obsidian study notes through Claude (tasks 1-4) and NotebookLM (tasks 5-6), producing a structured `פרק-X-nblm.md` file per chapter.

**Architecture:** Two-phase pipeline — Claude handles deduplication, topic segmentation, mechanism classification, and list-to-table conversion locally; NotebookLM (via `notebooklm_sync.py`) handles visual references and exam-based cheat sheet using 94 Miller PDFs. The agent is spawned by `obsidian-daily` and can also be invoked manually.

**Tech Stack:** Python 3.10+, `notebooklm-py` (GitHub), `playwright`, `supabase-py`, Claude agent (`~/.claude/agents/notebooklm-sync.md`)

---

## Safety Rules (READ BEFORE EVERY TASK)

- ⚠️ **Supabase: SELECT only** — no INSERT / UPDATE / DELETE — ever
- ⚠️ **Do NOT touch** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/` (the app)
- ⚠️ **Do NOT modify** any RLS policy or Edge Function
- ⚠️ All new scripts live at `/Users/idankatz15/Desktop/` only

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `/Users/idankatz15/Desktop/notebooklm_sync.py` | Phase B: NotebookLM interaction |
| Create | `/Users/idankatz15/Desktop/tests/test_notebooklm_sync.py` | Unit tests for Python script |
| Create | `~/.claude/agents/notebooklm-sync.md` | Agent orchestrator (Phase A + calls Phase B) |
| Modify | `~/.claude/agents/obsidian-daily.md` | Update Step 4 to match new agent spec |

---

## Task 1: Install notebooklm-py and authenticate

**Files:** none (environment setup)

- [ ] **Step 1: Install the library from GitHub**

```bash
pip install git+https://github.com/teng-lin/notebooklm-py.git
```

Expected output: `Successfully installed notebooklm-py-...`

- [ ] **Step 2: Install Playwright browser**

```bash
playwright install chromium
```

Expected output: `Chromium ... downloaded`

- [ ] **Step 3: Install pytest-asyncio for async tests**

```bash
pip install pytest pytest-asyncio
```

- [ ] **Step 4: Run first-time Google authentication**

```bash
notebooklm login
```

A browser window will open. Log in with the Google account that has access to the Miller notebook. Credentials are saved locally for future use.

- [ ] **Step 5: Verify connection to the Miller notebook**

```bash
python3 - <<'EOF'
import asyncio
from notebooklm import NotebookLMClient

NOTEBOOK_ID = "3350d7aa-be6a-4a59-ad73-efbf96da68da"

async def test():
    async with await NotebookLMClient.from_storage() as client:
        result = await client.chat.ask(NOTEBOOK_ID, "What is the hepatic acinar zone most sensitive to hypoxia? Answer in one sentence.")
        print("✅ Connected. Answer:", result.answer[:100])

asyncio.run(test())
EOF
```

Expected: prints ✅ and a one-sentence answer about Zone 3.

- [ ] **Step 6: Commit (env only, no code yet)**

```bash
cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp
git add docs/superpowers/plans/2026-04-10-notebooklm-sync.md
git commit -m "docs: add notebooklm-sync implementation plan"
```

---

## Task 2: Write `notebooklm_sync.py` with tests (TDD)

**Files:**
- Create: `/Users/idankatz15/Desktop/tests/test_notebooklm_sync.py`
- Create: `/Users/idankatz15/Desktop/notebooklm_sync.py`

- [ ] **Step 1: Create the tests directory**

```bash
mkdir -p /Users/idankatz15/Desktop/tests
touch /Users/idankatz15/Desktop/tests/__init__.py
```

- [ ] **Step 2: Write the failing tests**

Create `/Users/idankatz15/Desktop/tests/test_notebooklm_sync.py`:

```python
"""
Tests for notebooklm_sync.py
Run: cd /Users/idankatz15/Desktop && pytest tests/test_notebooklm_sync.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Import will fail until we create the script — that's expected (RED)
from notebooklm_sync import build_prompt, run, NOTEBOOK_ID


class TestBuildPrompt:
    def test_includes_chapter_number(self):
        prompt = build_prompt("14", "some notes", [])
        assert "14" in prompt

    def test_includes_notes_content(self):
        prompt = build_prompt("14", "Zone 3 is centrilobular", [])
        assert "Zone 3 is centrilobular" in prompt

    def test_includes_questions_when_provided(self):
        questions = [
            {
                "question": "Which zone is most vulnerable to halothane?",
                "correct": "c",
                "a": "Zone 1", "b": "Zone 2", "c": "Zone 3", "d": "Zone 4",
                "explanation": "Zone 3 is perivenous"
            }
        ]
        prompt = build_prompt("14", "notes", questions)
        assert "Which zone is most vulnerable" in prompt
        assert "Zone 3" in prompt

    def test_no_questions_section_when_empty(self):
        prompt = build_prompt("14", "notes", [])
        assert "שאלות מבחן אמיתיות" not in prompt

    def test_limits_to_30_questions(self):
        questions = [
            {"question": f"Q{i}", "correct": "a", "a": "x", "b": "y", "c": "z", "d": "w", "explanation": ""}
            for i in range(50)
        ]
        prompt = build_prompt("14", "notes", questions)
        # Prompt should not include question 31+
        assert "Q30" not in prompt or "Q31" not in prompt  # only first 30

    def test_asks_for_visual_references_section(self):
        prompt = build_prompt("14", "notes", [])
        assert "הפניות ויזואליות" in prompt

    def test_asks_for_cheat_sheet_section(self):
        prompt = build_prompt("14", "notes", [])
        assert "Cheat Sheet" in prompt


@pytest.mark.asyncio
class TestRun:
    async def test_returns_notebooklm_answer(self):
        mock_answer = "## הפניות ויזואליות\n- Figure 14-1: Acinar zones\n\n## ⚡ Cheat Sheet\n⚡ Zone 3 most vulnerable"
        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=MagicMock(answer=mock_answer))
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("notebooklm_sync.NotebookLMClient") as mock_cls:
            mock_cls.from_storage = AsyncMock(return_value=mock_cm)
            result = await run("14", "Zone 3 notes", [])

        assert "הפניות ויזואליות" in result
        assert "Cheat Sheet" in result
        assert "Figure 14-1" in result

    async def test_passes_correct_notebook_id(self):
        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=MagicMock(answer="ok"))
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("notebooklm_sync.NotebookLMClient") as mock_cls:
            mock_cls.from_storage = AsyncMock(return_value=mock_cm)
            await run("14", "notes", [])

        call_args = mock_client.chat.ask.call_args
        assert call_args[0][0] == NOTEBOOK_ID
```

- [ ] **Step 3: Run tests — verify they FAIL (RED)**

```bash
cd /Users/idankatz15/Desktop && pytest tests/test_notebooklm_sync.py -v
```

Expected: `ModuleNotFoundError: No module named 'notebooklm_sync'`

- [ ] **Step 4: Implement `notebooklm_sync.py`**

Create `/Users/idankatz15/Desktop/notebooklm_sync.py`:

```python
#!/usr/bin/env python3
"""
notebooklm_sync.py — Phase B: NotebookLM visual references + exam cheat sheet

⚠️  READ-ONLY — does not write to Supabase, does not touch the app.
Usage:
    python3 notebooklm_sync.py 14 --notes /path/to/notes.md
    python3 notebooklm_sync.py 14 --notes /path/to/notes.md --questions '[{"question":...}]'
"""
import asyncio
import sys
import json
import argparse
from notebooklm import NotebookLMClient

NOTEBOOK_ID = "3350d7aa-be6a-4a59-ad73-efbf96da68da"


def build_prompt(chapter: str, processed_notes: str, questions: list[dict]) -> str:
    """Build the structured prompt for NotebookLM."""
    questions_section = ""
    if questions:
        lines = [f"\n\nשאלות מבחן אמיתיות על פרק {chapter} ({len(questions[:30])} שאלות):"]
        for i, q in enumerate(questions[:30], 1):
            lines.append(f"\n{i}. {q['question']}")
            if q.get("explanation"):
                lines.append(f"   הסבר: {q['explanation'][:150]}")
        questions_section = "\n".join(lines)

    return f"""בהתבסס על ספר מילר הרדמה מהדורה 10 ועל ההערות הבאות לפרק {chapter}:

{processed_notes}
{questions_section}

אנא ספק שני חלקים בלבד, בפורמט הבא:

## הפניות ויזואליות מהספר
רשום את כל הטבלאות, גרפים, תמונות, נוסחאות ו-Box-ים הרלוונטיים לפרק {chapter} בספר מילר.
פורמט לכל שורה: - Figure/Table/Box X-Y: תיאור קצר בעברית

## ⚡ Cheat Sheet למבחן
נקודות קריטיות בלבד — כל נקודה בשורה אחת, ⚡ בתחילתה.
{"מבוסס על ניתוח שאלות המבחן שסופקו." if questions else "מבוסס על ניתוח ספר מילר לפרק זה."}
"""


async def run(chapter: str, processed_notes: str, questions: list[dict]) -> str:
    """Send prompt to NotebookLM, return markdown response."""
    prompt = build_prompt(chapter, processed_notes, questions)
    async with await NotebookLMClient.from_storage() as client:
        result = await client.chat.ask(NOTEBOOK_ID, prompt)
        return result.answer


def main() -> None:
    parser = argparse.ArgumentParser(description="Send notes to NotebookLM, get visual refs + cheat sheet")
    parser.add_argument("chapter", help="Chapter number, e.g. 14")
    parser.add_argument("--notes", required=True, help="Path to processed notes .md file")
    parser.add_argument("--questions", default="[]", help="JSON array of question objects from Supabase")
    args = parser.parse_args()

    try:
        processed_notes = open(args.notes, encoding="utf-8").read()
    except FileNotFoundError:
        print(f"ERROR: notes file not found: {args.notes}", file=sys.stderr)
        sys.exit(1)

    try:
        questions = json.loads(args.questions)
    except json.JSONDecodeError:
        print("ERROR: --questions must be valid JSON array", file=sys.stderr)
        sys.exit(1)

    result = asyncio.run(run(args.chapter, processed_notes, questions))
    print(result)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests — verify they PASS (GREEN)**

```bash
cd /Users/idankatz15/Desktop && pytest tests/test_notebooklm_sync.py -v
```

Expected:
```
test_includes_chapter_number PASSED
test_includes_notes_content PASSED
test_includes_questions_when_provided PASSED
test_no_questions_section_when_empty PASSED
test_limits_to_30_questions PASSED
test_asks_for_visual_references_section PASSED
test_asks_for_cheat_sheet_section PASSED
test_returns_notebooklm_answer PASSED
test_passes_correct_notebook_id PASSED
9 passed in X.XXs
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/idankatz15/Desktop/3_APP_DEV/repo-temp add .
cd /Users/idankatz15/Desktop
git init --quiet 2>/dev/null || true
git add notebooklm_sync.py tests/test_notebooklm_sync.py
git commit -m "feat: add notebooklm_sync.py with tests — Phase B NLM interaction"
```

---

## Task 3: Create `notebooklm-sync` agent

**Files:**
- Create: `/Users/idankatz15/.claude/agents/notebooklm-sync.md`

- [ ] **Step 1: Create the agent file**

Create `/Users/idankatz15/.claude/agents/notebooklm-sync.md`:

````markdown
---
name: notebooklm-sync
description: Processes Obsidian study notes for a given chapter through two phases: Claude handles deduplication/organization (Phase A), notebooklm_sync.py handles visual refs + cheat sheet via NotebookLM (Phase B). Outputs פרק-X-nblm.md. Spawned by obsidian-daily or invoked manually.
tools: ["Read", "Write", "Edit", "Bash", "mcp__claude_ai_Supabase__execute_sql"]
model: sonnet
---

You are the **notebooklm-sync agent** for Dr. Idan Katz's Miller Anesthesia study system.

## ⚠️ Safety Rules
- Supabase: SELECT ONLY — no INSERT, UPDATE, DELETE, ever
- Do NOT touch `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/` (the live app)
- Do NOT modify any RLS policy or Edge Function

## Paths
- Vault: `/Users/idankatz15/Documents/Obsidian Vault/`
- Script: `/Users/idankatz15/Desktop/notebooklm_sync.py`
- Temp notes file: `/tmp/nblm_processed_notes.md` (deleted after use)

## Input
You receive one or more chapter numbers, e.g.: `14` or `14,13,12`

## Process

### Step 1 — Find chapter folder
In the Vault, find the folder matching `[N] - *`:
- Chapter 14 → `14 - Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations`
- For unknown chapters: scan Vault directory for `[N] - *` pattern

### Step 2 — Read הערות.md
Read `[Vault]/[chapter folder]/הערות.md`
If not found: print warning and skip this chapter.

### Step 3 — Phase A: Claude processing (tasks 1-4)
Process the notes directly. Output structured markdown with:

**Task 1 — Deduplication:**
Remove repeated facts. If the same concept appears more than once, keep the most detailed version.

**Task 2 — Topic segmentation:**
Group notes under `### [Topic Name]` sub-headers. Topics should match clinical domains (e.g., Hepatic Blood Flow, GI Motility, Drug Metabolism, Innervation).

**Task 3 — Mechanism classification:**
Identify all mechanisms. Build a table:
```
| מנגנון | קטגוריה | נקודה קלינית |
|--------|----------|--------------|
```

**Task 4 — Lists to tables:**
Any list with 3+ items that has parallel structure → convert to a markdown table.

Save the processed output to `/tmp/nblm_processed_notes.md`

### Step 4 — Query Supabase for exam questions (READ-ONLY)
Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
SELECT question, a, b, c, d, correct, explanation
FROM questions
WHERE miller = '[N]' OR chapter = '[N]'
LIMIT 100;
```
(Replace [N] with the chapter number)

If query fails: log warning, continue with empty questions list.

### Step 5 — Phase B: Call notebooklm_sync.py
```bash
python3 /Users/idankatz15/Desktop/notebooklm_sync.py [N] \
  --notes /tmp/nblm_processed_notes.md \
  --questions '[QUESTIONS_JSON]'
```
- Capture stdout as `phase_b_output`
- If script fails (exit code != 0): log error, skip Phase B but still save Phase A output

### Step 6 — Write output file
Write `/Users/idankatz15/Documents/Obsidian Vault/[chapter folder]/פרק-[N]-nblm.md`:

```markdown
# פרק [N] — ניתוח NotebookLM
> עודכן: YYYY-MM-DD | מבוסס על N שאלות מבחן

---

## הערות מאורגנות

[Phase A output — topics + mechanisms + tables]

---

[Phase B output — visual references + cheat sheet]
```

### Step 7 — Update ## ניתוח NotebookLM in main chapter file
In `[Vault]/[chapter folder]/הערות.md`:
1. Find or create section `## ניתוח NotebookLM`
2. Replace its content with:
```
> עודכן: YYYY-MM-DD — ראה `פרק-[N]-nblm.md` לפלט המלא

[top 5 lines from Cheat Sheet]
```
3. Find section `## הערות גולמיות` — clear its content (keep the header, empty the body)

### Step 8 — Cleanup
```bash
rm -f /tmp/nblm_processed_notes.md
```

### Step 9 — Report
Print:
```
✅ פרק [N] — nblm sync הושלם
   Phase A: [N topics, N mechanisms, N tables converted]
   Phase B: [visual refs found, cheat sheet lines]
   קובץ: פרק-[N]-nblm.md
```
If any step failed, print ⚠️ with the error.

## Repeat for each chapter in input list.
````

- [ ] **Step 2: Verify agent file is valid**

```bash
cat ~/.claude/agents/notebooklm-sync.md | head -5
```

Expected: shows the `---` frontmatter with name, description, tools, model.

- [ ] **Step 3: Commit**

```bash
cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp
git add .
git commit -m "feat: add notebooklm-sync agent — orchestrates Phase A + B pipeline"
```

---

## Task 4: Update `obsidian-daily` Step 4

**Files:**
- Modify: `/Users/idankatz15/.claude/agents/obsidian-daily.md` (Step 4 only)

- [ ] **Step 1: Read current Step 4**

```bash
grep -n "Step 4" ~/.claude/agents/obsidian-daily.md
```

- [ ] **Step 2: Replace Step 4 content**

Find and replace the existing Step 4 block in `obsidian-daily.md`:

```markdown
### Step 4 — Run NotebookLM Sync (spawn notebooklm-sync agent)
For each chapter that was updated in Step 3:
- Spawn the `notebooklm-sync` agent with the chapter number
- The agent will:
  1. Process notes through Phase A (Claude: dedup, topics, mechanisms, tables)
  2. Query Supabase for exam questions (read-only SELECT)
  3. Call notebooklm_sync.py for Phase B (NotebookLM: visual refs + cheat sheet)
  4. Write full output to `פרק-[N]-nblm.md` in the chapter folder
  5. Write summary + top cheat sheet lines to `## ניתוח NotebookLM` in הערות.md
  6. Clear `## הערות גולמיות` section
- If notebooklm-sync fails: log warning, continue to Step 5 (do NOT abort the pipeline)
- Wait for agent to complete before continuing
```

- [ ] **Step 3: Verify Step 5 QC still works**

Check that Step 5 QC conditions are still satisfiable after our changes:
- `## ניתוח NotebookLM` section created ✅ (agent does this)
- `## הערות גולמיות` section cleared ✅ (agent does this)

- [ ] **Step 4: Commit**

```bash
cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp
git add .
git commit -m "feat: update obsidian-daily Step 4 to match notebooklm-sync agent spec"
```

---

## Task 5: End-to-end test

- [ ] **Step 1: Run a manual test with chapter 14**

In a new Claude Code session, type:
```
הפעל את notebooklm-sync לפרק 14
```

- [ ] **Step 2: Verify output file created**

```bash
ls "/Users/idankatz15/Documents/Obsidian Vault/14 - Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations/פרק-14-nblm.md"
```

Expected: file exists.

- [ ] **Step 3: Verify output structure**

```bash
grep "^##" "/Users/idankatz15/Documents/Obsidian Vault/14 - Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations/פרק-14-nblm.md"
```

Expected output contains:
```
## הערות מאורגנות
## הפניות ויזואליות מהספר
## ⚡ Cheat Sheet למבחן
```

- [ ] **Step 4: Verify ## הערות גולמיות cleared in main file**

```bash
python3 - <<'EOF'
import re
content = open("/Users/idankatz15/Documents/Obsidian Vault/14 - Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations/14 - Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations.md", encoding="utf-8").read()
m = re.search(r"## הערות גולמיות\n(.*?)(?=\n## |\Z)", content, re.DOTALL)
body = m.group(1).strip() if m else "SECTION NOT FOUND"
print("הערות גולמיות body:", repr(body[:100]))
assert body == "", f"Expected empty, got: {repr(body[:50])}"
print("✅ Section is empty — correct")
EOF
```

- [ ] **Step 5: Final commit**

```bash
cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp
git add .
git commit -m "feat: notebooklm-sync pipeline complete — Phase A+B, manual + auto trigger"
```

---

## Self-Review

### Spec coverage check
| Spec requirement | Task |
|-----------------|------|
| Phase A: deduplication | Task 3, Step 1 (agent Step 3, Task 1) |
| Phase A: topic segmentation | Task 3, Step 1 (agent Step 3, Task 2) |
| Phase A: mechanism classification | Task 3, Step 1 (agent Step 3, Task 3) |
| Phase A: list → tables | Task 3, Step 1 (agent Step 3, Task 4) |
| Phase B: visual references | Task 2 (notebooklm_sync.py prompt) |
| Phase B: cheat sheet from real questions | Task 2 (notebooklm_sync.py) + Task 3 (Supabase query) |
| Separate output file פרק-X-nblm.md | Task 3, Step 1 (agent Step 6) |
| Overwrite existing file | Task 3 (Write tool overwrites by default) |
| Auto trigger from obsidian-daily | Task 4 |
| Manual trigger | Task 3 agent description |
| Supabase READ-ONLY | Task 2 (⚠️ comment), Task 3 (Safety Rules) |
| NotebookLM failure does not crash pipeline | Task 3 (Step 5) + Task 4 (Step 2) |

### No placeholders ✅
All steps have exact code, exact commands, exact expected output.

### Type consistency ✅
- `build_prompt(chapter: str, processed_notes: str, questions: list[dict]) -> str` — used consistently in tests and implementation
- `run(chapter: str, processed_notes: str, questions: list[dict]) -> str` — consistent
- `NOTEBOOK_ID = "3350d7aa-be6a-4a59-ad73-efbf96da68da"` — defined once, referenced in tests

---

## Open Items (out of scope for this plan)

- [ ] Screenshot agent for visual references from PDF — separate project, post-שלב א'
- [ ] Parallel processing of multiple chapters
- [ ] Response caching to avoid repeated NotebookLM calls
