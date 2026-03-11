

## תוכנית עיצוב מחדש למסך הסטטיסטיקה

### מצב נוכחי
מסך הסטטיסטיקה (`StatsView`) מכיל הרבה מידע אבל עם רווחים מיותרים, חלונות גדולים מדי, ופריסה לא אופטימלית. הלייאאוט הנוכחי הוא בעיקר עמודה אחת עם `space-y-5`.

### כיוון עיצובי — בהשראת התמונה המצורפת
הלייאאוט בתמונה מציג:
1. **שורת KPI קומפקטית** (4 כרטיסים) — מספרים גדולים + תוויות + שינוי באחוזים
2. **שורה מפוצלת 2:1** — Heatmap גדול משמאל + Strengths/Weaknesses מימין
3. **גרף ביצועים** ברוחב מלא (TradingView style)
4. **Daily Summary** ברוחב מלא

### מה ישתנה

**1. שורת KPI עליונה (4 כרטיסים ב-row)**
- ימזג את DailyReportTile + קטע ה-Question Bank Status לשורה אחת קומפקטית של 4 כרטיסים בסגנון glass:
  - שאלות היום | דיוק יומי | טעויות מצטברות | כיסוי מאגר
- כל כרטיס: תווית קטנה למעלה, מספר גדול, שינוי באחוזים (ירוק/אדום)
- גובה קבוע ~120px, ללא שטח מיותר

**2. שורה מפוצלת — Topic Treemap (2/3) + Strengths & Weaknesses (1/3)**
- Topic Treemap ייקח `lg:col-span-2` בתוך `grid-cols-3`
- חלון חדש **"חוזקות וחולשות"** ייקח `lg:col-span-1`:
  - TOP PERFORMANCE: 2 נושאים חזקים + progress bars ירוקים
  - ACTION REQUIRED: 2 נושאים חלשים + progress bars אדומים
  - נגזר מ-`stats.topicData` (מיון לפי accuracy)
- לחיצה על חלון פותחת את הפירוט המלא (WeakZoneMap + Forgetting Risk)

**3. גרף AccuracyCanvasChart — ברוחב מלא, ללא שינוי**
- כבר קיים ועובד טוב, רק יעבור מ-AnimatedStatsTile wrapper רגיל

**4. שורת Personal Stats קומפקטית**
- 6 הנתונים האישיים (שאלות שבוצעו, ייחודיות, טעויות, מתוקנות, לא תוקנו, טעויות חוזרות) יצומצמו ל-**שורה אחת של 6 כרטיסים קטנים** במקום grid של 3x2
- גובה מינימלי, פונט קטן יותר

**5. שילוב ERI + Gauges**
- ERI tile + Gauge tile ימוזגו לכרטיס אחד קומפקטי יותר, מתחת ל-Personal Stats
- הטבעת במקום טבעת ענקית בגודל 240px → 140px
- Satellites (דיוק/כיסוי/רצף) ישארו כפילים קטנים

**6. Topic Performance Table + Import/Export**
- טבלת נושאים — נשארת כמו שהיא
- Import/Export — נשאר למטה, קומפקטי

**7. Daily Summary Report**
- יוצג בתחתית כמו בתמונה, עם border-left ירוק ואייקון

### סיכום פריסה חדשה
```text
┌─────────────────────────────────────────────────┐
│  KPI: שאלות היום | דיוק | טעויות | כיסוי       │  ← 4 כרטיסים בשורה
├──────────────────────────┬──────────────────────┤
│  Topic Treemap (2/3)     │ חוזקות/חולשות (1/3)  │  ← grid 3 cols
├──────────────────────────┴──────────────────────┤
│  Technical Performance Analysis (chart)          │  ← full width
├─────────────────────────────────────────────────┤
│  Personal Stats: 6 מדדים בשורה אחת              │  ← compact row
├──────────────────────────┬──────────────────────┤
│  ERI + Gauges (compact)  │ Forgetting Risk      │  ← grid 2 cols
├──────────────────────────┴──────────────────────┤
│  Topic Performance Table                         │  ← full width
├─────────────────────────────────────────────────┤
│  Daily Summary Report                            │  ← full width, green border
├─────────────────────────────────────────────────┤
│  Import/Export                                   │  ← compact
└─────────────────────────────────────────────────┘
```

### שינויים בסגנון
- כל הכרטיסים ישתמשו ב-`glass-tile` (כמו HomeView) במקום `deep-tile`
- צבעים: Amber Gold primary, Green success, Red destructive — בדיוק כמו ב-Home
- `gap-4` בין שורות (במקום `space-y-5`)
- ללא header נפרד "דשבורד ביצועים" — הכותרת תהיה חלק מה-TopNav

### קבצים שישתנו
1. **`src/components/views/StatsView.tsx`** — שינוי מבני מלא של הלייאאוט
2. **`src/components/stats/ERITile.tsx`** — הקטנת הטבעת ל-140px, קומפקטי יותר
3. **יצירת `src/components/stats/StrengthsWeaknessesTile.tsx`** — כרטיס חדש לחוזקות/חולשות
4. **`src/components/stats/DailyReportTile.tsx`** — עיצוב מחדש לסגנון Daily Summary עם border-left

### הצעות לאלמנטים חדשים
- **כרטיס "חוזקות וחולשות"** — ויזואליזציה ברורה של 2 נושאים חזקים + 2 חלשים עם progress bars
- **שינוי % יומי** על כל KPI card (כמו בתמונה: +12%, -0.8%) — השוואה לממוצע

