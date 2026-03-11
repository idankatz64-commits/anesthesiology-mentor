

# תוכנית עיצוב מחדש — מסך ראשי (v2)

## סיכום הבקשה
המסך הנוכחי נראה גנרי מדי — כל האריחים באותו גודל, אייקונים פשוטים, חסרים אלמנטים ויזואליים בסטטיסטיקה. הרפרנס מראה layout מגוון עם אריחים בגדלים שונים, מפת חום נושאים, ואלמנטים גרפיים (rings/gauges).

## שינויים מתוכננים

### 1. Layout מחודש — אריחים בגדלים שונים (`HomeView.tsx`)
במקום grid 3x3 אחיד, מעבר ל-layout מגוון בהשראת הרפרנס:

```text
┌──────────────────────────────────────────────────────┐
│              COUNTDOWN (full width, larger)           │
├──────────────────────────────────────────────────────┤
│  Accuracy Ring  │  Completion Ring  │  Topic Heatmap  │
│  (col-span-2)   │  (col-span-2)     │  (col-span-8)   │
├──────────────────────────────────────────────────────┤
│  FOCUS SESSIONS title                                │
│  Smart Practice    │ Spaced Repetition │  Simulation   │
│  (col-span-4)      │ (col-span-4)      │ (col-span-4)  │
│  (taller, accent)  │ (taller, accent)  │               │
├──────────────────────────────────────────────────────┤
│  smaller cards: Flashcards │ Custom │ Mistakes        │
│  Favorites │ Notebook │ Algorithm                     │
├──────────────────────────────────────────────────────┤
│  Daily Report │ DB Status                             │
└──────────────────────────────────────────────────────┘
```

- שורה עליונה (analytics): grid `lg:grid-cols-12` — שתי עיגולי progress (4 cols) + מפת חום נושאים (8 cols)
- שורה אמצעית (focus): 3 כרטיסים ראשיים גדולים יותר (Smart Practice, Spaced Repetition, Simulation) עם border צבעוני ועיגול דקורטיבי ברקע
- שורה תחתונה: 6 כרטיסים קטנים יותר ב-grid-cols-3

### 2. מרכיב ויזואלי בסטטיסטיקה — Progress Rings (`HomeStatsSummary.tsx`)
החלפת 4 כרטיסי מספרים ב-2 SVG rings + 2 כרטיסי מספרים:
- **Overall Accuracy** — SVG donut ring עם אחוז במרכז (amber/green)
- **Completion Rate** — SVG donut ring (emerald) המראה כמה שאלות נענו מתוך הכלל
- **שאלות היום** + **טעויות פתוחות** — נשארים כמספרים אבל עם mini progress bar / color scale

### 3. מפת חום נושאים חדשה (`HomeTopicHeatmap.tsx` — קומפוננטה חדשה)
- Grid של 5-7 תאים צבעוניים (top weak topics)
- כל תא: שם הנושא + אחוז דיוק
- צבע רקע: ירוק (>80%), amber (50-80%), אדום (<50%)
- Hover: overlay עם אחוז מדויק
- נתונים מ-`progress.history` + `data` (חישוב accuracy per topic)

### 4. אייקונים מיוחדים + אנימציות
החלפת אייקונים גנריים:
- **Smart Practice**: `Sparkles` (lucide) + אנימציית pulse
- **Simulation**: `Timer` + אנימציית spin איטי
- **Spaced Repetition**: `RefreshCcw` + אנימציית rotate
- **Flashcards**: `Layers` + flip animation
- **Custom Practice**: `SlidersHorizontal` + bounce
- **Mistakes**: `AlertCircle` + shake
- **Favorites**: `Heart` + beat animation
- **Notebook**: `BookOpen` + page-turn
- **Algorithm**: `Cpu` + blink

כל אייקון מקבל motion wrapper עם `animate` loop עדין (opacity, rotate, scale) שפועל תמיד, לא רק ב-hover.

### 5. שעון — הגדלה + הדגשת ציטוטים
- הגדלת digit size: `sm:text-3xl` (במקום `sm:text-2xl`)
- הגדלת ה-container padding
- ציטוט: `text-sm sm:text-base` + `font-medium` (במקום `text-xs sm:text-sm font-light`)

### 6. Focus Cards עם אפקט דקורטיבי
3 הכרטיסים הראשיים (Smart Practice, Simulation, Spaced Repetition):
- Border צבעוני ייחודי לכל אחד (emerald, amber, slate)
- עיגול דקורטיבי (absolute, -right-4 -bottom-4) כמו ברפרנס
- Padding גדול יותר (p-6)
- אייקון גדול יותר (text-3xl)

## קבצים שמשתנים

| קובץ | שינוי |
|---|---|
| `src/components/views/HomeView.tsx` | Layout מחודש, אייקונים חדשים, focus cards, grid מגוון |
| `src/components/stats/HomeStatsSummary.tsx` | SVG progress rings + mini bars |
| `src/components/stats/HomeTopicHeatmap.tsx` | **חדש** — מפת חום 5-7 נושאים חלשים |
| `src/components/MatrixCountdown.tsx` | הגדלת digits + הדגשת ציטוט |

אין שינויים ב-DB או בלוגיקה עסקית.

