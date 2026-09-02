import { describe, it, expect } from "vitest";
import {
  seriesForRange,
  repetitionLift,
  residentStatus,
  type DailyRow,
  type RepetitionRow,
  type OverviewRow,
} from "@/lib/managerReport";

const NOW = new Date("2026-09-02T09:00:00+03:00");

const day = (d: string, user: string, answered: number, correct: number): DailyRow => ({
  day: d,
  user_id: user,
  answered,
  correct,
});

describe("seriesForRange", () => {
  const rows: DailyRow[] = [
    day("2026-09-02", "u1", 10, 8),
    day("2026-09-02", "u2", 4, 1),
    day("2026-09-01", "u1", 6, 3),
    day("2026-08-20", "u1", 20, 20),
  ];

  it("aggregates every resident when no user is given", () => {
    const out = seriesForRange(rows, 7, null, NOW);
    const today = out[out.length - 1];
    expect(today.day).toBe("2026-09-02");
    expect(today.answered).toBe(14); // 10 + 4
    expect(today.accuracy).toBe(64); // 9/14
  });

  it("filters to a single resident", () => {
    const out = seriesForRange(rows, 7, "u1", NOW);
    expect(out[out.length - 1].answered).toBe(10);
    expect(out[out.length - 1].accuracy).toBe(80);
  });

  it("fills quiet days so the time axis stays honest", () => {
    const out = seriesForRange(rows, 7, "u1", NOW);
    expect(out).toHaveLength(7);
    expect(out[0].day).toBe("2026-08-27");
    // a day with no answers is a real zero, and accuracy is unknown - not 0%
    const quiet = out.find((p) => p.day === "2026-08-28")!;
    expect(quiet.answered).toBe(0);
    expect(quiet.accuracy).toBeNull();
  });

  it("excludes days outside the window", () => {
    const out = seriesForRange(rows, 7, "u1", NOW);
    expect(out.some((p) => p.day === "2026-08-20")).toBe(false);
  });

  it("range 'all' starts at the first day that has data", () => {
    const out = seriesForRange(rows, "all", "u1", NOW);
    expect(out[0].day).toBe("2026-08-20");
    expect(out[out.length - 1].day).toBe("2026-09-02");
  });

  it("returns an empty series rather than throwing when there is no data", () => {
    expect(seriesForRange([], "all", null, NOW)).toEqual([]);
    expect(seriesForRange([], 30, null, NOW)).toHaveLength(30);
  });
});

describe("repetitionLift", () => {
  it("measures the gain from first exposure to the most-repeated bucket", () => {
    const rows: RepetitionRow[] = [
      { times_answered: 1, questions: 1813, correct: 1221 }, // 67.3%
      { times_answered: 2, questions: 873, correct: 690 }, // 79.0%
      { times_answered: 5, questions: 795, correct: 732 }, // 92.1%
    ];
    const out = repetitionLift(rows);
    expect(out.first).toBe(67);
    expect(out.last).toBe(92);
    expect(out.lift).toBe(25);
  });

  it("stays null when the first-exposure bucket is missing", () => {
    expect(repetitionLift([{ times_answered: 3, questions: 10, correct: 9 }]).lift).toBeNull();
    expect(repetitionLift([]).lift).toBeNull();
  });
});

describe("residentStatus - inactive is its own state", () => {
  const base: OverviewRow = {
    user_id: "u1",
    display_name: "דנה",
    residency_year: 2,
    is_academy_member: true,
    is_staff: false,
    answered_total: 500,
    coverage: 400,
    current_correct: 300,
    qs_last30: 100,
    correct_last30: 80,
    qs_prev30: 100,
    correct_prev30: 82,
    last_active: NOW.toISOString(),
  };
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

  it("calls a resident inactive past 30 quiet days", () => {
    expect(residentStatus({ ...base, last_active: daysAgo(45) }, NOW)).toBe("inactive");
  });

  it("keeps 'attention' for someone still practising but sliding", () => {
    const sliding = { ...base, correct_last30: 60, correct_prev30: 85, last_active: daysAgo(2) };
    expect(residentStatus(sliding, NOW)).toBe("attention");
  });

  it("does not label a merely quiet fortnight as inactive", () => {
    expect(residentStatus({ ...base, last_active: daysAgo(20) }, NOW)).toBe("attention");
  });

  it("leaves an engaged resident active", () => {
    expect(residentStatus(base, NOW)).toBe("active");
  });
});

describe("repetitionLift — רצפת מדגם", () => {
  it("מתעלם מדלי עליון דק, כדי שלא תיווצר כותרת ענקית משלוש שאלות", () => {
    const rows: RepetitionRow[] = [
      { times_answered: 1, questions: 1813, correct: 1221 }, // 67%
      { times_answered: 3, questions: 402, correct: 330 }, // 82%
      { times_answered: 5, questions: 3, correct: 3 }, // 100% על 3 שאלות — לא ראיה
    ];
    const out = repetitionLift(rows);
    expect(out.last).toBe(82);
    expect(out.lift).toBe(15);
  });

  it("מחזיר null כשאף דלי לא עובר את הרצפה", () => {
    expect(repetitionLift([{ times_answered: 1, questions: 4, correct: 4 }]).lift).toBeNull();
  });
});
