

## תוכנית: עיצוב מחדש של SessionView

שינוי ויזואלי בלבד + תשתית מוכנה לתמונות (מוסתרת) + מנגנון חלונות הסבר מפוצלים.

---

### 1. עיצוב ויזואלי — בהשראת screen-13

**כותרת/Topic badge**: badge קטן צבעוני (amber/primary) מעל השאלה עם שם הנושא (כמו "OBSTETRIC ANESTHESIA" בתמונה), במקום שורת המטא הנוכחית.

**טקסט השאלה**: הגדלת הפונט מ-`text-lg` ל-`text-xl md:text-2xl`, `font-bold`, `leading-relaxed` — כמו בתמונה.

**כרטיסי תשובות**: כל תשובה ב-glass-card עם `bg-white/[0.03]` ו-border דק, padding גדול יותר, ללא הרדיוס הגדול הנוכחי (מעבר מ-`rounded-2xl` ל-`rounded-xl`).

**Confidence Rating**: עיצוב כ-segmented control אופקי (כמו בתמונה — "Sure | Hesitant | Guess") עם pill פעיל ב-amber, במקום שלושה כפתורים נפרדים.

**Progress bar**: שורה עליונה עם progress bar + counter ("142/500") + system timer בצד ימין — מאוחד כמו בתמונה.

**Bottom nav**: כפתורי "Back" (שמאל), "Flag" + "Next Question" (ימין) — עיצוב נקי יותר תואם לתמונה.

**Feedback section**: הסבר מוצג ב-glass-card אחיד, עם כותרות bold (כמו "EXECUTIVE SUMMARY", "THE TRAP", "MILLER'S DEEP DIVE" בתמונה) — אבל זה יבוא מהמנגנון של חלונות מפוצלים (סעיף 3).

---

### 2. תשתית תמונות (מוסתרת)

- הוספת סקשן "CRITICAL VISUALS" ב-UI עם `{false && (...)}` — הקוד קיים אבל לא מוצג.
- הסקשן יכלול grid של 2 תמונות עם caption מתחת — מבנה מוכן לכשיחובר ה-backend.
- לא יופיע למשתמש, לא יהיה כפתור, רק קוד מוכן.

---

### 3. חלון הסבר אחד — עם אפשרות פיצול לאדמין

**ברירת מחדל**: ההסבר הנוכחי (`KEYS.EXPLANATION`) מוצג כחלון אחד שלם ב-glass-card.

**לאדמין בעריכה**: כשהאדמין לוחץ "ערוך הסבר", מופיעה אפשרות "פצל לחלונות" — כפתור שמוסיף separator `---` בטקסט. כל חלק מופרד ב-`---` מוצג ככרטיס נפרד עם אפשרות לתת לו כותרת (השורה הראשונה אחרי ה-separator הופכת לכותרת).

**מנגנון**: פונקציית `splitExplanation(text)` שמחלקת את הטקסט לפי `---` או `<hr>`. אם יש רק חלק אחד — חלון אחד. אם יש מספר חלקים — כל אחד מוצג בכרטיס נפרד עם כותרת אם יש (שורה ראשונה בולטת).

**אייקונים לכותרות**: אם הכותרת מכילה מילות מפתח מוכרות (כמו "EXECUTIVE SUMMARY", "THE TRAP", "MILLER") — מוצג אייקון מתאים אוטומטית.

---

### קבצים שישתנו

| קובץ | שינוי |
|---|---|
| `src/components/views/SessionView.tsx` | עיצוב מחדש מלא + splitExplanation + תשתית תמונות מוסתרת |

כל הלוגיקה הקיימת (handleAnswer, confidence, admin editing, tags, notes, community, timers) נשמרת ללא שינוי.

