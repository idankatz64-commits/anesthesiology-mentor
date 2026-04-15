# Miller Cheat Sheet Pipeline v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 24 per-topic Cheat Sheet files (פרק-N-nblm.md) for Miller's Anesthesia chapters 46-85, using a 3-stage Split Pipeline (Harvest → Format → QA).

**Architecture:** Stage 1 collects raw data from NBLM (113 Miller sources) and Supabase (question explanations with embedded Board Traps) into /tmp/miller_harvest/. Stage 2 processes batches of 2 chapters — Claude merges 4-5 sources into per-topic Cheat Sheets with emoji coding, WHY mechanisms, and Board Traps. Stage 3 runs automated QA (coverage, structure, cross-reference).

**Tech Stack:** NotebookLM MCP (NBLM queries), Supabase MCP (SQL), Claude (formatting), Obsidian Vault (output)

**Spec:** `docs/superpowers/specs/2026-04-13-miller-cheatsheet-pipeline-v2-design.md`

---

## File Structure

### Intermediate Files (Stage 1 output → Stage 2 input)
```
/tmp/miller_harvest/
├── nblm_raw/
│   ├── ch_46.md          # NBLM raw response per chapter
│   ├── ch_49.md
│   └── ... (24 files)
├── supabase/
│   ├── ch_46_explanations.md   # Extracted Board Traps + Cheat Sheets
│   ├── ch_49_explanations.md
│   └── ... (23 files, not ch. 85)
└── harvest_report.md     # Status of all 24 chapters
```

### Output Files (Stage 2 output)
```
~/Documents/Obsidian Vault/
├── 46 - Patient Blood Management_ Coagulation/
│   └── פרק-46-nblm.md    # NEW
├── 49 - Anesthesia for Thoracic Surgery/
│   └── פרק-49-nblm.md    # NEW
└── ... (24 new files total)
```

### Source Files (read-only)
```
~/Documents/Obsidian Vault/<ch>/הערות.md                    # Personal notes (24 files)
~/Desktop/MILLER_10_.../SUMMARY.md                          # Board-prep summaries (23 files)
~/Desktop/MILLER_10_.../M_C_TXT/<ch>.txt                    # Full chapter text (fallback)
~/Desktop/MILLER_10_.../<ch>/<ch>.pdf                       # Original PDF (verification)
Supabase: questions table (project ksbblqnwcmfylpxygyrj)    # ~553 explanations
NBLM notebook: 4df9facd-84c4-4651-8551-6c0f335ce652        # 113 Miller sources
```

---

## Task 0: Setup & Resume Check

**Files:**
- Create: `/tmp/miller_harvest/nblm_raw/` (directory)
- Create: `/tmp/miller_harvest/supabase/` (directory)

- [ ] **Step 1: Create harvest directories**

```bash
mkdir -p /tmp/miller_harvest/nblm_raw /tmp/miller_harvest/supabase
```

- [ ] **Step 2: Check for existing progress (resume protocol)**

Check if any harvest files already exist (from a previous session):
```bash
ls /tmp/miller_harvest/nblm_raw/ 2>/dev/null | wc -l
ls /tmp/miller_harvest/supabase/ 2>/dev/null | wc -l
```

Check which nblm files already exist in Vault:
```bash
for ch in 46 49 54 55 57 60 62 65 66 67 68 70 71 72 73 75 76 77 78 80 81 82 83 85; do
  f=$(find ~/Documents/Obsidian\ Vault -name "פרק-${ch}-nblm.md" 2>/dev/null)
  if [ -n "$f" ]; then echo "EXISTS: ch $ch → $f"; else echo "MISSING: ch $ch"; fi
done
```

Expected: All 24 chapters show MISSING (fresh start).
If some show EXISTS: skip those chapters in subsequent tasks.

- [ ] **Step 3: Define the master chapter list**

The 24 chapters to process, with their Vault folder names:
```
46 → "46 - Patient Blood Management_ Coagulation"
49 → "49 - Anesthesia for Thoracic Surgery"
54 → "54 - Anesthesia for Bariatric Surgery"
55 → "55 - Anesthesia and the Renal and Genitourinary Systems"
57 → "57 - Anesthesia for Organ Procurement"
60 → "60 - Anesthesia for Orthopedic Surgery"
62 → "62 - Anesthesia for Trauma"
65 → "65 - Anesthesia for Ophthalmic Surgery"
66 → "66 - Anesthesia for Otolaryngologic and Head–Neck Surgery"  (EN-DASH!)
67 → "67 - Anesthesia for Robotic Surgery"
68 → "68 - Ambulatory (Outpatient) Anesthesia"
70 → "70 - Clinical Care in Extreme Environments_ Diving, Near-Drowning, Hyper- and Hypothermia"
71 → "71 - Clinical Care in Extreme Environments_ High Altitude and Space"
72 → "72 - Pediatric Anesthesia"
73 → "73 - Anesthesia for Pediatric Cardiac Surgery"
75 → "75 - Pediatric and Neonatal Critical Care"
76 → "76 - The Postanesthesia Care Unit"
77 → "77 - Acute Postoperative Pain"
78 → "78 - Perioperative Neurocognitive Disorders"
80 → "80 - Neurocritical Care"
81 → "81 - Extracorporeal Membrane Oxygenation and Cardiac Devices"
82 → "82 - Cardiopulmonary Resuscitation and Advanced Cardiac Life Support"
83 → "83 - Burn Management"
85 → "85 - Emergency Preparedness in Health Care"
```

NOTE: Chapter 66 uses **en-dash** (–) not hyphen (-). Chapter 70/71 naming may vary — verify exact folder name with `find` before writing.

---

## Task 1: Stage 1B — Supabase Harvest (all 24 chapters)

> Run this BEFORE NBLM harvest — it's fast (SQL) and provides keywords for NBLM queries.

**Files:**
- Create: `/tmp/miller_harvest/supabase/ch_N_explanations.md` (23 files, not ch. 85)

- [ ] **Step 1: Bulk extract explanations for Tier A chapters (rich content)**

For each chapter in [46, 49, 54, 55, 62, 72, 73, 75, 82, 83]:

```sql
SELECT question_text, explanation, correct_answer
FROM questions
WHERE chapter = {N}
  AND explanation IS NOT NULL AND explanation != ''
ORDER BY id
```

Post-process each result:
1. Strip HTML tags (`<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<h3>`, `<blockquote>`)
2. Convert HTML entities (`&amp;` → `&`, `&quot;` → `"`, etc.)
3. Extract sections labeled "Board Trap", "Cheat Sheet", "⚠️", "מלכודת", "The Trap"
4. For chapters with >50KB total explanations (73, 75, 83): extract ONLY Board Trap + Cheat Sheet sections
5. Save to `/tmp/miller_harvest/supabase/ch_{N}_explanations.md`

Format of saved file:
```markdown
# Chapter {N} — Supabase Explanations Extract
> {count} explanations, extracted {date}

## Question 1: {question_text_first_50_chars}...
### Board Traps
{extracted trap content}
### Cheat Sheet
{extracted CS content}
### Key Mechanisms
{extracted mechanism content}

## Question 2: ...
[repeat]
```

- [ ] **Step 2: Extract explanations for Tier B chapters**

Same process for [60, 65, 66, 67, 68, 76, 77, 80, 81].

- [ ] **Step 3: Extract explanations for Tier C chapters**

Same process for [57, 70, 71, 78].

- [ ] **Step 4: Log chapters with no explanations**

Chapter 85 has 0 questions. Save empty marker:
```bash
echo "# Chapter 85 — No Supabase Explanations Available" > /tmp/miller_harvest/supabase/ch_85_explanations.md
```

- [ ] **Step 5: Generate Supabase harvest summary**

Count files and sizes:
```bash
wc -c /tmp/miller_harvest/supabase/*.md | sort -rn | head -25
```

Expected: 23 non-empty files + 1 marker file for ch. 85.

---

## Task 2: Stage 1A — NBLM Harvest (all 24 chapters)

> Sequential async queries. Each takes 60-120 seconds. Total ~45 minutes.

**Files:**
- Create: `/tmp/miller_harvest/nblm_raw/ch_N.md` (24 files)

- [ ] **Step 1: For each chapter N, collect sources and send NBLM query**

For each chapter (sequential — one at a time):

**1a. Read sources:**
- Read `הערות.md` from Vault folder
- Read `SUMMARY.md` from MILLER_10 folder (ch. 85: read TXT first 4000 chars instead)
- Extract 5-10 board-relevant keywords from SUMMARY

**1b. Build and send NBLM query:**

Tool: `mcp__notebooklm-mcp__notebook_query_start`
- notebook_id: `4df9facd-84c4-4651-8551-6c0f335ce652`
- query:
```
צור סיכום מקיף לפרק {N} — "{title}" מתוך Miller's Anesthesia 10e.

מילות מפתח: {keywords}

עבור כל נושא מרכזי בפרק, תן:
1. המנגנון הפיזיולוגי/פרמקולוגי (WHY — למה זה קורה)
2. ערכים מספריים חשובים (מינונים, ספים, טווחים)
3. הבדלים קריטיים בין מושגים דומים
4. פרוטוקולים וטבלאות השוואה
5. טעויות נפוצות שנבחנים עושים

שפה: עברית + מונחים רפואיים באנגלית.
אמת כל עובדה מול פרק {N} המקורי בלבד.

הערות אישיות לשילוב: {notes_content}
```

**1c. Poll for result:**

Tool: `mcp__notebooklm-mcp__notebook_query_status`
- query_id: {from step 1b}
- Poll every 15-20 seconds, max 10 attempts (150s timeout)

**1d. Save result:**
- If completed: save response to `/tmp/miller_harvest/nblm_raw/ch_{N}.md`
- If failed/timeout: save empty marker with error reason
- If wrong chapter detected (< 3/10 keywords found in response): log warning, save anyway (Claude will compensate in Stage 2)

- [ ] **Step 2: Process chapters in this order (Tier A first)**

Order: 46, 82, 72, 62, 49, 54, 55, 73, 75, 83, 76, 80, 67, 68, 60, 66, 65, 81, 77, 78, 70, 71, 57, 85

This ensures rich chapters (with Supabase fallback) are processed first — if NBLM has issues, we catch them early.

- [ ] **Step 3: Generate NBLM harvest summary**

```bash
wc -c /tmp/miller_harvest/nblm_raw/*.md | sort -rn | head -25
```

Log: which chapters succeeded, which failed, which had wrong-chapter warnings.

- [ ] **Step 4: Write harvest report**

Create `/tmp/miller_harvest/harvest_report.md`:
```markdown
# Harvest Report — {date}

| Ch | NBLM Status | NBLM Size | Supabase Expl | Supabase Size | Tier | Ready? |
|----|------------|-----------|---------------|---------------|------|--------|
| 46 | OK         | 3.2KB     | 56            | 251KB         | A    | GO     |
| ...
```

**CHECKPOINT: Report to Idan before starting Stage 2.**

---

## Task 3: Stage 2 — Format Batch 1 (Ch 46 + 82)

> This is the PILOT batch. Full quality review before continuing.

**Files:**
- Create: `~/Documents/Obsidian Vault/46 - .../פרק-46-nblm.md`
- Create: `~/Documents/Obsidian Vault/82 - .../פרק-82-nblm.md`

- [ ] **Step 1: Format Chapter 46 (Coagulation)**

**Load 4 sources:**
1. `/tmp/miller_harvest/nblm_raw/ch_46.md`
2. `/tmp/miller_harvest/supabase/ch_46_explanations.md`
3. `~/Desktop/MILLER_10_.../46 - .../SUMMARY.md`
4. `~/Documents/Obsidian Vault/46 - .../הערות.md`

**Extract topics** from all sources (deduplicate):
- Coagulation Cascade (Extrinsic/Intrinsic/Common)
- Cell-Based Model of Coagulation
- TEG/ROTEM Interpretation
- DOACs & Perioperative Management
- Reversal Agents (Antidotes)
- HIT Type I vs Type II
- Massive Transfusion Protocol
- DIC Pathophysiology & Staging
- Platelet Thresholds by Procedure
- Cryoprecipitate Contents
- Vitamin K-Dependent Factors
- VTE Risk Stratification
- Fibrinolysis & Antifibrinolytics
- Point-of-Care Coagulation Testing

**For each topic, generate a per-topic Cheat Sheet** in this format:
```markdown
* **{Topic Title}:**
    - {emoji} **{Key Concept}:** {description}.
    - {emoji} **{Mechanism (WHY)}:** {explanation}.
    - {emoji} **{Values/Thresholds}:** {numbers + units}.
    - ⚠️ **The Board Trap:** {trap + correct answer with WHY}.
```

**Merge Board Traps from Supabase** — each explanation's "Board Trap" and "Cheat Sheet" sections get woven into the relevant topic.

**Merge personal notes** — each ⚡ bullet from הערות.md gets placed in the relevant topic section.

**Assemble final file:**
```markdown
# פרק 46 — ניהול מוצרי דם: קרישה (Patient Blood Management: Coagulation)
> Miller's Anesthesia 10e · Per-Topic Cheat Sheets · עודכן: אפריל 2026
---

[all per-topic Cheat Sheets]

---

## הערות אישיות
> מתוך הערות.md — Obsidian Vault

[original הערות.md content]

---
*נוצר באמצעות NotebookLM + Supabase + Claude | אפריל 2026 (v2 — Per-Topic Cheat Sheets)*
```

**Write** to `~/Documents/Obsidian Vault/46 - Patient Blood Management_ Coagulation/פרק-46-nblm.md`

- [ ] **Step 2: Format Chapter 82 (CPR/ACLS)**

Same process. Load 4 sources, extract topics, generate per-topic Cheat Sheets, assemble, write.

Key topics for Ch 82: High-Quality CPR Parameters, Shockable vs Non-Shockable Rhythms, ACLS Drug Pharmacology, H's and T's, Targeted Temperature Management, LAST & Intralipid, Pregnancy Cardiac Arrest, Post-Resuscitation Care, Pediatric vs Adult ACLS, Defibrillation Physics.

Write to `~/Documents/Obsidian Vault/82 - .../פרק-82-nblm.md`

- [ ] **Step 3: Mini-QA on Batch 1**

For each file (46, 82):
```bash
# Line count (expect >200)
wc -l <file>
# Board Trap count (expect ≥5)
grep -c "Board Trap\|⚠️.*Trap\|מלכודת" <file>
# Emoji coding present
grep -c "🟢\|🔴\|🟡\|⚠️\|💊\|⚙️\|🎯" <file>
# WHY explanations
grep -c "WHY\|למה" <file>
```

**CHECKPOINT: Show both files to Idan for format approval before continuing.**

---

## Task 4: Stage 2 — Format Batch 2 (Ch 72 + 62)

- [ ] **Step 1: Format Chapter 72 (Pediatric Anesthesia)** — Load sources, extract topics, generate per-topic CS, write
- [ ] **Step 2: Format Chapter 62 (Trauma)** — Same process
- [ ] **Step 3: Mini-QA on Batch 2**

---

## Task 5: Stage 2 — Format Batch 3 (Ch 49 + 54)

- [ ] **Step 1: Format Chapter 49 (Thoracic Surgery)**
- [ ] **Step 2: Format Chapter 54 (Bariatric Surgery)**
- [ ] **Step 3: Mini-QA on Batch 3**

---

## Task 6: Stage 2 — Format Batch 4 (Ch 55 + 73)

- [ ] **Step 1: Format Chapter 55 (Renal/GU)**
- [ ] **Step 2: Format Chapter 73 (Pediatric Cardiac Surgery)**

Note: Ch 73 has 1.4MB explanations from 7 questions. Extract Board Traps + Cheat Sheets only (cap 30KB input to Claude).

- [ ] **Step 3: Mini-QA on Batch 4**

---

## Task 7: Stage 2 — Format Batch 5 (Ch 75 + 83)

- [ ] **Step 1: Format Chapter 75 (Ped/Neo Critical Care)**

Note: Ch 75 has 1.7MB explanations from 6 questions. Extract Board Traps + Cheat Sheets only.

- [ ] **Step 2: Format Chapter 83 (Burn Management)**

Note: Ch 83 has 325KB from 1 question. Same extraction strategy.

- [ ] **Step 3: Mini-QA on Batch 5**

---

## Task 8: Stage 2 — Format Batch 6 (Ch 76 + 80)

- [ ] **Step 1: Format Chapter 76 (PACU)**
- [ ] **Step 2: Format Chapter 80 (Neurocritical Care)**
- [ ] **Step 3: Mini-QA on Batch 6**

**CHECKPOINT: 12 chapters done. Report progress to Idan.**

---

## Task 9: Stage 2 — Format Batch 7 (Ch 67 + 68)

- [ ] **Step 1: Format Chapter 67 (Robotic Surgery)**
- [ ] **Step 2: Format Chapter 68 (Ambulatory Anesthesia)**
- [ ] **Step 3: Mini-QA on Batch 7**

---

## Task 10: Stage 2 — Format Batch 8 (Ch 60 + 66)

- [ ] **Step 1: Format Chapter 60 (Orthopedic Surgery)**
- [ ] **Step 2: Format Chapter 66 (ENT/Head-Neck Surgery)**

CRITICAL: Write to the EN-DASH folder: `66 - Anesthesia for Otolaryngologic and Head–Neck Surgery`
Report duplicate folder to Idan.

- [ ] **Step 3: Mini-QA on Batch 8**

---

## Task 11: Stage 2 — Format Batch 9 (Ch 65 + 81)

- [ ] **Step 1: Format Chapter 65 (Ophthalmic Surgery)**
- [ ] **Step 2: Format Chapter 81 (ECMO/Cardiac Devices)**
- [ ] **Step 3: Mini-QA on Batch 9**

---

## Task 12: Stage 2 — Format Batch 10 (Ch 77 + 78)

- [ ] **Step 1: Format Chapter 77 (Acute Postoperative Pain)**
- [ ] **Step 2: Format Chapter 78 (Perioperative Neurocognitive Disorders)**

Note: Tier C — lean Supabase content. NBLM + SUMMARY.md are primary sources.

- [ ] **Step 3: Mini-QA on Batch 10**

---

## Task 13: Stage 2 — Format Batch 11 (Ch 70 + 71)

- [ ] **Step 1: Format Chapter 70 (Extreme Environments: Altitude/Space)**
- [ ] **Step 2: Format Chapter 71 (Extreme Environments: Diving/Drowning/Hypothermia)**

Note: Tier C — only 4 explanations each. Heavy reliance on NBLM + SUMMARY.md.

- [ ] **Step 3: Mini-QA on Batch 11**

---

## Task 14: Stage 2 — Format Batch 12 (Ch 57 + 85)

- [ ] **Step 1: Format Chapter 57 (Organ Procurement)**

Tier C — only 2 explanations.

- [ ] **Step 2: Format Chapter 85 (Emergency Preparedness)**

Tier D — SPECIAL HANDLING:
- No Supabase explanations (0 questions)
- No SUMMARY.md
- Sources: NBLM raw + TXT file (~/Desktop/MILLER_10_.../M_C_TXT/85_Emergency_Preparedness_in_Health_Care.txt, first 8000 chars) + הערות.md
- Expected shorter output (~150-200 lines)
- If NBLM also failed: Claude generates entirely from TXT + הערות.md

- [ ] **Step 3: Mini-QA on Batch 12**

---

## Task 15: Stage 3 — QA Coverage Check

- [ ] **Step 1: Verify all 24 files exist**

```bash
for ch in 46 49 54 55 57 60 62 65 66 67 68 70 71 72 73 75 76 77 78 80 81 82 83 85; do
  f=$(find ~/Documents/Obsidian\ Vault -name "פרק-${ch}-nblm.md" 2>/dev/null)
  if [ -n "$f" ]; then
    lines=$(wc -l < "$f")
    traps=$(grep -c "Board Trap\|⚠️.*Trap\|מלכודת" "$f" 2>/dev/null || echo 0)
    echo "✅ ch $ch: $lines lines, $traps traps"
  else
    echo "❌ ch $ch: MISSING"
  fi
done
```

Expected: 24/24 files, all >200 lines, all ≥5 traps.

- [ ] **Step 2: Coverage check vs Supabase**

For each chapter with questions: verify that key medical topics from the explanations appear in the nblm file. Use keyword matching from the Supabase extracts.

- [ ] **Step 3: Cross-reference vs SUMMARY.md**

For each chapter with SUMMARY.md: verify that key principles listed in the SUMMARY appear in the nblm file.

- [ ] **Step 4: Generate final report**

```markdown
# Pipeline v2 — Final Report

| Ch | Lines | Traps | Cover% | CrossRef% | Status |
|----|-------|-------|--------|-----------|--------|
| 46 |       |       |        |           |        |
| ...

Total: 24/24 files
Total new lines: X
Average lines per file: Y
Average traps per file: Z
```

- [ ] **Step 5: Report to Idan**

Present final report. Flag any chapters that need manual review. Report chapter 66 dual folder situation.

---

## Task 16: Cleanup & Memory Update

- [ ] **Step 1: Clean up intermediate files**

```bash
rm -rf /tmp/miller_harvest/
```

- [ ] **Step 2: Verify total nblm count**

```bash
find ~/Documents/Obsidian\ Vault -name "פרק-*-nblm.md" | wc -l
```

Expected: 76 (52 existing + 24 new)

- [ ] **Step 3: Update memory**

Update the medicine concept note to reflect completion:
- 76/85 chapters now have nblm files
- Pipeline v2 format: per-topic Cheat Sheets with emoji + Board Traps
- Chapters 64 and 84 excluded (no content available)
