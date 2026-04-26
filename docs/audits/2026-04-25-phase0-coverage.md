# דוח כיסוי Phase 0 מול 35 ממצאי הביקורת
**תאריך:** 2026-04-25
**מטרה:** לפני שכותבים תוכנית תיקון חדשה — לבדוק מה Phase 0 בתוכנית `binary-swimming-toucan` כבר תיקן, מה תוקן באופן חלקי, ומה לא נגעו בו בכלל.
**רקע:** ה-Audit מ-25/04/2026 רץ על הקוד **אחרי** ש-Phase 0 כבר מוזג ל-main (commit `3553592`). כלומר — כל 35 הממצאים שמופיעים בדוח-עברית קיימים **למרות** Phase 0.

---

## תקציר מנהלים

**Phase 0 ביצע 2 commits מרכזיים:**
1. `c270a3e` — `fix(srs): surface DB errors on markForReview, saveSessionToDb, simulation submit`
2. `e2dc8d1` — `fix(edge-functions): harden auth, input caps, and matot-report system prompt`

**מתוך 35 ממצאי ה-Audit:**
- ✅ **3 ממצאים תוקנו במלואם** (עיקר מהם: הרשאות ב-Edge Functions)
- ⚠️ **2 ממצאים תוקנו חלקית** (Phase 0 ניסה אבל הפיתרון "מת מבפנים")
- ❌ **30 ממצאים לא נגעו בהם בכלל** (כולל 6 מתוך 8 הבאגים האדומים החמורים — אותו דפוס של ה-SRS)

**המסקנה:** Phase 0 תיקן את הבאג המקורי שגילינו (`markForReview`, `saveSessionToDb`) ואת ההרשאות ב-Edge Functions. אבל את ה**דפוס הסיסטמי** (fire-and-forget DB writes) — תיקן רק ב-2 מתוך 8 מקומות. 6 פונקציות נוספות עדיין באותה תקלה בדיוק.

---

## ✅ תוקן במלואו על ידי Phase 0

### A1. הרשאות ב-`weekly-report` Edge Function
**Phase 0 הוסיף:** Bearer token + בדיקת `admin_users` + תיקון בדיקה לפי `id` במקום `user_id`.
**עדות:** commit `e2dc8d1`, `supabase/functions/weekly-report/index.ts:343+`.
**ממצא Audit שתואם:** B2 דיווח על `weekly-report` כפונקציה אדמינית. כיום מחויב טוקן + admin check ✓.

### A2. הרשאות ב-`daily-csv-export` Edge Function
**Phase 0 הוסיף:** Bearer + admin check + email regex + cap על `hoursBack` בטווח `[1, 168]`.
**עדות:** commit `e2dc8d1`, `supabase/functions/daily-csv-export/index.ts`.
**ממצא Audit שתואם:** ב-B2 צוין שהפונקציה דורשת אדמין; כיום הבדיקה נעשית כראוי + יש cap על קלט.

### A3. Jailbreak protection ב-`matot-report`
**Phase 0 הוסיף:** prompt חתום בעברית שדוחה ניסיונות role-override + cap של 20,000 תווים.
**עדות:** commit `e2dc8d1`, `supabase/functions/matot-report/index.ts`.
**ממצא Audit שתואם:** מצוין כ"דפוס טוב לשמר" ב-B2.

### A4. (היסטורי — לא ספור ב-35) שגיאות DB ב-`markForReview`
**Phase 0 הוסיף:** בדיקת `error` על שתי כתיבות (`spaced_repetition` ו-`answer_history`) + הצגת toast למשתמש.
**עדות:** commit `c270a3e`, `src/contexts/AppContext.tsx:548-580`.
**הערה:** זה היה ה**באג המקורי** שהפעיל את כל הביקורת. Phase 0 תיקן אותו במקום אחד — ויפה. אבל לא הוכלל ל-6 פונקציות אחות.

### A5. (היסטורי — לא ספור ב-35) שגיאות DB ב-`saveSessionToDb`
**Phase 0 הוסיף:** בדיקת `error` על upsert ל-`saved_sessions`.
**עדות:** commit `c270a3e`, `src/contexts/AppContext.tsx:889-905`.

---

## ⚠️ תוקן חלקית — הניסיון נכון, אבל הפיתרון אינרטי

### P1. Audit #01 — `handleSubmitSimulation` עוטף אבל לא תופס שגיאות
**Phase 0 ניסה:** הוסיף `Promise.allSettled` סביב כל קריאות `updateSpacedRepetition` ב-`handleSubmitSimulation`, וכן toast אם `failed > 0`.
**עדות:** commit `c270a3e`, `src/components/views/SessionView.tsx:408-435`.

**הבעיה הקריטית שנשארה:**
1. **`updateSpacedRepetition` לא זורקת `throw`** (ראה P2 למטה). כלומר — גם אם ה-DB נופל, הפונקציה הפנימית רק מציגה toast ומחזירה `undefined` כרגיל. `Promise.allSettled` תמיד יראה `status: 'fulfilled'`. הספירה `failed` תמיד שווה 0.
2. **`clearSavedSession()` ו-`navigate("results")` רצים ללא תנאי** — גם אם כל ה-15 שאלות בסשן לא נשמרו ב-DB, המשתמש יועבר למסך תוצאות והסשן יימחק מ-localStorage. **אובדן נתונים אפשרי.**

**מה צריך לקרות בפועל:** או ש-`updateSpacedRepetition` תזרוק `throw` במקום toast, או ש-`handleSubmitSimulation` יבדוק ידנית את התוצאות ויעצור לפני `clearSavedSession`.

### P2. Audit #08 — `updateSpacedRepetition` יש לה error handling פנימי אבל לא propagation
**Phase 0 ניסה:** הוסיף בדיקת `error` ו-toast.
**עדות:** `src/contexts/AppContext.tsx:460-518`.

```typescript
const { error } = await supabase.from('spaced_repetition').upsert({...});
if (error) {
  console.error('spaced_repetition upsert error:', error);
  toast.error('שגיאה בשמירת נתוני חזרה מרווחת');  // ← רק toast, לא throw
} else {
  setConfidenceMap(prev => ({ ...prev, [questionId]: confidence }));
}
```

**הבעיה שנשארה:** הפונקציה לא מחזירה `Promise.reject` ולא זורקת. Caller שעוטף ב-`Promise.allSettled` (כמו ב-P1) **לא יכול** לתפוס את הכישלון. זה הופך את כל ה-`allSettled` ב-`handleSubmitSimulation` למת.

---

## ❌ לא נגעו בהם — ה-Audit עדיין רלוונטי במלואו

### 🔴 דפוס "fire-and-forget" בכל הפונקציות הבאות (6 ממצאים אדומים — Audit #02-#07)

**כל הקריאות הבאות ב-`AppContext.tsx:587-667` עדיין באותה תקלה בדיוק כמו `markForReview` המקורי:**

```typescript
// דוגמה — toggleFavorite
supabase.from('user_favorites').insert({...}).then();  // אין catch, אין error check
```

| # | פונקציה | מיקום | מה נשמר ב-DB |
|---|---------|-------|---------------|
| #02 | `toggleFavorite` | `AppContext.tsx:587` | מועדפים |
| #03 | `saveNote` | `AppContext.tsx:614` | הערות אישיות |
| #04 | `deleteNote` | `AppContext.tsx:631` | מחיקת הערות |
| #05 | `setRating` | `AppContext.tsx:640` | דירוגים |
| #06 | `addTag` | `AppContext.tsx:651` | תגיות מותאמות |
| #07 | `removeTag` | `AppContext.tsx:660` | הסרת תגיות |

**Phase 0 לא נגע באף אחת מאלה.** אם ה-DB נופל בזמן שמירה — המשתמש יראה ב-UI שזה נשמר, אבל בפועל הנתונים אבודים.

### 🟠 Edge Functions — הרבה מעבר להרשאות

| # | בעיה | פונקציה | סטטוס |
|---|------|---------|--------|
| #09 | אין `AbortController` (timeout) על קריאות חיצוניות | `matot-report`, `ai-summary`, `daily-csv-export`, `sync-questions` | לא נגעו |
| #10 | `sync-questions` — שאילתת `editedRows` משליכה את `error` (סיכון אובדן עריכות ידניות!) | `sync-questions/index.ts` | לא נגעו |
| #11 | תגובת Resend לא נבדקת — מייל יכול להיכשל בשקט | `daily-csv-export` | לא נגעו |
| #12 | XSS ב-HTML של מייל — `topic` ו-`chapter` לא בורחים | `weekly-report` | לא נגעו |
| #13 | `hashId` עם hash לא קריפטוגרפי — סיכון collisions ב-500+ שאלות | `sync-questions` | לא נגעו |
| #14 | שגיאות DB משולכות בשקט (שאילתות `answer_history`/`questions`) | `ai-summary` | לא נגעו |

### 🟠 הגדרות Supabase

| # | בעיה | סטטוס |
|---|------|--------|
| #15 | HaveIBeenPwned (בדיקת סיסמאות שדלפו) — **כבוי** | לא נגעו |
| #16 | bucket `question-images` — listing פתוח לציבור | לא נגעו |
| #17 | הפרת Rules of Hooks ב-RoadmapView | לא נגעו |

### 🟡 ממצאי בינוני (#18-#28)
**אף אחד לא טופל ב-Phase 0:**
- TypeScript ב-`strict: false` (היה ועודנו)
- `types.ts` לא סנכרון אחרי מיגרציות אחרונות (חסרים `interval_days`, `easiness_factor`)
- 30 פוליסות `multiple_permissive_policies` ב-RLS (ביצועים)
- 5 פונקציות SQL עם `search_path` שאינו פיניק (`is_admin` בכלל)
- שימוש ב-`service_role` ב-`ai-summary` לקריאת נתונים של המשתמש עצמו (RLS bypass מיותר)
- 37 `auth_rls_initplan` warnings (כפל קריאות `auth.uid()`)
- 10 Foreign Keys ללא אינדקסים
- 5 אינדקסים שלא בשימוש בכלל
- חוסר עקביות בדפוס בדיקת אדמין (חלק דרך `is_admin` RPC, חלק דרך query ל-`admin_users`)
- אין rate limiting על Edge Functions שעולות כסף (Anthropic)
- שגיאות מ-Anthropic SDK מוחזרות ל-client (`matot-report`, `admin-manage-users`)

### 🟢 ממצאי נמוכים (#29-#35)
**אף אחד לא טופל ב-Phase 0:**
- 45 קבצים לא בשימוש (knip)
- 24 חבילות npm לא בשימוש (depcheck)
- 39 exports שאינם בשימוש
- 22 types שאינם בשימוש
- שאריות `@lovable.dev/cloud-auth-js` ממחסנית ישנה
- `console.log` debug ב-`sync-questions` שורות 93, 105, 164, 179
- export כפול ב-`SrsDashboardView` (named ב-22 + default ב-200)
- קבועים מתים: `SHEET_URL`, `LS_KEY` ב-`src/lib/types.ts`

---

## טבלת סיכום

| קטגוריה | תוקן ב-Phase 0 | תוקן חלקית | לא נגעו | סה"כ |
|---------|---------------|-------------|---------|------|
| 🔴 Critical (fire-and-forget) | 0 | 2 (#01, #08) | 6 (#02-#07) | 8 |
| 🟠 High | 3 (Edge auth + jailbreak) | 0 | 6 (#09-#14) + 3 (#15-#17) | 9 |
| 🟡 Medium | 0 | 0 | 11 | 11 |
| 🟢 Low | 0 | 0 | 7 | 7 |
| **סה"כ** | **3** | **2** | **30** | **35** |

---

## המלצה — איך לבנות תוכנית תיקון ממוקדת

על סמך הניתוח לעיל, אני מציע לבנות תוכנית בת **3 שלבים קטנים** (לא Phase כבד כמו binary-swimming-toucan):

### שלב Q1 — סגירת דפוס ה-fire-and-forget (8 ממצאים אדומים)
**גודל:** קטן. כל הפונקציות הן 5-15 שורות, אותו דפוס בדיוק.
**תוצאה:** אפס fire-and-forget בכל ה-codebase. סוגר 6 ממצאים נוספים מאותה משפחה כמו ה-SRS.
**גישה מומלצת:**
1. הפיכת `updateSpacedRepetition` ל-`throw` במקום toast.
2. תיקון `handleSubmitSimulation` כך ש-`failed > 0` באמת יעצור `clearSavedSession`/`navigate`.
3. החלפת כל 6 ה-`.then()` ל-`async/await + try/catch` עם toast.

### שלב Q2 — Edge Functions: timeouts + silent failures (6 ממצאים)
**גודל:** בינוני. ארבע פונקציות, אותו pattern של `AbortController`.
**תוצאה:** סוף לבעיית 524 שתועדה בעבר. סוף לסיכון אובדן עריכות ידניות ב-`sync-questions`.

### שלב Q3 — הגדרות Supabase (3 ממצאים, מהירים מאוד)
**גודל:** קטן מאוד. כולם 1-3 קליקים ב-Dashboard או SQL מיגרציה אחת.
1. Enable HaveIBeenPwned (קליק).
2. Disable LIST על `question-images` bucket (קליק).
3. Pin `search_path` על `is_admin` (מיגרציה SQL קצרה).

**אחרי 3 השלבים האלה:** סוגרים 17 מתוך 35 ממצאים, כולל **כל** האדומים. ה-🟡/🟢 הופכים ל-tech debt רגיל שאפשר לטפל בו לאט.

---

**הערה לסיום:** Phase 0 לא נכשל — הוא פשוט לא היה מספיק רחב. הוא תיקן את הבאג שגילינו (markForReview/saveSessionToDb) ואת ההרשאות. את הדפוס הסיסטמי (fire-and-forget) הוא לא הכליל. תוכנית Q1 לעיל היא בעצם "להמשיך את העבודה ש-Phase 0 התחיל" — לא תוכנית חדשה.
