import { beforeEach, describe, expect, it } from "vitest";
import { readLastSession, writeLastSession } from "@/lib/lastSessionStore";

// QA 2026-09-08: a brand-new learner with an empty cloud history was shown an
// old DEMO session on Home, because the card lived under one unscoped
// localStorage key shared by every identity in the browser profile. Records are
// owner-stamped now; a record whose owner is not the reader is not displayed,
// not deleted and not re-attributed.

const KEY = "last_session_results";
const result = { score: 1, total: 2, pct: 50, mode: "exam", topics: ["נושא"], timestamp: 1_757_000_000_000 };
const raw = () => localStorage.getItem(KEY);

describe("last-session card is scoped to the authenticated identity", () => {
  beforeEach(() => localStorage.clear());

  it("shows a record back to the account that wrote it", () => {
    writeLastSession("user-a", result);
    expect(readLastSession("user-a")).toMatchObject(result);
  });

  it("never shows one account the record of another, and leaves it in place", () => {
    writeLastSession("user-a", result);
    const stored = raw();
    expect(readLastSession("user-b")).toBeNull();
    expect(raw()).toBe(stored); // not deleted, not migrated to user-b
  });

  it("does not adopt an unowned record — the demo/legacy case that was reported", () => {
    localStorage.setItem(KEY, JSON.stringify({ ...result, topics: ["נושא הדגמה"] })); // no userId
    expect(readLastSession("user-a")).toBeNull();
    expect(raw()).not.toBeNull();
  });

  it("shows nothing while signed out, whoever wrote the record", () => {
    writeLastSession("user-a", result);
    expect(readLastSession(null)).toBeNull();
    expect(readLastSession(undefined)).toBeNull();
  });

  it("a signed-out or demo run writes an unowned record that no account will claim", () => {
    writeLastSession(null, result);
    expect(JSON.parse(raw()!).userId).toBeNull();
    expect(readLastSession("user-a")).toBeNull();
  });

  it("rejects an owned record whose shape is wrong — HomeView maps topics and would crash", () => {
    for (const bad of [
      { ...result, topics: undefined },
      { ...result, topics: "נושא" },
      { ...result, topics: [1, 2] },
      { ...result, timestamp: "yesterday" },
      { ...result, score: null },
      { ...result, pct: "50%" },
    ]) {
      localStorage.setItem(KEY, JSON.stringify({ ...bad, userId: "user-a" }));
      expect(readLastSession("user-a")).toBeNull();
      expect(raw()).not.toBeNull(); // malformed is still not ours to delete
    }
  });

  it("survives a corrupt record without breaking Home", () => {
    localStorage.setItem(KEY, "{not json");
    expect(readLastSession("user-a")).toBeNull();
  });
});
