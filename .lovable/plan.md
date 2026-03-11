

## תוכנית: עיצוב מחדש של SetupView ו-ResultsView

עיצוב שני המסכים בהשראת התמונות המצורפות — שמירה על כל הפונקציונליות הקיימת, שינוי ויזואלי בלבד.

---

### 1. SetupView (הגדרות תרגול) — בהשראת screen-11

**שינויים ויזואליים:**
- **כותרת עליונה**: "Setup Your Session" בפונט גדול + תת-כותרת מתארת, עם אייקון primary
- **Session Intensity**: שלושת/ארבעת כפתורי הגודל בשורה אחת עם border-primary למצב פעיל (סגנון pill/tab כמו בתמונה), ללא אימוג'י — טקסט נקי
- **פילטרים**: כרטיסים עם אייקון + כותרת (Topic Specialty, Question Year, Institution, Content Tags, Confidence Level) בגריד 3 עמודות — כל כרטיס עם border דק primary/10, אייקון amber, ו-dropdown בתוכו
- **סקשן מקור שאלות**: משולב כ-tabs או pills במקום grid של כפתורים
- **פוטר**: שורה תחתונה עם EST. DURATION + QUESTIONS count בצד שמאל, וכפתור START PRACTICE amber גדול בצד ימין
- **הסרת deep-tile wrapper** — עיצוב שטוח יותר עם כרטיסים בודדים

**אלמנטים שנשמרים**: כל הלוגיקה של MultiSelectDropdown, חיפוש חופשי, מס' סידורי, unseen only, handleStart

---

### 2. ResultsView (סיכום ביצועים) — בהשראת screen-12

**שינויים ויזואליים:**
- **Hero section**: כרטיס גדול עם streak/status badge (כמו "ELITE CANDIDATE STATUS"), אייקון גביע amber, ו-Top X% percentile badge
- **Exam countdown**: כרטיס צד עם ספירה לאחור (DAYS/HRS/MIN) — שימוש בנתוני MatrixCountdown הקיימים
- **שני rings**: Accuracy % ו-Bank Progress % בכרטיסים קטנים עם שינוי שבועי/יומי
- **Activity Heatmap**: grid של ריבועים צבעוניים (14 ימים אחרונים) מבוסס על progress.history
- **Recent Session Review**: רשימת שאלות מהסשן האחרון עם אייקוני ✓/✗ ו-badges (CORRECT/INCORRECT/FLAGGED) — זה ה-details הקיים בעיצוב חדש
- **כפתורי פעולה תחתונים**: "REVIEW ERRORS" (primary/destructive) + "BACK TO DASHBOARD" (neutral) — בשורה אחת
- **נושאים לחיזוק**: נשאר, מעוצב כ-card נקי

**אלמנטים שנשמרים**: כל הלוגיקה של results, weak topics, expanded question details, history update, localStorage save

---

### קבצים שישתנו
1. **`src/components/views/SetupView.tsx`** — עיצוב מחדש מלא (כל הלוגיקה נשארת)
2. **`src/components/views/ResultsView.tsx`** — עיצוב מחדש מלא (כל הלוגיקה נשארת)

