

# שיפורי עיצוב — מסך ראשי (v2.1)

## סיכום 5 השינויים

### 1. DB Status (סה"כ שאלות / כוללות הסבר / ללא הסבר) — העברה מתחת לסטטיסטיקות
כרגע ה-3 כרטיסים (שורות 531-544) נמצאים בתחתית ליד Daily Report. הם יעברו להיות שורה נוספת מתחת ל-`HomeStatsSummary`, ממלאים את כל הרוחב כ-3 כרטיסים אופקיים בגודל שווה (כמו בתמונת הרפרנס).

### 2. Header — מרכוז + כיוון LTR + אנימציה למסור
הכותרת "Let's Play A Game..." עם אייקון המסור תעבור למרכז, בכיוון LTR (כמו בתמונה — `...Let's Play A Game` עם האייקון בצד ימין). האייקון יקבל אנימציית `framer-motion` מיוחדת — סיבוב + נדנוד עדין (rotate + wobble) במקום ה-`animate-pulse` הגנרי הנוכחי.

### 3. הקטנת מלבן "נושאים להתמקד בהם"
`HomeTopicHeatmap` — הקטנת ה-col-span מ-7 ל-5, והפחתת ה-padding. הסטטיסטיקות יקבלו יותר מקום (col-span-7 במקום 5).

### 4. הקטנת גובה השעון
`MatrixCountdown` — הפחתת padding פנימי (`py-4 sm:py-7` → `py-2 sm:py-4`), הקטנת gap בין אלמנטים, כדי שהשעון יתפוס פחות גובה מבלי לפגוע בקריאות.

### 5. הסרת "אפס היסטוריה" מהמסך הראשי
כפתור `resetAllData` יוסר מ-HomeView לגמרי. הפונקציונליות כבר זמינה דרך מקומות אחרים (הגדרות / admin), ואם לא — ניתן להוסיף אותו ל-TopNav dropdown בעתיד.

## קבצים

| קובץ | שינוי |
|---|---|
| `src/components/views/HomeView.tsx` | העברת DB status, מרכוז header, אנימציית מסור, הסרת reset button |
| `src/components/MatrixCountdown.tsx` | הקטנת padding/gaps |
| `src/components/stats/HomeTopicHeatmap.tsx` | הקטנת padding |

אין שינויים ב-DB או בלוגיקה.

