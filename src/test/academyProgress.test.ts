import { describe, it, expect } from "vitest";
import {
  AttemptLike,
  QuestionResolver,
  cohortStrength,
  domainTrend,
  heatmap,
  personalTrend,
  tallyByDomain,
} from "@/lib/academyProgress";

// ch 12 = פיזיולוגיה, ch 20 = פרמקולוגיה, ch 999 = outside the bank map
const BANK: Record<string, { chapter: number | null; correct: string }> = {
  phys1: { chapter: 12, correct: "A" },
  phys2: { chapter: 12, correct: "B" },
  pharm1: { chapter: 20, correct: "C" },
};
const resolve: QuestionResolver = (id) => BANK[id];

const attempt = (over: Partial<AttemptLike>): AttemptLike => ({
  quiz_id: "q1",
  user_id: "u1",
  question_ids: [],
  answers: [],
  score: 0,
  total: 0,
  ...over,
});

const QUIZZES = [
  { id: "q2", title: "בוחן 2", opens_at: "2026-09-08T06:00:00Z" },
  { id: "q1", title: "בוחן 1", opens_at: "2026-09-01T06:00:00Z" },
];

describe("tallyByDomain", () => {
  it("counts only answered questions and grades against the current bank", () => {
    const t = tallyByDomain(
      [
        attempt({
          question_ids: ["phys1", "phys2", "pharm1"],
          answers: ["A", "D", null],
        }),
      ],
      resolve,
    );
    expect(t.get("פיזיולוגיה")).toEqual({ answered: 2, correct: 1 });
    expect(t.get("פרמקולוגיה")).toBeUndefined(); // unanswered -> not counted
  });

  it("survives an answers array shorter or longer than question_ids (DB does not enforce equal length)", () => {
    const short = tallyByDomain([attempt({ question_ids: ["phys1", "phys2"], answers: ["A"] })], resolve);
    expect(short.get("פיזיולוגיה")).toEqual({ answered: 1, correct: 1 }); // missing slot = unanswered

    const long = tallyByDomain([attempt({ question_ids: ["phys1"], answers: ["A", "B", "C"] })], resolve);
    expect(long.get("פיזיולוגיה")).toEqual({ answered: 1, correct: 1 }); // extra answers ignored
  });

  it("files questions missing from the bank under לא מסווג and never credits them", () => {
    const t = tallyByDomain(
      [attempt({ question_ids: ["ghost"], answers: ["A"] })],
      resolve,
    );
    expect(t.get("לא מסווג")).toEqual({ answered: 1, correct: 0 });
  });
});

describe("personalTrend", () => {
  it("orders quizzes chronologically and compares the member to the cohort average", () => {
    const attempts = [
      attempt({ quiz_id: "q1", user_id: "u1", score: 5, total: 10 }),
      attempt({ quiz_id: "q1", user_id: "u2", score: 9, total: 10 }),
      attempt({ quiz_id: "q2", user_id: "u2", score: 6, total: 10 }),
    ];
    expect(personalTrend(QUIZZES, attempts, "u1")).toEqual([
      { quiz: "בוחן 1", mine: 50, cohort: 70 },
      { quiz: "בוחן 2", mine: null, cohort: 60 }, // did not sit quiz 2
    ]);
  });

  it("distinguishes a real 0%% submission from never having sat the quiz", () => {
    const attempts = [attempt({ quiz_id: "q1", user_id: "u1", score: 0, total: 10 })];
    expect(personalTrend(QUIZZES, attempts, "u1")).toEqual([
      { quiz: "בוחן 1", mine: 0, cohort: 0 }, // sat it, scored nothing
      { quiz: "בוחן 2", mine: null, cohort: null }, // never sat it
    ]);
  });

  it("reports null rather than 0 for a quiz nobody sat", () => {
    expect(personalTrend(QUIZZES, [], "u1")).toEqual([
      { quiz: "בוחן 1", mine: null, cohort: null },
      { quiz: "בוחן 2", mine: null, cohort: null },
    ]);
  });
});

describe("domainTrend", () => {
  it("returns only domains the member actually answered", () => {
    const { domains, points } = domainTrend(
      QUIZZES,
      [
        attempt({
          quiz_id: "q1",
          question_ids: ["phys1", "phys2"],
          answers: ["A", "B"],
        }),
      ],
      "u1",
      resolve,
    );
    expect(domains).toEqual(["פיזיולוגיה"]);
    expect(points).toEqual([
      { quiz: "בוחן 1", פיזיולוגיה: 100 },
      { quiz: "בוחן 2", פיזיולוגיה: null },
    ]);
  });
});

describe("heatmap", () => {
  it("keeps unregistered members as empty rows and drops untouched domains", () => {
    const { domains, rows } = heatmap(
      [
        { id: "m1", label: "דנה", userId: "u1" },
        { id: "m2", label: "טרם נרשם", userId: null },
      ],
      [
        attempt({
          user_id: "u1",
          question_ids: ["phys1", "phys2"],
          answers: ["A", "X"],
        }),
      ],
      resolve,
    );
    expect(domains).toEqual(["פיזיולוגיה"]);
    expect(rows[0].cells[0]).toEqual({
      domain: "פיזיולוגיה",
      pct: 50,
      answered: 2,
    });
    expect(rows[1].cells[0]).toEqual({
      domain: "פיזיולוגיה",
      pct: null,
      answered: 0,
    });
  });
});

describe("cohortStrength", () => {
  it("sorts the weakest domain first", () => {
    const rows = cohortStrength(
      [
        attempt({
          user_id: "u1",
          question_ids: ["phys1", "pharm1"],
          answers: ["A", "X"],
        }),
        attempt({
          user_id: "u2",
          question_ids: ["phys1", "pharm1"],
          answers: ["A", "X"],
        }),
      ],
      resolve,
    );
    expect(rows.map((r) => [r.domain, r.pct])).toEqual([
      ["פרמקולוגיה", 0],
      ["פיזיולוגיה", 100],
    ]);
  });
});
