import { describe, it, expect } from "vitest";
import { aiDraftForTopic, SEED_QUEUE } from "@/lib/questionBank";

describe("aiDraftForTopic", () => {
  it("returns a complete canned vignette for a known topic", () => {
    const d = aiDraftForTopic("Neuromuscular Blockers");
    expect(d.question.length).toBeGreaterThan(0);
    expect([d.a, d.b, d.c, d.d].every((o) => o.length > 0)).toBe(true);
    expect(["a", "b", "c", "d"]).toContain(d.correct);
    expect(d.topic).toBe("Neuromuscular Blockers");
  });

  it("falls back to an editable template for an unknown topic, carrying topic + chapter", () => {
    const d = aiDraftForTopic("Made Up Topic", 99);
    expect(d.topic).toBe("Made Up Topic");
    expect(d.chapter).toBe(99);
    expect(d.question).toContain("Made Up Topic");
  });
});

describe("SEED_QUEUE", () => {
  it("seeds the review queue with valid statuses and answer keys", () => {
    expect(SEED_QUEUE.length).toBeGreaterThan(0);
    SEED_QUEUE.forEach((q) => {
      expect(["draft", "review", "approved"]).toContain(q.status);
      expect(["a", "b", "c", "d"]).toContain(q.correct);
      expect(q.question.length).toBeGreaterThan(0);
    });
  });
});
