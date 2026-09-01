// demo-mode: הצגה בפני קהל בלי לחשוף שמות/מיילים אמיתיים (פסיקת עידן 1.9, לקראת 6.9).
// הפעלה: פתיחת האפליקציה עם ?demo — הדגל נשמר ל-session; כיבוי: סגירת הטאב.
// המיסוך דטרמיניסטי (אותו משתמש ← אותו כינוי לאורך כל המסכים) ותצוגתי בלבד — הנתונים לא משתנים.

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
];

let cached: boolean | null = null;

export function isDemo(): boolean {
  if (cached !== null) return cached;
  try {
    if (new URLSearchParams(window.location.search).has("demo")) {
      sessionStorage.setItem(DEMO_KEY, "1");
    }
    cached = sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    cached = false;
  }
  return cached;
}

/** לבדיקות בלבד — isDemo נשמר ב-cache כדי לא לקרוא sessionStorage בכל שורת טבלה */
export function _resetDemoCache(): void {
  cached = null;
}

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function maskName(real: string | null | undefined): string {
  const v = real ?? "";
  if (!isDemo() || !v) return v;
  const h = hashKey(v);
  const name = FAKE_NAMES[h % FAKE_NAMES.length];
  // ponytail: על >24 משתמשים ייתכן כינוי כפול לשם המשפחה — הסיומת המספרית מבדילה
  return `${name} ${(h % 89) + 10}`;
}

export function maskEmail(real: string | null | undefined): string {
  const v = real ?? "";
  if (!isDemo() || !v) return v;
  return `resident${(hashKey(v) % 89) + 10}@demo.local`;
}
