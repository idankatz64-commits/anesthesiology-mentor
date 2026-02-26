

# בדיקת באגים גלובלית -- שמירה, התקדמות ועריכה

## באגים שנמצאו

### 1. באג קריטי: עריכות אדמין בתוך סשן לא מסומנות כ-`manually_edited`
**חומרה: גבוהה**

כשאדמין עורך הסבר, תשובה נכונה, או פרק מתוך מסך הסשן (`SessionView.tsx`), העדכון לא כולל `manually_edited: true`. המשמעות: הסנכרון הבא מ-Google Sheets ידרוס את השינויים.

- שורות 539-542: עדכון תשובה נכונה -- חסר `manually_edited: true`
- שורות 619-620: עדכון הסבר -- חסר `manually_edited: true`
- שורות 671-675: עדכון פרק -- חסר `manually_edited: true`

**תיקון:** הוסף `manually_edited: true` לכל שלושת קריאות ה-`update` של שאלות ב-`SessionView.tsx`.

---

### 2. באג: עריכות אדמין משנות את האובייקט ישירות (mutation)
**חומרה: בינונית**

בשורות 547, 626, 677-679, הקוד משנה ישירות את `qData` (למשל `qData[KEYS.CORRECT] = correctAnswerDraft`). זו מוטציה ישירה של אובייקט בתוך מערך ה-`data` של React, בלי לעבור דרך `setState`. השינוי נראה באופן מקומי, אבל:
- אם הקומפוננטה עושה re-render ממקור אחר, השינוי עלול להיעלם
- זה מפר את עקרונות React של immutability

**תיקון:** לאחר שמירה מוצלחת ל-DB, לעדכן את ה-cache ב-`sessionStorage` ולרענן את ה-`data` state, או לכל הפחות להשאיר את המוטציה הנוכחית (שעובדת בפרקטיקה) אבל גם לנקות את ה-sessionStorage cache כדי שבפעם הבאה הנתונים ייטענו מעודכנים.

---

### 3. באג: `updateHistory` נקרא בתוך `useMemo` ב-ResultsView
**חומרה: בינונית**

ב-`ResultsView.tsx` שורות 71-78, `updateHistory` (שהוא side effect שכותב ל-localStorage) נקרא מתוך `useMemo`. זה:
- מפר את כללי React (side effects אסורים ב-memo)
- עלול להיקרא מספר פעמים או לא להיקרא כלל בהתאם ל-React strict mode
- ב-exam mode, ההיסטוריה נשמרת בכל render מחדש

**תיקון:** להעביר את קריאת `updateHistory` ל-`useEffect` עם dependency על `mode` ו-`quiz`.

---

## שינויים מתוכננים

### קובץ 1: `src/components/views/SessionView.tsx`
- הוסף `manually_edited: true` לשלושת קריאות `supabase.from('questions').update(...)`:
  - עדכון תשובה נכונה (שורה ~541)
  - עדכון הסבר (שורה ~620)
  - עדכון פרק (שורה ~672)
- נקה את ה-sessionStorage cache לאחר כל עדכון מוצלח (`sessionStorage.removeItem('questions_cache')`)

### קובץ 2: `src/components/views/ResultsView.tsx`
- העבר את לוגיקת `updateHistory` עבור exam mode מתוך `useMemo` ל-`useEffect` נפרד שרץ פעם אחת בטעינה

