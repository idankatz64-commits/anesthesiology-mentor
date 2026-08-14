import { describe, it, expect } from "vitest";
import { resolveGate } from "@/lib/accessGate";

// The UI half of the 2026-08-14 access lockdown. The DB is the real boundary
// (RLS + is_approved); this decides what a visitor is allowed to SEE while
// that boundary does its work. The dangerous states are the in-between ones:
// anything that renders the app before we KNOW the visitor is approved is a
// content leak, even if the tables would return nothing.
describe("resolveGate", () => {
  it("shows nothing until the auth check has come back", () => {
    // The default on first paint. Must not fall through to the app.
    expect(resolveGate({ authResolved: false, userId: null, approved: null })).toBe("loading");
    expect(resolveGate({ authResolved: false, userId: "u1", approved: true })).toBe("loading");
  });

  it("sends a visitor with no account to the sign-in screen", () => {
    expect(resolveGate({ authResolved: true, userId: null, approved: null })).toBe("signin");
    expect(resolveGate({ authResolved: true, userId: null, approved: false })).toBe("signin");
  });

  it("keeps a logged-in user waiting while approval is still unknown", () => {
    // approved === null means the is_approved() round trip has not landed.
    // Rendering the app here is the "flash of full app" bug.
    expect(resolveGate({ authResolved: true, userId: "u1", approved: null })).toBe("loading");
  });

  it("shows the pending notice to a logged-in but unapproved user", () => {
    expect(resolveGate({ authResolved: true, userId: "u1", approved: false })).toBe("pending");
  });

  it("opens the app only for a logged-in, approved user", () => {
    expect(resolveGate({ authResolved: true, userId: "u1", approved: true })).toBe("app");
  });

  it("never returns 'app' unless approval is explicitly true", () => {
    // Guards against a future refactor turning `approved` truthy-ish.
    const states = [null, false] as const;
    for (const approved of states) {
      for (const authResolved of [true, false]) {
        for (const userId of [null, "u1"]) {
          expect(resolveGate({ authResolved, userId, approved })).not.toBe("app");
        }
      }
    }
  });
});
