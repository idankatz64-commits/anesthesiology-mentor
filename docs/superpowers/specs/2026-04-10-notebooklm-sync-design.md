# notebooklm-sync — Design Spec
**תאריך:** 2026-04-10
**סטטוס:** מאושר — ממתין לביצוע

---

## מטרה

בניית pipeline שמעבד הערות לימוד גולמיות מ-Obsidian Vault בשני שלבים:
- **שלב א (Claude):** ניקוי, ארגון וסיווג ההערות
- **שלב ב (NotebookLM):** הפניות ויזואליות + Cheat Sheet מבוסס שאלות מבחן אמיתיות

---

## ארכיטקטורה

```
[הפעלה ידנית]          [הפעלה אוטומטית]
/notebooklm-sync פרק X  obsidian-daily (סוף צינור)
         ↓                      ↓
    notebooklm-sync SKILL (Claude)
         │
         ├─ שלב א (Claude ישירות)
         │   1. מניעת כפילויות
         │   2. חלוקה לנושאים
         │   3. זיהוי מנגנונים + קטגוריות
         │   4. רשימות → טבלאות
         │
         ├─ Supabase SELECT (read-only)
         │   שאלות מבחן לפי chapter/miller
         │
         └─ notebooklm_sync.py (Python)
             שלב ב (NotebookLM)
             5. הפניות ויזואליות מהספר
             6. Cheat Sheet מבוסס שאלות אמיתיות
                  ↓
         פרק-X-nblm.md (מחליף קובץ קיים)
```

---

## רכיבים

### 1. `notebooklm-sync` Skill
**נתיב:** `~/.claude/skills/notebooklm-sync/SKILL.md`

**תפקיד:** אורקסטרטור — מריץ את שני השלבים בסדר.

**פעולות:**
1. מקבל מספר פרק (מהמשתמש או מ-obsidian-daily)
2. מוצא תיקיית פרק ב-Vault: `/Users/idankatz15/Documents/Obsidian Vault/[X - ...]/הערות.md`
3. מבצע שלב א ישירות (Claude קורא → מעבד → מחזיר טקסט מובנה)
4. שולח SELECT ל-Supabase לשאלות הפרק
5. קורא ל-`notebooklm_sync.py` עם הפלט של שלב א + השאלות
6. שומר את הפלט כ-`פרק-X-nblm.md` בתיקיית הפרק

---

### 2. `notebooklm_sync.py`
**נתיב:** `/Users/idankatz15/Desktop/notebooklm_sync.py`

**⚠️ READ-ONLY — לא כותב לSupabase, לא נוגע ב-repo-temp**

**קלט (stdin או args):**
- הערות מעובדות (טקסט markdown)
- שאלות מבחן (JSON)
- מספר פרק

**פעולות:**
1. Playwright → Google Auth → NotebookLM
2. שולח prompt מובנה לנוטבוק `3350d7aa-be6a-4a59-ad73-efbf96da68da`
3. מחזיר תוצאה ל-stdout (markdown)

**prompt template:**
```
בהתבסס על ספר מילר הרדמה מהדורה 10 ועל ההערות הבאות לפרק [X]:

[הערות מעובדות]

ועל בסיס שאלות המבחן הבאות שנשאלו בפועל:
[שאלות]

אנא ספק:

## הפניות ויזואליות מהספר
רשום את כל הטבלאות, גרפים, תמונות, נוסחאות ו-Box-ים הרלוונטיים לפרק זה
(פורמט: - Figure X-Y: תיאור קצר)

## Cheat Sheet למבחן
נקודות ⚡ קריטיות — כל נקודה בשורה, עם המנגנון הקצר
```

---

### 3. עדכון ל-`obsidian-daily`
בסוף הצינור הקיים, לאחר obsidian-qc, הוספת:
```
אם פרקים לומדו היום → קרא ל-notebooklm-sync על כל פרק
כישלון של notebooklm-sync → log warning, אל תעצור את obsidian-daily
```

---

## פלט — `פרק-X-nblm.md`

```markdown
# פרק X — עיבוד NotebookLM
> עודכן: YYYY-MM-DD | מבוסס על N שאלות מבחן

---

## הערות מאורגנות

### [נושא א]
...

### [נושא ב]
...

## מנגנונים מסווגים

| מנגנון | קטגוריה | נקודה קלינית |
|--------|----------|--------------|
| ...    | ...      | ...          |

## הפניות ויזואליות בספר

- Figure X-1: ...
- Table X-2: ...
- Box X-1: ...

## ⚡ Cheat Sheet למבחן

[מבוסס על N שאלות אמיתיות]

⚡ [נקודה 1]
⚡ [נקודה 2]
...
```

---

## שאילתת Supabase (READ-ONLY)

```sql
SELECT id, question, a, b, c, d, correct, explanation
FROM questions
WHERE miller = '[X]' OR chapter = '[X]'
ORDER BY id
LIMIT 100;
```

**⚠️ אמצעי זהירות קריטיים:**
- SELECT בלבד — אין INSERT / UPDATE / DELETE
- לא נוגעים ב-repo-temp או ב-App code
- לא משנים RLS policies
- לא נוגעים ב-Edge Functions
- הסקריפט יושב ב-`~/Desktop/` — הפרדה מוחלטת מהאפליקציה

---

## התנהגות קיים / עדכון

| מצב | התנהגות |
|-----|---------|
| `פרק-X-nblm.md` לא קיים | יוצר חדש |
| `פרק-X-nblm.md` קיים | מחליף לגמרי |
| הערות.md לא קיים | עוצר עם הודעה ברורה |
| Supabase נכשל | ממשיך ללא שאלות + warning |
| NotebookLM auth נכשל | עוצר, מבקש re-auth |
| Rate limit | retry פעם אחת אחרי 30 שניות |
| notebooklm-sync נכשל | obsidian-daily ממשיך, מדפיס warning |

---

## התקנה נדרשת

```bash
pip install notebooklm-py
playwright install chromium
# Google auth — הגדרה ראשונה דרך Playwright browser
```

---

## Open Items (לאחרי שלב א')

- [ ] Agent לצילום מסך של הפניות ויזואליות מ-PDF — פרויקט נפרד
- [ ] תמיכה במספר פרקים במקביל
- [ ] caching של תוצאות NotebookLM (למנוע קריאות חוזרות)

---

## לא בסקופ

- שינוי כלשהו ל-repo-temp או לאפליקציה
- כתיבה לSupabase
- עיבוד קבצי .docx בתיקיות הפרקים
- צילום מסך מ-PDF (Open Item לאחרי שלב א')
