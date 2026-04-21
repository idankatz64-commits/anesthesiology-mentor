# פרומפט לחלון החדש — Debugging התוכנית (binary-swimming-toucan)

> **תאריך הכנה:** 2026-04-20 (לפני שינה)
> **מטרה:** לבצע debugging יסודי של התוכנית לפני שמתחילים Phase 1.

---

## 📋 העתק-הדבק את הטקסט הבא לחלון החדש:

```
שלום. אנחנו חוזרים לעבודה אחרי ש-Phase 0 של תוכנית binary-swimming-toucan הושלם ונדחף ל-GitHub אמש (commits c270a3e + e2dc8d1 על branch phase-0-code-review).

המשימה עכשיו: debugging יסודי של התוכנית עצמה לפני שמתחילים Phase 1.

שלב 1 — סריקה ובדיקה:
1. קרא את /Users/idankatz15/.claude/plans/binary-swimming-toucan.md במלואה
2. קרא את /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/NEXT-SESSION-PROMPT.md (הקובץ הזה, יש בו רשימת נקודות שכבר תפסתי בסריקה)
3. השווה את הקוד הנוכחי לתוכנית:
   - האם מה שהתוכנית מציינת כ"קיים" (קבצים, שורות, מבני DB) באמת קיים?
   - האם גדלי הקבצים עדיין נכונים (SessionView 1,433 שורות, AppContext 1,021 שורות)?
   - האם יש features חדשים שנוספו מאז 2026-04-19 ולא מופיעים בתוכנית?
4. זהה נקודות תורפה, באגים, טעויות, והזדמנויות שדרוג.

שלב 2 — דוח:
כתוב דוח מסודר (לא קוד — רק דוח טקסטואלי, בעברית פשוטה שמישהו ללא רקע טכני יבין) עם:
- נקודות תורפה קריטיות (חייבות להיתקן לפני ביצוע)
- שדרוגים מומלצים (לשקול, לא חובה)
- שאלות פתוחות שצריכות החלטה שלי
- **שלא תסכם את התוכנית — הסבר הוא המטרה. דמיין שאני רואה אותה בפעם הראשונה.**

שלב 3 — הצעת workflow:
המלץ על תהליך עבודה אופטימלי:
- האם להשתמש ב-/gsd:new-milestone או /gsd:plan-phase?
- כמה חלונות חדשים צפויים (phase per window, או ביחד)?
- מה הסדר האופטימלי, בהנחה שיש 8 שבועות עד המבחן?

שלב 4 — עצור לאישור:
אחרי שמסרת את הדוח + הצעת ה-workflow, עצור. אל תתחיל ביצוע. אני אקרא, אחליט, ונפתח חלון חדש לביצוע.

הנחיות נוספות:
- אני דובר עברית, אפס רקע קוד. כל הסבר חייב להיות פשוט.
- אם אתה מגלה משהו מסוכן או לא-ברור — עצור ושאל, אל תנחש.
- השתמש ב-TodoWrite כדי שאוכל לראות את ההתקדמות.
- אחרי שמסיים — אל תעשה git commit או שינויים, רק דוח.
```

---

## ✅ Checklist למחר בבוקר

- [ ] פתח חלון חדש של Claude Code ב-`/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/`
- [ ] העתק את הטקסט למעלה → הדבק → שלח
- [ ] המתן לדוח (צפוי 10-15 דקות של work)
- [ ] קרא את הדוח, עבור על השאלות הפתוחות
- [ ] קבל החלטות
- [ ] פתח חלון שלישי ל-Phase 1 עם הפרומפט המותאם שהדוח ימליץ עליו

---

## 📌 נקודות אדומות שכבר תפסתי בסריקה (2026-04-20 לילה):

1. **Phase 0 כבר הושלם** — התוכנית עדיין מתייחסת אליו כעתידי. לדלג.
2. **תאריך מבחן "16 ביוני 2026"** — hardcoded בתוכנית (שורה 152, 514). ב-CLAUDE.md רשום "target June 2026" בלבד. צריך לוודא עם המשתמש.
3. **Phase 1 + Phase 2a שניהם "שבועות 2-3"** — כותרות סותרות את עקרון ה-"ביצוע רציף" (שורה 20). ה-Timeline בתחתית נכון, אבל הטקסט מבלבל.
4. **Phase 2a — symlink ל-`reports/latest.html`** — שביר על Git/Vercel. עדיף file overwrite.
5. **Phase 2c — Python subprocess מ-Node tests** — שביר ב-CI. עדיף JSON fixtures.
6. **Phase 3a race condition** — "שתי הפונקציות כותבות לאותה שורה" (שורה 334) — מי מנצח? לא מוגדר.
7. **Phase 4a — `smartSelection.ts` coverage 0% → 80%** — קובץ אלגוריתם-קריטי עם 0% בדיקות הוא סיכון לפני/במהלך FSRS migration.
8. **GSD workflow partial** — התוכנית משתמשת ב-`gsd-executor` ב-2b+3 אבל לא ב-`/gsd:plan-phase` workflow. שקול לעבור לתהליך GSD מלא.
9. **`rules/common/hooks.md`** — דורש "never use dangerously-skip-permissions". צריך לוודא שאף phase לא מפעיל דבר כזה.
10. **סטטוס נוכחי של Repository** — branch `phase-0-code-review` עם 2 commits יותר מ-`origin/main`. Phase 1 יתחיל מהמקום הזה או מ-`main`? החלטה נדרשת.

---

## 🔗 הפניות נדרשות

- **תוכנית:** `/Users/idankatz15/.claude/plans/binary-swimming-toucan.md`
- **זיכרון:** `/Users/idankatz15/Documents/Obsidian Vault/_claude-memory/`
- **Branch נוכחי:** `phase-0-code-review` (יש למזג ל-main או להישאר עליו?)
- **Last commit:** `e2dc8d1 fix(edge-functions): harden auth, input caps, and matot-report system prompt`
