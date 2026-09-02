// מחזור דמו סינתטי — פסיקת עידן 2.9: בדמו לא מציגים נתוני אמת בכלל.
//
// כל המספרים כאן מיוצרים, ואף שאילתה לא יוצאת ל-DB כשהדמו דולק. המחזור נגזר
// מזרע קבוע, כך שהמסך נראה זהה בכל טעינה — קריטי כשמציגים מול קהל.
//
// עיקרון: יש **מקור אמת אחד** (`cohort()`), וכל ארבע השליפות נגזרות ממנו.
// אחרת מספר בכרטיס עליון לא יסתדר עם סכום הטבלה שמתחתיו, ומי שיבדוק — יראה.

const BANK_SIZE = 4263;
const DAYS_BACK = 150;
const DAY_MS = 86400000;

/** 31 פרקי הליבה (מילר 10e) — שמות הפרקים אינם מידע אישי */
const CHAPTERS: [number, string][] = [
  [9, "Sleep Medicine"],
  [10, "Cerebral Physiology & Anesthetic Effects"],
  [11, "Neuromuscular Physiology and Pharmacology"],
  [12, "Respiratory Physiology and Pathophysiology"],
  [13, "Cardiac Physiology"],
  [14, "GI and Hepatic Physiology"],
  [15, "Renal Anatomy, Physiology, Pharmacology"],
  [16, "Basic Principles of Pharmacology"],
  [17, "Inhaled Anesthetics: Mechanisms"],
  [18, "Inhaled Anesthetic Uptake & Distribution"],
  [20, "Inhaled Anesthetic Delivery Systems"],
  [21, "Intravenous Anesthetics"],
  [22, "Opioids"],
  [24, "Neuromuscular Blocking Drugs & Reversal"],
  [25, "Local Anesthetics"],
  [28, "Preoperative Evaluation"],
  [29, "Anesthetic Implications of Concurrent Diseases"],
  [32, "Cardiovascular Monitoring"],
  [33, "Perioperative Echo & POCUS"],
  [37, "Respiratory Monitoring"],
  [40, "Airway Management in the Adult"],
  [41, "Spinal, Epidural, and Caudal Anesthesia"],
  [42, "Peripheral Nerve Blocks & Ultrasound Guidance"],
  [43, "Perioperative Fluid and Electrolyte Therapy"],
  [44, "Perioperative Acid-Base Balance"],
  [46, "Patient Blood Management: Coagulation"],
  [47, "Management of the Patient with Chronic Pain"],
  [49, "Anesthesia for Thoracic Surgery"],
  [50, "Anesthesia for Cardiac Surgical Procedures"],
  [53, "Anesthesia for Neurologic Surgery"],
  [58, "Anesthesia for Obstetrics"],
  [62, "Anesthesia for Trauma"],
  [72, "Pediatric Anesthesia"],
  [79, "Critical Care Anesthesiology"],
  [82, "ACLS"],
];

const NAMES = [
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
  "רותם אביב",
  "הדס שוורץ",
  "אלון מזרחי",
  "ליאת בן-דוד",
  "נמרוד קפלן",
  "אורי שמש",
  "גל אדרי",
  "יסמין חדד",
  "עידו פלד",
  "שני ויצמן",
  "אמיר דגן",
  "טל ניסים",
  "רעות אשכנזי",
  "בר יקותיאלי",
  "נגה שטרן",
  "דורון מלכה",
  "אביב חן",
  "מור סגל",
  "יהלי ברנע",
  "אסף רוט",
  "כרמל דואק",
  "רון לביא",
  "עדן פורת",
];

/** mulberry32 — מחולל פסאודו-אקראי דטרמיניסטי, כדי שהדמו יהיה זהה בכל טעינה */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoChapter {
  chapter: number;
  topic: string;
  seen: number;
  current_correct: number;
  answered_total: number;
  first_seen: number;
  first_correct: number;
}

export interface DemoResident {
  user_id: string;
  display_name: string;
  residency_year: number;
  chapters: DemoChapter[];
  daily: { day: string; answered: number; correct: number }[];
}

const dayString = (msFromToday: number) =>
  new Date(Date.now() - msFromToday).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

function buildResident(i: number): DemoResident {
  const r = rng(1000 + i * 7919);
  const pick = (lo: number, hi: number) => lo + r() * (hi - lo);

  // פרופיל המתמחה: כמה מהמאגר כיסה, ומה רמת הדיוק בחשיפה ראשונה
  const coverageShare = pick(0.04, 0.42);
  const firstAcc = pick(0.55, 0.82);
  const lift = pick(0.08, 0.2); // מה שהחזרה מוסיפה
  const currentAcc = Math.min(0.97, firstAcc + lift);

  // שלושה פרופילי פעילות, כדי שכל ארבעת הסטטוסים יופיעו על המסך בדמו
  const profile = i % 11 === 0 ? "inactive" : i % 7 === 0 ? "slipping" : "engaged";
  const quietSince = profile === "inactive" ? Math.floor(pick(34, 70)) : 0;
  const activeProb = profile === "engaged" ? pick(0.45, 0.8) : pick(0.15, 0.35);

  const totalSeen = Math.round(BANK_SIZE * coverageShare);

  // חלוקת הכיסוי בין הפרקים לפי משקל אקראי — לא אחיד, כמו למידה אמיתית
  const weights = CHAPTERS.map(() => pick(0.2, 1));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const chapters: DemoChapter[] = CHAPTERS.map(([chapter, topic], ci) => {
    const seen = Math.max(0, Math.round((totalSeen * weights[ci]) / weightSum));
    const chapterAcc = Math.max(0.35, Math.min(0.99, currentAcc + pick(-0.14, 0.14)));
    const chapterFirst = Math.max(0.3, chapterAcc - lift);
    const repeats = pick(1.2, 2.4);
    return {
      chapter,
      topic,
      seen,
      current_correct: Math.round(seen * chapterAcc),
      answered_total: Math.round(seen * repeats),
      first_seen: seen,
      first_correct: Math.round(seen * chapterFirst),
    };
  }).filter((c) => c.seen > 0);

  // סדרת הפעילות היומית — סופ"ש ישראלי חלש יותר, ופרופיל "לא פעיל" נדם בשלב מסוים
  const daily: { day: string; answered: number; correct: number }[] = [];
  for (let d = DAYS_BACK; d >= 0; d--) {
    if (d < quietSince) continue;
    const date = new Date(Date.now() - d * DAY_MS);
    const dow = date.getDay(); // 5=שישי, 6=שבת
    const weekendDamp = dow === 5 || dow === 6 ? 0.35 : 1;
    // מגמת התחזקות עדינה לאורך הזמן, ודעיכה למי שמחליק
    const ramp = profile === "slipping" ? 1.25 - (DAYS_BACK - d) / DAYS_BACK : 0.6 + (DAYS_BACK - d) / DAYS_BACK;
    if (r() > activeProb * weekendDamp * Math.max(0.2, ramp)) continue;
    const answered = Math.round(pick(6, 46));
    const dayAcc = Math.max(0.3, Math.min(0.99, currentAcc + pick(-0.12, 0.12)));
    daily.push({ day: dayString(d * DAY_MS), answered, correct: Math.round(answered * dayAcc) });
  }

  return {
    user_id: `demo-${String(i + 1).padStart(2, "0")}`,
    display_name: NAMES[i % NAMES.length],
    residency_year: 1 + (i % 5),
    chapters,
    daily,
  };
}

let cached: DemoResident[] | null = null;

/** מקור האמת היחיד של הדמו — נבנה פעם אחת ומשותף לכל השליפות */
export function cohort(): DemoResident[] {
  if (!cached) cached = Array.from({ length: 33 }, (_, i) => buildResident(i));
  return cached;
}

export const demoBankSize = () => BANK_SIZE;

/** לבדיקות בלבד */
export function _resetCohort(): void {
  cached = null;
}
