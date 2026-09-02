// demo-mode: הצגה בפני קהל בלי לחשוף שמות/מיילים אמיתיים (פסיקת עידן 1.9, לקראת 6.9).
// הפעלה: פתיחת האפליקציה עם ?demo — הדגל נלכד בעליית האפליקציה (main.tsx) ונשמר ל-session;
// כיבוי: סגירת הטאב. המיסוך תצוגתי בלבד — הנתונים לא משתנים.

const DEMO_KEY = "ysnp-demo";

const FAKE_NAMES = [
  "דנה לוי",
  "יואב כהן",
  "נועה פרידמן",
  "איתי ברק",
  "שירה אלון",
  "עומר שדה",
  "תמר גולן",
  "אריאל נבון",
  "מאיה רוזן",
  "יונתן טל",
  "ליאור אשכנזי",
  "הילה שרון",
  "אלעד ברוך",
  "רוני שגב",
  "עדי מור",
  "גיא לביא",
  "נטע הראל",
  "אסף דורון",
  "מיכל עוז",
  "אורי ניר",
  "יעל אמיר",
  "דור קדם",
  "אביגיל שני",
  "נדב עברי",
  // מ-2.9: מחזור הדמו מונה 33 מתמחים; רשימה קצרה מזה החזירה "מתמחה 25" ומעלה
  "כרמל דואק",
  "רון לביא",
  "עדן פורת",
  "שקד ברנע",
  "אלמוג ריכטר",
  "טליה ורדי",
  "אופיר חזן",
  "נועם בלס",
  "רוני אלימלך",
  "מיטל צור",
  "יובל אשד",
  "דניאל קרן",
];

let cached: boolean | null = null;

/** נקרא eager מ-main.tsx כדי שה-?demo ייקלט לפני שהראוטר מוחק את ה-query */
export function isDemo(): boolean {
  if (cached !== null) return cached;
  let on = false;
  try {
    on = new URLSearchParams(window.location.search).has("demo");
  } catch {
    /* no window (tests/SSR) */
  }
  try {
    if (on) sessionStorage.setItem(DEMO_KEY, "1");
    on = on || sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    /* storage blocked — הדגל מה-URL עדיין מכובד בזיכרון */
  }
  cached = on;
  return on;
}

/** לבדיקות בלבד */
export function _resetDemoCache(): void {
  cached = null;
  aliasIndex.clear();
}

// כינוי פר-מפתח, ייחודי מובטח (בלי התנגשויות hash): המפתח הראשון שנראה מקבל את השם הראשון וכו'.
// אותו מפתח ← אותו כינוי לכל אורך ה-session, בכל המסכים.
const aliasIndex = new Map<string, number>();

function indexFor(key: string): number {
  let i = aliasIndex.get(key);
  if (i === undefined) {
    i = aliasIndex.size;
    aliasIndex.set(key, i);
  }
  return i;
}

export function maskName(real: string | null | undefined): string {
  const v = real ?? "";
  if (!isDemo() || !v) return v;
  const i = indexFor(v);
  return i < FAKE_NAMES.length ? FAKE_NAMES[i] : `מתמחה ${i + 1}`;
}

export function maskEmail(real: string | null | undefined): string {
  const v = real ?? "";
  if (!isDemo() || !v) return v;
  return `resident${indexFor(v) + 1}@demo.local`;
}
