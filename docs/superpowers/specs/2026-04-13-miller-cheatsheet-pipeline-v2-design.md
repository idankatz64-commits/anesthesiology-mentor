# Miller Cheat Sheet Pipeline v2 — Design Spec

> Date: 2026-04-13
> Author: Claude + Dr. Idan Katz
> Status: Draft — Pending Review

---

## 1. Context & Problem

Dr. Idan Katz is preparing for the Step 1 Anesthesia board exam (June 2026). He has 52 existing nblm study files (chapters 8-40 + 19 from 41-85), but **24 chapters are missing** nblm files. The previous pipeline attempt failed because:

1. It assumed 43 chapters were missing (only 24 remain)
2. Batch sizes were too large (4 chapters), causing cascading failures
3. The Cheat Sheet quality was generic — not the per-topic, emoji-coded, Board-Trap-enriched format Idan actually uses
4. It didn't leverage the rich question explanations already in Supabase

### What Changed (v2)
- **Cheat Sheet format**: Per-topic mini-sheets with emoji coding, Board Traps, WHY mechanisms (not one summary table)
- **New data source**: Supabase question explanations — each already contains structured Cheat Sheets and Board Traps
- **Architecture**: Split Pipeline (Harvest → Format → QA) instead of monolithic per-chapter processing

---

## 2. Architecture Overview

```
 STAGE 1: HARVEST                STAGE 2: FORMAT              STAGE 3: QA
 (Data Collection)               (Claude Processing)          (Quality Assurance)
 ~60 min                         ~120 min                     ~20 min
                                 
 ┌──────────────┐               ┌──────────────────┐         ┌─────────────────┐
 │ 1A: NBLM     │               │                  │         │ 3A: Coverage    │
 │ 24 queries   │──┐            │  Claude merges   │         │ Check           │
 │ (sequential) │  │            │  4 sources into  │         │ (topics vs Q's) │
 └──────────────┘  │  /tmp/     │  per-topic       │  Vault  ├─────────────────┤
                   ├──harvest/──│  Cheat Sheets    │──files──│ 3B: Structure   │
 ┌──────────────┐  │            │                  │         │ Check           │
 │ 1B: Supabase │  │            │  Batches of 2    │         │ (format rules)  │
 │ 24 chapters  │──┘            │  + mini-QA       │         ├─────────────────┤
 │ (bulk SQL)   │               │                  │         │ 3C: Cross-Ref   │
 └──────────────┘               └──────────────────┘         │ vs SUMMARY.md   │
                                                             └─────────────────┘
```

### Key Design Decision: Why Split?

| Concern | Monolithic | Split Pipeline |
|---------|-----------|----------------|
| NBLM failure | Blocks everything | Stage 1 retries independently |
| Session crash | Loses all work | /tmp/harvest/ preserves Stage 1 |
| Context window | Filled with polling | Stage 2 gets clean context |
| QA | Per-file only | Global cross-chapter check |

---

## 3. Data Sources Per Chapter

Each chapter has up to 4 sources, in priority order:

```
┌─────────────────────────────────────────────────────────┐
│  SOURCE 1: Supabase Explanations                        │
│  ─────────────────────────────                          │
│  Rich: already formatted with Board Traps + Cheat Sheets│
│  Contains: Miller quotes, mechanisms, figure references  │
│  Available: 23/24 chapters (not ch. 85)                 │
│  Volume: 10KB - 1.6MB per chapter                       │
│                                                         │
│  SOURCE 2: NBLM Raw Content                             │
│  ─────────────────────────                              │
│  Rich: reads directly from 113 Miller sources           │
│  Contains: physiology, pharmacology, values, mechanisms  │
│  Available: 24/24 chapters                              │
│  Volume: ~2-5KB per query response                      │
│                                                         │
│  SOURCE 3: SUMMARY.md                                   │
│  ─────────────────────                                  │
│  Curated: board-prep focus, formulas, high-yield points │
│  Contains: key principles, tables, calculation rules     │
│  Available: 23/24 chapters (not ch. 85)                 │
│  Volume: ~5-15KB per chapter                            │
│                                                         │
│  SOURCE 4: Personal Notes (הערות.md)                     │
│  ─────────────────────────────                          │
│  Personal: Idan's Board Traps, weak points, discoveries │
│  Contains: ~5-12 bullet points per chapter              │
│  Available: 24/24 chapters                              │
│  Volume: ~1-3KB per chapter                             │
│                                                         │
│  SOURCE 5: PDF + DOCX Files (FALLBACK — verification)   │
│  ──────────────────────────────────────────             │
│  Original: Miller's Anesthesia chapter PDFs + topic DOCX│
│  Contains: Full original text, figures, tables           │
│  Available: 24/24 chapters                              │
│  Path: ~/Desktop/MILLER_10_.../N - ChapterName/         │
│  Use: When other sources conflict or for fact-checking   │
│  Note: PDFs are large — read specific pages only         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Chapter Tiers (Processing Strategy)

Based on Supabase explanation volume + question count:

### Tier A: Rich (>100KB explanations)
**Strategy: Supabase-Primary — NBLM supplements gaps**

| Ch | Title | Questions | Explanations | Notes |
|----|-------|-----------|-------------|-------|
| 82 | CPR/ACLS | 81 | 871KB | Richest exam chapter |
| 72 | Pediatric Anesthesia | 53 | 812KB | |
| 46 | Coagulation | 56 | 252KB | |
| 62 | Trauma | 32 | 126KB | |
| 54 | Bariatric Surgery | 25 | 116KB | |
| 49 | Thoracic Surgery | 35 | 103KB | |
| 55 | Renal/GU | 21 | 103KB | |

*Also Tier A by explanation density (few questions but huge explanations):*
| 75 | Ped/Neo Critical Care | 6 | 1,688KB | 6 questions but enormous content |
| 73 | Ped Cardiac Surgery | 7 | 1,418KB | Same pattern |
| 83 | Burn Management | 1 | 325KB | 1 question, massive explanation |

### Tier B: Medium (20-100KB explanations)
**Strategy: NBLM-Primary + Supabase enrichment**

| Ch | Title | Questions | Explanations |
|----|-------|-----------|-------------|
| 76 | PACU | 20 | 64KB |
| 80 | Neurocritical Care | 17 | 58KB |
| 67 | Robotic Surgery | 11 | 53KB |
| 68 | Ambulatory Anesthesia | 16 | 50KB |
| 60 | Orthopedic Surgery | 14 | 38KB |
| 66 | ENT/Head-Neck | 12 | 37KB |
| 65 | Ophthalmic Surgery | 9 | 29KB |
| 81 | ECMO/Cardiac Devices | 8 | 23KB |
| 77 | Acute Postop Pain | 8 | 22KB |

### Tier C: Lean (<20KB explanations)
**Strategy: NBLM-Primary + SUMMARY.md + Claude generates Board Traps**

| Ch | Title | Questions | Explanations |
|----|-------|-----------|-------------|
| 70 | Extreme Env (Altitude) | 4 | 21KB |
| 71 | Extreme Env (Pressure) | 4 | 19KB |
| 78 | Neurocognitive Disorders | 3 | 15KB |
| 57 | Organ Procurement | 2 | 11KB |

### Tier D: No Questions
**Strategy: NBLM + SUMMARY.md + TXT — Claude generates everything**

| Ch | Title | Questions | SUMMARY.md |
|----|-------|-----------|-----------|
| 85 | Emergency Preparedness | 0 | NO |

---

## 5. Stage 1: HARVEST — Detailed Flow

```
╔══════════════════════════════════════════════════════════╗
║  STAGE 1: HARVEST (~60 minutes)                         ║
║  Goal: Collect all raw data to /tmp/miller_harvest/     ║
╚════════════════════════════╤═════════════════════════════╝
                             │
              ┌──────────────▼──────────────┐
              │  mkdir /tmp/miller_harvest/  │
              │  mkdir nblm_raw/            │
              │  mkdir supabase/            │
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                                       ▼
 ┌───────────────────┐               ┌───────────────────────┐
 │  1A: NBLM HARVEST │               │  1B: SUPABASE HARVEST │
 │  (sequential)     │               │  (bulk — fast)        │
 └────────┬──────────┘               └────────┬──────────────┘
          │                                    │
          ▼                                    ▼
 FOR each chapter N (24):              FOR each chapter N (24):
 ┌────────────────────────┐           ┌────────────────────────┐
 │ 1. Read SUMMARY.md     │           │ 1. SQL: SELECT chapter,│
 │ 2. Extract 5-10 keywords│          │    question_text,      │
 │ 3. Read הערות.md        │           │    explanation,        │
 │ 4. Build NBLM prompt:  │           │    correct_answer      │
 │    - chapter N title    │           │    FROM questions      │
 │    - keywords           │           │    WHERE chapter = N   │
 │    - הערות content       │           │    AND explanation != ''│
 │ 5. notebook_query_start │           │                        │
 │ 6. Poll (15s × max 10) │           │ 2. Format to markdown  │
 │ 7. Save raw response   │           │ 3. Save to supabase/   │
 │    → nblm_raw/ch_N.md  │           │    ch_N_explanations.md│
 └────────┬───────────────┘            └────────┬──────────────┘
          │                                     │
          │  If NBLM fails:                     │
          │  ┌──────────────────┐               │
          │  │ Log failure      │               │
          │  │ Write empty file │               │
          │  │ (Claude-only     │               │
          │  │  in Stage 2)     │               │
          │  └──────────────────┘               │
          │                                     │
          ▼                                     ▼
 ┌──────────────────────────────────────────────────┐
 │  HARVEST REPORT                                  │
 │  ──────────────                                  │
 │  | Ch | NBLM | Supabase | SUMMARY | Status |    │
 │  | 46 |  OK  |  56 expl |   OK    |   GO   |    │
 │  | 49 |  OK  |  35 expl |   OK    |   GO   |    │
 │  | ...                                      |    │
 │  | 85 | FAIL |  0 expl  |   NO    |  LEAN  |    │
 │                                                  │
 │  Total: X/24 NBLM OK, Y/24 Supabase non-empty   │
 └──────────────────────────────────────────────────┘
```

### 1A: NBLM Query Template

```
צור סיכום מקיף לפרק {N} — "{title}" מתוך Miller's Anesthesia 10e.

מילות מפתח: {keywords from SUMMARY.md}

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

### 1B: Supabase Query (per chapter)

```sql
SELECT question_text, explanation, correct_answer
FROM questions 
WHERE chapter = {N}
  AND explanation IS NOT NULL AND explanation != ''
ORDER BY id
```

**Post-processing**: Strip HTML tags, extract sections (Board Traps, Cheat Sheets, mechanisms).

---

## 6. Stage 2: FORMAT — Detailed Flow

```
╔══════════════════════════════════════════════════════════╗
║  STAGE 2: FORMAT (~120 minutes)                         ║
║  Goal: Generate per-topic Cheat Sheet files              ║
║  Batches of 2 chapters + mini-QA after each              ║
╚════════════════════════════╤═════════════════════════════╝
                             │
              ┌──────────────▼──────────────┐
              │  BATCH LOOP (12 batches)    │
              │  2 chapters per batch       │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  FOR each chapter N in batch │
              └──────────────┬──────────────┘
                             │
         ╔═══════════════════▼═══════════════════╗
         ║  STEP 1: LOAD SOURCES                  ║
         ║  ────────────────────                  ║
         ║  Read from /tmp/miller_harvest/:       ║
         ║  ├── nblm_raw/ch_N.md                  ║
         ║  ├── supabase/ch_N_explanations.md     ║
         ║  Read from filesystem:                 ║
         ║  ├── SUMMARY.md (MILLER_10 folder)     ║
         ║  └── הערות.md (Vault folder)             ║
         ╚═══════════════════╤═══════════════════╝
                             │
         ╔═══════════════════▼═══════════════════╗
         ║  STEP 2: TOPIC EXTRACTION              ║
         ║  ────────────────────                  ║
         ║  From all 4 sources, identify unique   ║
         ║  clinical topics. Examples for Ch 46:  ║
         ║                                        ║
         ║  • Coagulation Cascade                 ║
         ║  • TEG/ROTEM Interpretation            ║
         ║  • DOACs & Reversal Agents             ║
         ║  • HIT Type II                         ║
         ║  • Massive Transfusion Protocol        ║
         ║  • DIC Pathophysiology                 ║
         ║  • Platelet Thresholds                 ║
         ║  • Vitamin K-Dependent Factors         ║
         ║  • Fibrinolysis & TXA                  ║
         ╚═══════════════════╤═══════════════════╝
                             │
         ╔═══════════════════▼═══════════════════╗
         ║  STEP 3: PER-TOPIC CHEAT SHEET GEN     ║
         ║  ────────────────────────────          ║
         ║  For each topic:                       ║
         ║                                        ║
         ║  1. Find relevant content across all   ║
         ║     4 sources                          ║
         ║  2. Generate structured mini-sheet:    ║
         ║     ┌──────────────────────────────┐   ║
         ║     │ * **Topic Title:**            │   ║
         ║     │   - emoji + Key fact          │   ║
         ║     │   - emoji + Mechanism (WHY)   │   ║
         ║     │   - emoji + Values/Thresholds │   ║
         ║     │   - emoji + Clinical rule     │   ║
         ║     │   - ⚠️ **Board Trap:** ...    │   ║
         ║     └──────────────────────────────┘   ║
         ║  3. Ensure WHY is explained, not just  ║
         ║     WHAT                               ║
         ║  4. Include Board Trap from Supabase   ║
         ║     if available, or generate one      ║
         ╚═══════════════════╤═══════════════════╝
                             │
         ╔═══════════════════▼═══════════════════╗
         ║  STEP 4: ASSEMBLE FILE                  ║
         ║  ────────────────────                  ║
         ║  # פרק N — Hebrew (English)            ║
         ║  > Miller's 10e · metadata             ║
         ║  ---                                   ║
         ║                                        ║
         ║  [Per-topic Cheat Sheets — all topics] ║
         ║                                        ║
         ║  ---                                   ║
         ║  ## הערות אישיות                         ║
         ║  > מתוך הערות.md                         ║
         ║  [personal notes content]              ║
         ║  ---                                   ║
         ║  *footer*                              ║
         ╚═══════════════════╤═══════════════════╝
                             │
         ╔═══════════════════▼═══════════════════╗
         ║  STEP 5: WRITE FILE                     ║
         ║  ────────────────────                  ║
         ║  Write → Vault/<folder>/פרק-N-nblm.md  ║
         ╚═══════════════════╤═══════════════════╝
                             │
              ┌──────────────▼──────────────┐
              │  (repeat for 2nd chapter)   │
              └──────────────┬──────────────┘
                             │
         ╔═══════════════════▼═══════════════════╗
         ║  MINI-QA (after each batch of 2)        ║
         ║  ────────────────────                  ║
         ║  For each file just created:           ║
         ║  ☐ Line count > 200                    ║
         ║  ☐ Board Trap count (grep ⚠️) ≥ 5     ║
         ║  ☐ Emoji coding present (🟢🔴🟡)       ║
         ║  ☐ WHY/למה keyword count ≥ 3           ║
         ║  ☐ Numerical values present            ║
         ║  ☐ File in correct Vault folder        ║
         ║                                        ║
         ║  Report: "Batch X: Ch A ✅ Ch B ✅"     ║
         ║  If FAIL → fix before next batch       ║
         ╚═══════════════════════════════════════╝
```

### Per-Topic Cheat Sheet Format (The Gold Standard)

Based on Idan's actual notes from Chapter 15:

```markdown
* **{Topic Title}:**
    - {emoji} **{Key Concept}:** {value/fact} ({Hebrew context}).
    - {emoji} **{Mechanism}:** {description} ({English term}).
        - *{Sub-detail with WHY explanation}*
    - {emoji} **{Clinical Rule/Threshold}:** {value} ({context}).
    - ⚠️ **The Board Trap:** {what examiners test} → {the mistake} → {the correct answer with WHY}.
```

**Emoji Coding System:**
- `⚖️` = Measurements/Values
- `🩸` = Blood/Hemodynamics
- `🟢` = Safe/Good/Vasodilators
- `🔴` = Danger/Bad/Vasoconstrictors
- `🟡` = Caution/Intermediate
- `⚠️` = Board Trap
- `💊` = Pharmacology
- `⚙️` = Mechanism
- `🎯` = Target/Trigger
- `🚰` = Net Effect/Output
- `🛑` = Contraindication/Antagonism

---

## 7. Stage 3: QA — Detailed Flow

```
╔══════════════════════════════════════════════════════════╗
║  STAGE 3: QA (~20 minutes)                              ║
║  Goal: Verify all 24 files meet quality bar              ║
╚════════════════════════════╤═════════════════════════════╝
                             │
              ┌──────────────▼──────────────┐
              │  3A: COVERAGE CHECK          │
              │  For each chapter:           │
              │                              │
              │  topics_in_supabase =        │
              │    unique topics from Q&A    │
              │                              │
              │  topics_in_file =            │
              │    bold headers in nblm file │
              │                              │
              │  MISSING = supabase - file   │
              │  → flag if MISSING > 0       │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  3B: STRUCTURE CHECK          │
              │  For each file:              │
              │                              │
              │  ☐ Line count > 200          │
              │  ☐ Board Traps ≥ 5 (⚠️)     │
              │  ☐ Emoji coding present      │
              │  ☐ WHY explanations ≥ 3      │
              │  ☐ Numerical values present  │
              │  ☐ Hebrew + English terms    │
              │  ☐ הערות אישיות section exists │
              │  ☐ Correct chapter in header │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  3C: CROSS-REFERENCE          │
              │  For each chapter:           │
              │                              │
              │  Read SUMMARY.md →           │
              │    extract key principles    │
              │                              │
              │  Verify each principle       │
              │    appears in nblm file      │
              │                              │
              │  MISSING = summary - file    │
              │  → flag if MISSING > 0       │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  FINAL REPORT                │
              │                              │
              │  | Ch | Lines | Traps |      │
              │  |    | Cover | Cross | OK?  │
              │  |----|-------|-------|------|
              │  | 46 |  350  |  12   |      │
              │  |    | 100%  | 100%  |  ✅  │
              │  | 49 |  280  |   8   |      │
              │  |    |  95%  | 100%  |  ✅  │
              │  | ...                       │
              │  | 85 |  180  |   3   |      │
              │  |    |  N/A  |  N/A  |  🟡  │
              │                              │
              │  PASS: X/24                  │
              │  FLAG: Y/24 (need review)    │
              │  FAIL: Z/24 (need regen)     │
              └──────────────────────────────┘
```

---

## 8. Batch Schedule

12 batches of 2, ordered by tier (Rich first — validates pipeline early):

| Batch | Ch A | Ch B | Tier | Est. Time |
|-------|------|------|------|-----------|
| **1** | 46 Coagulation | 82 CPR/ACLS | A+A | 12 min |
| **2** | 72 Pediatric | 62 Trauma | A+A | 12 min |
| **3** | 49 Thoracic | 54 Bariatric | A+A | 10 min |
| **4** | 55 Renal/GU | 73 Ped Cardiac | A+A | 10 min |
| **5** | 75 Ped/Neo ICU | 83 Burns | A+A | 10 min |
| **6** | 76 PACU | 80 Neurocritical | B+B | 10 min |
| **7** | 67 Robotic | 68 Ambulatory | B+B | 10 min |
| **8** | 60 Orthopedic | 66 ENT | B+B | 10 min |
| **9** | 65 Ophthalmic | 81 ECMO | B+B | 10 min |
| **10** | 77 Pain | 78 Neurocognitive | B+C | 10 min |
| **11** | 70 Extreme (Alt) | 71 Extreme (Press) | C+C | 10 min |
| **12** | 57 Organ Procure | 85 Emergency | C+D | 10 min |

**Checkpoint after Batch 1**: Full quality review of Ch 46 + 82. If format is wrong → fix template before continuing.

---

## 9. Output Template

```markdown
# פרק {N} — {hebrew_title} ({english_title})
> Miller's Anesthesia 10e · Per-Topic Cheat Sheets · עודכן: אפריל 2026
---

* **{Topic 1 Title}:**
    - {emoji} **{Key Concept}:** {description}.
    - {emoji} **{Mechanism (WHY)}:** {explanation}.
    - {emoji} **{Values/Thresholds}:** {numbers + units}.
    - ⚠️ **The Board Trap:** {trap description + correct answer}.

* **{Topic 2 Title}:**
    - ...
    - ⚠️ **The Board Trap:** ...

[... all topics in chapter ...]

---

## הערות אישיות
> מתוך הערות.md — Obsidian Vault

{content from הערות.md}

---
*נוצר באמצעות NotebookLM + Supabase + Claude | אפריל 2026 (v2 — Per-Topic Cheat Sheets)*
```

---

## 10. Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| NBLM returns wrong chapter | < 3/10 keywords match | Save empty file; Claude-only in Stage 2 |
| NBLM timeout (>150s) | 10 polls without result | Save empty file; Claude-only in Stage 2 |
| NBLM auth error | Auth exception | Run `nlm login`, retry once |
| Supabase empty (no questions) | 0 rows returned | Rely on NBLM + SUMMARY.md |
| Supabase explanations have HTML | Tags in content | Strip HTML in post-processing |
| SUMMARY.md missing (ch. 85) | File not found | Use TXT file (first 8000 chars) |
| Context window full | Claude truncation | Batch of 2 prevents this |
| Chapter 66 dual folders | Known in advance | Write to en-dash folder only |
| Generated file too short (<150 lines) | Mini-QA check | Claude regenerates from SUMMARY.md |
| Board Trap count < 3 | Mini-QA check | Claude generates additional traps |

---

## 11. Verification Checklist

### Per-File (Mini-QA — after each batch)
- [ ] Line count > 200
- [ ] Board Trap count (⚠️) ≥ 5
- [ ] Emoji coding present (at least 3 different emoji types)
- [ ] WHY explanations present (≥ 3 occurrences of WHY/למה)
- [ ] Numerical values present (numbers + units)
- [ ] Hebrew + English medical terms
- [ ] הערות אישיות section exists with content
- [ ] File in correct Vault folder
- [ ] Header contains correct chapter number

### Per-Pipeline (Stage 3 — final)
- [ ] All 24 files exist in correct paths
- [ ] Coverage check: every Supabase topic covered
- [ ] Cross-reference: every SUMMARY.md principle covered
- [ ] Total nblm count = 76 (52 existing + 24 new)
- [ ] No duplicate files in any folder

---

## 12. Critical Files

### Input Paths
| Type | Path Pattern | Count |
|------|-------------|-------|
| Personal notes | `~/Documents/Obsidian Vault/<ch>/הערות.md` | 24 |
| Board-prep summary | `~/Desktop/MILLER_10_.../SUMMARY.md` | 23 (not 85) |
| Full chapter text | `~/Desktop/MILLER_10_.../M_C_TXT/<ch>.txt` | 24 |
| NBLM Notebook | ID: `4df9facd-84c4-4651-8551-6c0f335ce652` | 113 sources |
| Supabase questions | Table: `questions` (project: ksbblqnwcmfylpxygyrj) | ~553 rows |

### Output Paths
| Type | Path Pattern | Count |
|------|-------------|-------|
| Cheat Sheet files | `~/Documents/Obsidian Vault/<ch>/פרק-N-nblm.md` | 24 new |

### Intermediate Files
| Type | Path | Lifecycle |
|------|------|-----------|
| NBLM raw | `/tmp/miller_harvest/nblm_raw/ch_N.md` | Deleted after Stage 2 |
| Supabase export | `/tmp/miller_harvest/supabase/ch_N_explanations.md` | Deleted after Stage 2 |

### Reference (Gold Standard)
| File | Why |
|------|-----|
| Chapter 15 notes (shown by user) | Per-topic format with emoji + Board Traps |
| `Vault/50 - Cardiac/פרק-50-nblm.md` | Best existing 6-section nblm |
| `Vault/22 - Opioids/פרק-22-nblm.md` | Longest existing nblm (687 lines) |

---

## 13. Special Cases

### Chapter 66 — Dual Folders
- Target: `66 - Anesthesia for Otolaryngologic and Head–Neck Surgery` (en-dash)
- Ignore: `66 - Anesthesia for Otolaryngologic and Head-Neck Surgery` (hyphen)
- Report duplicate to Idan after completion

### Chapter 85 — No SUMMARY.md, No Questions
- No Supabase explanations (0 questions)
- No SUMMARY.md
- Sources: NBLM + TXT file (156KB) + הערות.md
- Expected: Shorter output (~150-200 lines)
- Lower exam weight — acceptable quality ceiling

### Chapters 73, 75, 83 — Huge Explanations from Few Questions
- Ch 73: 1.4MB from 7 questions
- Ch 75: 1.7MB from 6 questions
- Ch 83: 325KB from 1 question
- Strategy: Sample explanations (first 50KB) to avoid context overflow
- Claude extracts topics from sampled content + SUMMARY.md fills gaps

---

## 14. Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Stage 1A: NBLM Harvest | ~45 min | 24 async queries × ~2 min each |
| Stage 1B: Supabase Harvest | ~15 min | 24 SQL queries (fast) |
| Stage 2: Format (12 batches) | ~120 min | 2 chapters × ~10 min + 2 min QA |
| Stage 3: Final QA | ~20 min | Automated checks + report |
| **Total** | **~3.5 hours** | Conservative estimate |

### Session Strategy
Due to context window limits, the pipeline may span multiple sessions:
- **Session 1**: Stage 1 (Harvest) — all data saved to /tmp/miller_harvest/
- **Session 2**: Stage 2 Batches 1-6 (12 chapters)
- **Session 3**: Stage 2 Batches 7-12 (12 chapters) + Stage 3 (QA)

**Resume Protocol**: Each session starts by checking:
1. Does `/tmp/miller_harvest/` exist? → Skip Stage 1
2. Which פרק-N-nblm.md files already exist in Vault? → Skip completed chapters
3. Generate "progress report" before continuing

**Crash Recovery**: All intermediate data in /tmp/miller_harvest/ survives session crashes. Stage 2 is idempotent — re-running a chapter overwrites the previous output safely.

### Supabase Large Explanation Handling
Chapters 73 (1.4MB), 75 (1.7MB), 83 (325KB) have enormous explanations from few questions. Strategy:
- Read ALL explanations but extract **only Board Traps + Cheat Sheet sections** (grep for "Board Trap", "Cheat Sheet", "⚠️", "מלכודת")
- If extracted content exceeds 30KB, summarize into topic bullets before feeding to Claude
- This prevents context window overflow while preserving the most valuable content

### PDF/DOCX Verification Fallback
Each chapter folder in `~/Desktop/MILLER_10_SINGEL_CHEAPTER_TXT&PDF/` contains:
- Original Miller PDF (~200-700 pages per chapter)
- 10-25 DOCX deep-dive files on specific topics
- These serve as **ground truth verification** when:
  - NBLM and Supabase content conflict
  - A numerical value seems incorrect
  - A mechanism needs clarification
- Access: Use `Read` tool on PDF with specific page numbers

---

## 15. Success Criteria

| Metric | Target |
|--------|--------|
| Files created | 24/24 |
| Total nblm files | 76 (52 + 24) |
| Per-topic format | 100% files use emoji + Board Traps |
| Board Traps per file | ≥ 5 |
| Lines per file | ≥ 200 (avg ~350) |
| Coverage vs Supabase | ≥ 90% topics covered |
| Cross-ref vs SUMMARY | ≥ 90% principles covered |
| Correct folder placement | 100% |
