import { describe, expect, it } from "vitest";
import { buildSessionReportHtml, formatActiveDuration } from "@/lib/exportPdf";
import { launchQuestion } from "./fixtures/launchQuestion";

// QA 2026-09-08: a real 54-second exam printed "זמן פעיל: 0 דק׳" in the PDF —
// Math.floor(ms / 60000) erases every sub-minute session. Display only; the
// stored millisecond value is never rounded or rewritten.

const html = (totalActiveMs: number | null) =>
  buildSessionReportHtml({
    score: 1,
    pct: 50,
    mode: "exam",
    totalActiveMs,
    details: [{ q: launchQuestion("1"), userAns: "A", correctAns: "A", isCorrect: true }],
  });

describe("active time in the printable report", () => {
  it("reports the observed 54-second attempt as seconds, not as zero minutes", () => {
    expect(formatActiveDuration(54_000)).toBe("54 שנ׳");
    const text = new DOMParser().parseFromString(html(54_000), "text/html").body.textContent!;
    expect(text).toContain("זמן פעיל: 54 שנ׳");
    expect(text).not.toContain("0 דק׳");
  });

  it("keeps minutes and hours human", () => {
    expect(formatActiveDuration(0)).toBe("0 שנ׳");
    expect(formatActiveDuration(59_400)).toBe("59 שנ׳"); // rounds seconds, never up to a minute it did not reach
    expect(formatActiveDuration(60_000)).toBe("1 דק׳");
    expect(formatActiveDuration(90_000)).toBe("1 דק׳ 30 שנ׳");
    expect(formatActiveDuration(3_600_000)).toBe("1 שע׳");
    expect(formatActiveDuration(3_725_000)).toBe("1 שע׳ 2 דק׳"); // seconds are noise past an hour
  });

  it("never prints a negative duration, and omits the line when no time was recorded", () => {
    expect(formatActiveDuration(-5_000)).toBe("0 שנ׳");
    expect(new DOMParser().parseFromString(html(null), "text/html").body.textContent).not.toContain("זמן פעיל");
  });
});
