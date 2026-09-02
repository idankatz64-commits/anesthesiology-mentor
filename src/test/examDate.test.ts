import { describe, it, expect } from "vitest";
import { nextExamDate, daysUntilExam, examProximityFactor, getExamProximityPhase } from "@/lib/smartSelection";

// באג 2.9: EXAM_DATE היה תאריך קבוע (16.6.2026) שחלף. התוצאה — getExamProximityPhase
// החזירה 'early' (נכון) בעוד גורם קרבת-המבחן חישב 1 − (−78/60) ונחתך ל-1.00 (שגוי),
// כלומר שני חצאי אותו מנגנון סתרו זה את זה בפרודקשן. התאריך מתגלגל עכשיו לבד.

describe("מועד שלב א׳ מתגלגל", () => {
  it("לעולם אינו בעבר", () => {
    for (const iso of ["2026-09-02", "2027-06-15", "2027-06-17", "2030-01-01"]) {
      const now = new Date(`${iso}T09:00:00`);
      expect(nextExamDate(now).getTime()).toBeGreaterThanOrEqual(now.getTime() - 86400000);
    }
  });

  it("מ-2.9.2026 המועד הבא הוא יוני 2027", () => {
    const d = nextExamDate(new Date("2026-09-02T09:00:00"));
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(5); // יוני
    expect(d.getDate()).toBe(16);
  });

  it("ביום שלפני המועד — עדיין אותה שנה", () => {
    expect(nextExamDate(new Date("2027-06-15T09:00:00")).getFullYear()).toBe(2027);
  });

  it("ביום שאחרי — מתגלגל לשנה הבאה", () => {
    expect(nextExamDate(new Date("2027-06-17T09:00:00")).getFullYear()).toBe(2028);
  });
});

describe("גורם קרבת המבחן", () => {
  it("אפס כשהמבחן רחוק מ-60 יום", () => {
    expect(examProximityFactor(new Date("2026-09-02T09:00:00"))).toBe(0);
  });

  it("עולה ככל שמתקרבים, ולעולם אינו חורג מ-1", () => {
    const far = examProximityFactor(new Date("2027-05-10T09:00:00")); // ~37 יום
    const near = examProximityFactor(new Date("2027-06-10T09:00:00")); // ~6 ימים
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
  });

  it("אינו נתקע על 1 אחרי שהמועד חולף — זה היה הבאג", () => {
    // יום אחרי המבחן המנגנון מתאפס, כי המועד התגלגל לשנה הבאה
    expect(examProximityFactor(new Date("2027-06-17T09:00:00"))).toBe(0);
  });
});

describe("שלב הקרבה והמשקלים תואמים לגורם", () => {
  it("רחוק מהמבחן — early וגורם 0, בלי סתירה", () => {
    const now = new Date("2026-09-02T09:00:00");
    expect(getExamProximityPhase(now)).toBe("early");
    expect(examProximityFactor(now)).toBe(0);
  });

  it("בתוך 90 יום — approaching", () => {
    expect(getExamProximityPhase(new Date("2027-04-01T09:00:00"))).toBe("approaching");
  });

  it("בתוך 30 יום — imminent, והגורם חיובי", () => {
    const now = new Date("2027-06-01T09:00:00");
    expect(getExamProximityPhase(now)).toBe("imminent");
    expect(examProximityFactor(now)).toBeGreaterThan(0);
  });

  it("daysUntilExam לעולם אינו שלילי", () => {
    for (const iso of ["2026-09-02", "2027-06-17", "2028-02-29"]) {
      expect(daysUntilExam(new Date(`${iso}T09:00:00`))).toBeGreaterThanOrEqual(0);
    }
  });
});
