

## תוכנית: תיקון עדכון הטבלה והגרף ב-EditorActivityTab

### בעיות שזוהו

1. **טעינה חד-פעמית בלבד** — ה-`useEffect` ב-`EditorActivityTab` רץ עם `[]` (dependency array ריק). הרכיב נטען פעם אחת ולעולם לא מרענן, גם כשחוזרים אליו מטאב אחר (React לא עושה remount כי הוא נשאר ב-DOM).

2. **מגבלת 1000 שורות** — השאילתה מ-`question_edit_log` לא מגדירה `.limit()`, אז Supabase מחזיר מקסימום 1000 שורות כברירת מחדל. אם יש יותר מ-1000 רשומות לוג, נתונים חסרים.

3. **חישוב "היום" ב-UTC** — `todayStart.setUTCHours(0,0,0,0)` משתמש ב-UTC במקום שעון ישראל, כך ש"עריכות היום" עלולות להיות לא מדויקות.

4. **אין רענון אחרי עריכה** — כשעורכים שאלה ב-`QuestionEditorTab` וחוזרים לטאב `EditorActivityTab`, הנתונים לא מתרעננים.

---

### פתרון

#### א. רענון אוטומטי בכל מעבר טאב
ב-`AdminDashboard.tsx` — להוסיף `key={activeTab}` לרכיב `EditorActivityTab` כדי לכפות remount בכל פעם שנכנסים לטאב:

```tsx
{activeTab === 'editor-activity' && <EditorActivityTab key="editor-activity-live" />}
```

**אלטרנטיבה טובה יותר**: להעביר `activeTab` כ-prop ולהפעיל refetch כשהטאב הופך פעיל:

```tsx
<EditorActivityTab isActive={activeTab === 'editor-activity'} />
```

ואז ב-`EditorActivityTab`:
```tsx
useEffect(() => { if (isActive) load(); }, [isActive]);
```

#### ב. תיקון מגבלת 1000 שורות
להוסיף `.limit(5000)` לשאילתה, או לשנות לגישת pagination/aggregation. מאחר שזה דוח admin ולא צפוי להגיע ל-5000+ עריכות בקרוב, limit גבוה מספיק:

```tsx
supabase
  .from('question_edit_log')
  .select('editor_id, edited_at, question_id')
  .order('edited_at', { ascending: false })
  .limit(5000)
```

#### ג. תיקון חישוב שעון ישראל
להחליף את `setUTCHours` בחישוב מבוסס timezone ישראלי (כמו שנעשה ב-`DailyReportTile`):

```tsx
function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
const todayStr = toIsraelDateStr(new Date());
```

ולהשוות תאריכי לוג מול `todayStr` במקום `todayStart`.

#### ד. כפתור רענון ידני
להוסיף כפתור `RefreshCw` בכותרת "דוח עורכים" שמפעיל `load()` מחדש — כדי שהאדמין יוכל לרענן בכל רגע.

---

### קבצים שישתנו

| קובץ | שינוי |
|---|---|
| `src/components/admin/EditorActivityTab.tsx` | תיקון dependency array, limit, timezone, כפתור refresh |
| `src/pages/AdminDashboard.tsx` | העברת `isActive` prop או שימוש ב-key לרענון |

אין שינויי מסד נתונים.

