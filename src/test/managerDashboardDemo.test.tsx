import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { _resetDemoCache } from "@/lib/demoMode";
import { _resetCohort } from "@/lib/demoCohort";

// ה-supabase client לא אמור להיקרא בכלל כשהדמו דולק. אם מסך כלשהו בכל זאת
// יפנה אליו, המוק הזה יזרוק והבדיקה תיפול — זו בדיוק הרגרסיה שאנחנו שומרים מפניה.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => {
      throw new Error("demo mode must not hit the database");
    },
    from: () => {
      throw new Error("demo mode must not hit the database");
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ResponsiveContainer מודד 0x0 ב-jsdom ואז recharts לא מצייר; רוחב קבוע מאפשר רינדור
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <actual.ResponsiveContainer width={600} height={240}>
        {children as React.ReactElement}
      </actual.ResponsiveContainer>
    ),
  };
});

import ManagerDashboardTab from "@/components/admin/ManagerDashboardTab";

describe("דשבורד מנהל במצב דמו", () => {
  beforeEach(() => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    _resetCohort();
  });

  it("נטען מנתונים סינתטיים בלי לפנות ל-DB, ומציג 33 מתמחים", async () => {
    render(<ManagerDashboardTab />);
    await waitFor(() => expect(screen.getByText("דשבורד מנהל — סקירת מחזור")).toBeInTheDocument());

    // 33 שורות מתמחים בטבלה (בלי שורת הכותרת)
    const rows = document.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(33);
  });

  it("מציג את כל אוצר-המילים של הסטטוסים — כולל 'לא פעיל' החדש", async () => {
    render(<ManagerDashboardTab />);
    await waitFor(() => expect(screen.getByText("דשבורד מנהל — סקירת מחזור")).toBeInTheDocument());

    expect(screen.getAllByText("פעיל").length).toBeGreaterThan(0);
    expect(screen.getAllByText("לא פעיל").length).toBeGreaterThan(0);
  });

  it("מציג את אריח 'מה החזרה מוסיפה' עם רווח חיובי", async () => {
    render(<ManagerDashboardTab />);
    // הכיתוב מופיע פעמיים בכוונה: גם כאריח מדד וגם ככותרת הלוח
    await waitFor(() => expect(screen.getAllByText("מה החזרה מוסיפה").length).toBeGreaterThan(0));

    // הרמז מתחת לאריח הוא "X% → Y%" — Y חייב להיות גדול מ-X
    const hint = screen.getAllByText(/^\d+% → \d+%$/)[0];
    const [first, last] = hint.textContent!.match(/\d+/g)!.map(Number);
    expect(last).toBeGreaterThan(first);
  });

  it("מרנדר את לוחות הגרפים", async () => {
    render(<ManagerDashboardTab />);
    await waitFor(() => expect(screen.getByText("צורת המחזור")).toBeInTheDocument());
    expect(screen.getByText("מפת הפרקים של המחזור")).toBeInTheDocument();
    expect(screen.getByText("נפח תרגול לאורך זמן")).toBeInTheDocument();
  });
});

describe("עקביות נתוני הדמו", () => {
  beforeEach(() => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    _resetCohort();
  });

  it("דליי החזרה מחלקים את הכיסוי, לא מנפחים אותו", async () => {
    const { fetchRepetitionCurve, fetchOverview } = await import("@/lib/managerReport");
    const [curve, overview] = await Promise.all([fetchRepetitionCurve(null), fetchOverview()]);

    const bucketQuestions = curve.reduce((s, r) => s + r.questions, 0);
    const coverage = overview.reduce((s, r) => s + r.coverage, 0);
    // חמשת הדליים הם חלוקה של אותן שאלות שנראו — סכומם חייב להיות הכיסוי עצמו
    expect(Math.abs(bucketQuestions - coverage) / coverage).toBeLessThan(0.02);
  });

  it("הדיוק המשוקלל של הדליים תואם את דיוק המחזור", async () => {
    const { fetchRepetitionCurve, fetchOverview, accuracyPct } = await import("@/lib/managerReport");
    const [curve, overview] = await Promise.all([fetchRepetitionCurve(null), fetchOverview()]);

    const cohortAcc = accuracyPct(
      overview.reduce((s, r) => s + r.current_correct, 0),
      overview.reduce((s, r) => s + r.coverage, 0),
    )!;
    const bucketAcc = accuracyPct(
      curve.reduce((s, r) => s + r.correct, 0),
      curve.reduce((s, r) => s + r.questions, 0),
    )!;
    expect(Math.abs(bucketAcc - cohortAcc)).toBeLessThanOrEqual(2);
  });

  it("לכל 33 המתמחים יש שם אמיתי — אף אחד לא נופל ל'מתמחה N'", async () => {
    const { fetchOverview } = await import("@/lib/managerReport");
    const { maskName } = await import("@/lib/demoMode");
    const names = (await fetchOverview()).map((r) => maskName(r.display_name));
    expect(names).toHaveLength(33);
    expect(names.filter((n) => /^מתמחה \d+$/.test(n))).toHaveLength(0);
  });

  it("הערת מנהל לא נשלפת ולא נשמרת במצב דמו", async () => {
    const { fetchManagerNote, saveManagerNote } = await import("@/lib/managerReport");
    // ה-supabase המדומה זורק בכל פנייה, אז השער נבדק כאן ולא ברכיב
    await expect(fetchManagerNote("demo-01")).resolves.toBe("");
    await expect(saveManagerNote("demo-01", "טקסט")).resolves.toBeUndefined();
  });
});
