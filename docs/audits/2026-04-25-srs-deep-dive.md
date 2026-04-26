# בדיקה כירורגית — SRS ובחירת שאלות
**תאריך:** 2026-04-25
**ענף:** `phase-1-stats-cleanup` (HEAD `3b277d1`, פוסט-Phase-0)
**שיטה:** מעקב ידני מקליק → AppContext → DB → SM-2 → smartSelection. לא נדרש click-path-audit (קוד קצר ולינארי).

---

## תקציר תשובה ישירה לשאלה שלך

> **"האם המערכת רואה שאני טועה / מנחש / מתלבט / בטוח / לחזור מחר? האם זה נכנס לאלגוריתם או שזה רק פרונטאנד?"**

| שלב | סטטוס | הערה |
|-----|--------|------|
| **1. הקליק נרשם בזיכרון הסשן** | ✅ עובד | `setConfidence` ב-`SessionView.tsx:344-350` |
| **2. נשלח ל-DB עם חישוב SM-2 אמיתי** | ✅ עובד | `updateSpacedRepetition` ב-`AppContext.tsx:460-518` — חישוב נכון של interval / ease / reps |
| **3. מחושב `next_review_date` נכון** | ✅ עובד | confident → 1→6→prev×ease, hesitant → ramp איטי, guess/wrong → reset ל-1 יום |
| **4. הנתון נכתב לטבלת `spaced_repetition`** | ✅ עובד | upsert עם error toast (אבל לא throw — ראה בעיות יציבות) |
| **5. אלגוריתם בחירת שאלות משתמש בנתון** | ⚠️ **חלקית — הנה הבאג** | משתמש רק ב-`next_review_date`. **לא** משתמש ב-`interval_days`, `ease_factor`, `repetitions`, או `confidence` עצמו |
| **6. שאלות שסומנו "בטוח" יורדות בעדיפות** | ❌ **לא באמת** | יוצא ש**הן יוצאות במקרה ושוב ושוב** |

> **המסקנה הנקייה:** הצד הכותב (קליק → DB) עובד. **הצד הקורא (DB → איזה שאלות יוצגו עכשיו) שבור.** ה-SM-2 מחושב ונשמר — אבל המידע **לא נצרך כראוי** כשה-app בוחר שאלות לסשן הבא.

---

## איך זה עובד בפועל — מסלול מלא של קליק

### הקליק שלך (לחיצה על "✅ בטוח" אחרי שעניתי נכון)

```
SessionView.tsx:344  →  handleConfidenceSelect("confident")
  ↓
AppContext.tsx:452   →  setConfidence(index, "confident")              [זיכרון בלבד]
AppContext.tsx:???   →  updateHistory(qid, isCorrect, topic)            [זיכרון progress]
AppContext.tsx:460   →  updateSpacedRepetition(qid, true, "confident")  [עכשיו ל-DB]
  ↓
1. SELECT existing SM-2 state (interval_days, ease_factor, repetitions)
2. חישוב חדש:
     reps = 0  →  interval = 1   (יום אחד)
     reps = 1  →  interval = 6   (שישה ימים)
     reps ≥ 2  →  interval = prev × ease  (ease מתחיל ב-2.5)
   ease = min(4.0, ease + 0.1)
   reps++
3. next_review_date = היום + interval
4. UPSERT ל-`spaced_repetition`
5. אם נכשל → console.error + toast "שגיאה בשמירת נתוני חזרה מרווחת"
6. אם הצליח → setConfidenceMap[qid] = "confident"  (cache מקומי)
```

**עד כאן הכול בסדר.** ה-DB מתעדכן, ה-SM-2 פועל. ניתן לראות בטבלה כתב-יד-תקין:
- שאלה שסומנה confident פעמיים → next_review_date = היום + 6 ימים
- שאלה שסומנה confident שלוש פעמים → next_review_date = היום + ~15 ימים (6 × 2.5)
- שאלה שסומנה guess → next_review_date = מחר, ease יורד

### הבחירה של שאלות לסשן הבא (ב-Setup → Smart Mode)

```
SetupView.tsx:128    →  srsData = await fetchSrsData()          ⚠️ כאן הבעיה הראשונה
  ↓
AppContext.tsx:849   →  fetchSrsData() מחזיר רק { question_id, next_review_date }
                        ❌ לא קורא interval_days, ease_factor, repetitions, confidence
  ↓
smartSelection.ts:372 →  selectSmartQuestions(pool, count, sessionSize, srsData, history, allData)
  ↓
שלב 1 — קיבוץ לפי נושא וניקוד נושא: בסדר.
  weakness, recencyGap, streakPenalty, examProximity, yieldBoost
שלב 2 — Hamilton allocation (תקרת 25% לנושא): בסדר.
שלב 3 — בחירת שאלות בתוך נושא:
  smartSelection.ts:422  →  urgency = computeSrsUrgency(q, srsData) + Math.random() * 0.001
                                      └─────────┬─────────┘
                                                ↓
                              smartSelection.ts:166  →  computeSrsUrgency:
                                  if (!srs)              return 0.5  ← שאלה חדשה
                                  if (daysOverdue <= 0)  return 0    ← שאלה מתוכננת לעתיד
                                  else                   return clamp01(daysOverdue/60)
  ↓
מיון לפי urgency descending → לוקח n הראשונים → מערבב סופית.
```

---

## איפה הבאגים — בדיוק

### 🔴 באג ראשי #1 — Math.random() תיקו אקראי בתוך נושא
**מיקום:** `src/lib/smartSelection.ts:421-424`

```typescript
const scored = byTopic[topic]
  .map(q => ({ q, urgency: computeSrsUrgency(q, srsData) + Math.random() * 0.001 }))
  .sort((a, b) => b.urgency - a.urgency);
selected.push(...scored.slice(0, n).map(s => s.q));
```

**הבעיה הקונקרטית:** ב-`computeSrsUrgency`, **כל שאלה שעדיין לא הגיעה לתאריך החזרה שלה מקבלת urgency = 0**:
```typescript
if (daysOverdue <= 0) return 0;
```

**מה זה אומר בפועל:** דמיין נושא X עם 30 שאלות שכבר ענית עליהן בביטחון (next_review = בעוד 6, 15, 30 יום).
- כל ה-30 קושרות ב-`urgency = 0`.
- ה-`Math.random() * 0.001` הוא ה**יחיד** שמכריע ביניהן.
- Hamilton הקצה לנושא הזה 4 slots → 4 שאלות נבחרות אקראית מתוך ה-30.

**זה בדיוק מה שאתה מרגיש: "שאלות חוזרות שכבר סימנתי בטוח."** ה-SM-2 חישב למשל "next_review = היום+30 ימים", אבל האלגוריתם לא יודע להבדיל בין שאלה ש-`next_review` שלה היא +1 יום לבין +30 ימים — שתיהן `urgency = 0`.

### 🔴 באג ראשי #2 — `fetchSrsData` קורא רק שדה אחד מ-5
**מיקום:** `src/contexts/AppContext.tsx:849-862`

```typescript
const fetchSrsData = useCallback(async () => {
  ...
  supabase.from('spaced_repetition').select('question_id, next_review_date')
                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                              חסר: interval_days, ease_factor,
                                                    repetitions, confidence, last_correct
});
```

**ההשלכה:** האלגוריתם **לא יכול** להעדיף שאלות שאתה פחות בטוח בהן (hesitant) על פני שאלות שאתה בטוח בהן (confident) — כי המידע הזה לא מגיע אליו.
- שאלה "hesitant, next_review = +3 ימים" → urgency = 0 (לא דחוף בטכנית)
- שאלה "confident, next_review = +30 יום" → urgency = 0
- **שתיהן שוות בעיני האלגוריתם.**

### 🔴 באג ראשי #3 — שאלות שכבר ענית עליהן נשארות ב-pool
**מיקום:** `src/components/views/SetupView.tsx:118` + `AppContext.tsx:776`

`getFilteredQuestions` לא מסנן `history` כברירת מחדל. רק אם המשתמש סימן ידנית את `unseenOnly` (תיבת סימון ב-UI). ברירת מחדל = כבוי.

**ההשלכה:** ה-pool כולל גם שאלות שכבר ענית עליהן (במצב כל מצב). זה לא בהכרח רע — אתה כן רוצה לחזור על שאלות (זה בדיוק SRS). הבעיה היא ש**הבחירה ביניהן אקראית** (באג #1) במקום ממוינת לפי SM-2 אמיתי.

### 🟠 באג #4 — Custom mode עוקף לחלוטין את SRS
**מיקום:** `src/components/views/SetupView.tsx:124-126`

```typescript
if (isCustom) {
  startSession(pool, customCount, mode);  // ← ישר ל-startSession בלי selectSmartQuestions
}
```

ו-`startSession` עצמה ב-`AppContext.tsx:366`:
```typescript
const shuffled = [...pool].sort(() => Math.random() - 0.5);
const quiz = shuffled.slice(0, Math.min(pool.length, count)).map(...);
```

**ההשלכה:** אם בחרת "custom 30 שאלות" — אין SRS בכלל. זו דגימה אקראית טהורה. אם אתה משתמש ב-custom לעיתים קרובות → זה הופך את כל ה-SRS לחסר משמעות בסשנים האלה.

### 🟠 באג #5 — `simulation` mode גם עוקף את SRS לחלוטין
**מיקום:** `src/lib/smartSelection.ts:448-489`

`selectSimulationQuestions` מקצה לפי פרופורציה (כמו במבחן אמיתי) ובוחר עם `sort(() => Math.random() - 0.5)` בתוך נושא. **0 התחשבות ב-`spaced_repetition`.**

**ההשלכה:** סימולציה = חוויית מבחן אמיתי, כן. אבל אז גם תקבל שאלות חוזרות בהמון, כי האקראיות לא מודעת ל-SM-2.

### 🟠 באג #6 — שאלה שאין לה רשומת SRS עדיפה על שאלה "בטוח" שמתוכננת לעתיד
**מיקום:** `src/lib/smartSelection.ts:166-172`

```typescript
function computeSrsUrgency(q, srsData): number {
  const srs = srsData[q[KEYS.ID]];
  if (!srs) return 0.5; // אין רשומת SRS → עדיפות בינונית   ← שאלה חדשה
  const daysOverdue = (Date.now() - new Date(srs.next_review_date).getTime()) / 86400000;
  if (daysOverdue <= 0) return 0;                            ← שאלה confident מתוכננת לעתיד
  return clamp01(daysOverdue / 60);
}
```

**עיצוב נכון תיאורטית:** שאלה חדשה (0.5) > שאלה שכבר נשלטת (0). זה הגיוני.
**הבעיה בפועל:** כשנושא X **התרוקן משאלות חדשות** (ענית על כולן), הוא נשאר עם 30 confident שכולן ב-0. Hamilton ממשיך להקצות לנושא X slots (כי מבחינתו topicWeakness עדיין רלוונטי) → 4 confident נבחרות אקראית.

---

## בעיות יציבות (קריטי #1 שלך)

### S1. `updateSpacedRepetition` לא זורקת — מה ש-Phase 0 ניסה לתקן ב-handleSubmitSimulation אינרטי
**מיקום:** `AppContext.tsx:510-512` + `SessionView.tsx:421-430`

```typescript
// AppContext: 
if (error) {
  toast.error('שגיאה בשמירת נתוני חזרה מרווחת');  // ❌ אין throw!
}
```
```typescript
// SessionView.handleSubmitSimulation:
const results = await Promise.allSettled(srsPromises);
const failed = results.filter(r => r.status === "rejected").length;
// ↑ failed תמיד = 0 כי updateSpacedRepetition לעולם לא rejecta
if (failed > 0) { /* dead code */ }
clearSavedSession();  // ← רץ ללא תנאי, גם אם 120 כתיבות נכשלו
navigate("results");
```

**ההשלכה הקריטית:** אחרי סימולציה של 120 שאלות, אם שירת ה-DB צוברת shocks או יש בעיית רשת:
1. כל ה-120 SRS upserts יחזירו error (לא יזרקו)
2. Toast יוצג עבור כל אחת בנפרד (120 toasts! — חוויית משתמש איומה)
3. `failed = 0` כי אף אחת לא rejecta → ה-`if` לא נכנס
4. `clearSavedSession()` נכנס → הסשן נמחק מ-localStorage **עם ה-SRS לא מעודכן**
5. ה-app מנווט ל-results ומראה "סיימת!" — בזמן שב-DB אין רישום

**רמת חומרה:** קריטית. אובדן נתונים שקט אפשרי.

### S2. Race condition ב-`updateSpacedRepetition` עצמה
**מיקום:** `AppContext.tsx:464-508`

```typescript
const { data: existing } = await supabase.from('spaced_repetition').select(...)  // SELECT
// ... חישוב interval / ease / reps
await supabase.from('spaced_repetition').upsert(...)                              // UPSERT
```

**הבעיה:** SELECT-then-UPSERT הוא לא אטומי. אם המשתמש לוחץ "confident" → לוחץ מהר "hesitant" על אותה שאלה (תיקון):
1. קליק 1: SELECT existing → קוראים reps=2, interval=15
2. קליק 2: SELECT existing → קוראים אותו reps=2, interval=15 (קליק 1 עוד לא כתב)
3. קליק 1: UPSERT → reps=3, interval=37 (confident progression)
4. קליק 2: UPSERT → reps=3, interval=18 (hesitant מ-base 15) — **דריסה**

**רמת חומרה:** בינונית. נדיר אבל אפשרי. הפתרון: PostgreSQL function עם חישוב אטומי, או optimistic locking.

### S3. אם המשתמש מתנתק (sign-out) באמצע סשן → קליקים על confidence נדחים בשקט
**מיקום:** `AppContext.tsx:461-462`

```typescript
const userId = userIdRef.current;
if (!userId) return;  // ❌ silent return
```

**ההשלכה:** אם הטוקן פג / אם מישהו לוחץ Sign Out במכשיר אחר → הקליקים מתעופפים. אין toast. ה-UI מראה שהקליק התקבל. בפועל — כלום.

### S4. שאלות עם אותו `question_id` בסשנים שונים — ב-handleConfidenceSelect משתמשים ב-`serialNumber` שזה למעשה `question.id`
**מיקום:** `SessionView.tsx:344-350`

זו לא בעיה כשלעצמה אבל **השם** מטעה. `serialNumber` נראה כמו "מספר 1, 2, 3..." אבל בפועל זה ה-ID של השאלה ב-DB. יוצר קושי בקריאת הקוד.

---

## שאלת בקרה — בדקתי בפועל אם יש מסנן "אל תראה לי שאלות שכבר ידעתי"

**יש שני מנגנונים אפשריים לסינון:**

### 1. `unseenOnly` toggle ב-Setup
**מקום:** `SetupView.tsx` יש toggle, ב-`AppContext.tsx:789` הסינון רץ:
```typescript
if (s.unseenOnly) pool = pool.filter(q => !p.history[q[KEYS.ID]]);
```
**עובד תקין** — אם תפעיל אותו, רק שאלות ללא היסטוריה ייכללו.

### 2. `confidence` filter ב-multi-select
**מקום:** `AppContext.tsx:795-798`:
```typescript
if (!ms.confidence.has('all')) pool = pool.filter(q => {
  const c = cm[q[KEYS.ID]];
  return c ? ms.confidence.has(c) : false;
});
```
**עובד תקין** — אם תבחר רק "guessed" או "hesitant" ב-multiselect, יוצגו רק שאלות שתאמו.

**אבל** — שני המנגנונים הם **אופציונליים** ודורשים פעולה מודעת מהמשתמש. ברירת המחדל היא ש-**כל** השאלות בנושא נכללות, וה-Math.random() מחליט.

---

## פתרון מומלץ (לקח להחלטה איתך)

### מה לתקן בעדיפות עליונה (אין ויכוח — באגים)

**Q1. תקן את `Math.random()` כמכריע — הוסף בקרת SM-2 אמיתית**

ב-`smartSelection.ts:166`, `computeSrsUrgency` צריך להחזיר ערך **שלילי** או **מאוד נמוך** לשאלות שמתוכננות לעתיד הרחוק, ולא 0:

```typescript
function computeSrsUrgency(q, srsData): number {
  const srs = srsData[q[KEYS.ID]];
  if (!srs) return 0.5;
  const daysOverdue = ...;
  if (daysOverdue <= 0) {
    // לא דחוף — אבל גם לא שווה ל"חדשה". יוצר מדרג:
    // -1 ימים מחר → -0.05
    // -30 ימים → -1
    return Math.max(-1, daysOverdue / 30);  // כל שלילי < 0
  }
  return clamp01(daysOverdue / 60);
}
```

זה ישבור את ה"שיוויון ב-0" וייתן לאלגוריתם לבחור את ה**פחות מתוכננות לעתיד** קודם.

**Q2. הוסף את `interval_days` ו-`confidence` ל-`fetchSrsData`**

```typescript
.select('question_id, next_review_date, interval_days, confidence, ease_factor, repetitions')
```

ועדכן `SrsRecord` ב-`smartSelection.ts:142-144` כך שיכלול שדות אלה. אז `computeSrsUrgency` יוכל להוריד עוד יותר את הציון של שאלות "confident, interval 30 ימים".

**Q3. תקן את `updateSpacedRepetition` כך שתזרוק (throw) במקום toast בלבד**

```typescript
if (error) {
  console.error('spaced_repetition upsert error:', error);
  throw new Error('SRS save failed: ' + error.message);
}
```

ואז ב-`SessionView.handleSubmitSimulation`:
- ה-`Promise.allSettled` יקבל את ה-rejections באמת.
- `failed > 0` יהיה אמיתי.
- `clearSavedSession()` יוסר אם יש כשלים.

**Q4. הסר את `Math.random() * 0.001` מ-`smartSelection.ts:422`**

אם החזרת ה-`computeSrsUrgency` עכשיו מבוססת על interval רב-ערכי (Q1+Q2), אין יותר תיקו אקראי דרוש. השאר tiebreaker רק ב-`leftover` (שורה 432).

### מה ל**שקול** (החלטות עיצוב — להחליט איתך לפני יישום)

**D1. האם custom mode צריך להיכנס לאלגוריתם החכם?**
היום: לא. זה בכוונה ("פשוט תן לי 30 שאלות אקראיות"). אבל אולי אתה מצפה שגם custom יחשב SRS?

**D2. האם simulation mode צריך לעקוף את SRS?**
היום: כן (חוויית מבחן). אבל סימולציה של 120 שאלות שכוללת שאלות שלמדת מצוין הוא בזבוז זמן.

**D3. ברירת מחדל ל-`unseenOnly` — `false` היום. האם להפוך ל-`true` בסשן "מהיר"?**
זה ישנה את ההתנהגות שלך. אולי כדאי הפיכה ב"מהיר/15 שאלות" אבל לא ב"מעמיק/100".

---

## סיכום מנהלים

**מה עובד:** הצד הכותב — קליק → DB → SM-2 מחושב נכון → upsert.

**מה שבור:** הצד הקורא — `smartSelection` מקבל רק `next_review_date`, מתעלם מ-`interval/ease/confidence`, וב-תיקו של "כולן ב-0" מערבב ב-`Math.random() * 0.001` → **שאלות שאתה בטוח בהן יכולות לחזור אקראית**.

**מה שבור ביציבות:** `updateSpacedRepetition` לא זורקת → `Promise.allSettled` ב-`handleSubmitSimulation` אינרטי → `clearSavedSession` רץ גם אם כל 120 הכתיבות נכשלו → אובדן נתונים אפשרי בשקט.

**תוכנית פעולה ממוקדת (4 תיקונים, ללא דרמה ארכיטקטונית):**
1. `computeSrsUrgency` — החזר ערכים שליליים לעתיד הרחוק.
2. `fetchSrsData` — הוסף את כל שדות ה-SM-2.
3. `updateSpacedRepetition` — `throw` במקום `toast` בלבד.
4. `Math.random()` ב-smartSelection — הסר.

מה שזה **לא** אומר: זו לא רפורמה כמו `binary-swimming-toucan`. אלה תיקוני נקודה ב-3 קבצים, ~30 שורות שינויי קוד.

