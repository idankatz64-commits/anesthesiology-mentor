import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { resolveGate } from "@/lib/accessGate";

// A resident is added to the roster while already signed up. On the next load
// claim_academy_membership() links academy_members.user_id — and that row is one
// of the things is_approved() reads. The two run in the same hydration, so the
// gate could answer on pre-claim state and strand a linked member on the
// "waiting for approval" screen until a second reload (observed in QA
// 2026-09-08). Real provider; only the Supabase client, the bank fetch and the
// academy repository are mocked.

const db = vi.hoisted(() => ({
  session: { user: { id: "user-a" } } as unknown,
  callback: null as null | ((event: string, session: unknown) => void),
  approvalAnswers: [] as boolean[],
  approvalCalls: 0,
  claim: (async () => null) as () => Promise<unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: db.session } }),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        db.callback = callback;
        queueMicrotask(() => callback("INITIAL_SESSION", db.session));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: (name: string) => {
      if (name !== "is_approved") return Promise.resolve({ data: null, error: null });
      const answer = db.approvalAnswers[Math.min(db.approvalCalls, db.approvalAnswers.length - 1)] ?? false;
      db.approvalCalls++;
      return Promise.resolve({ data: answer, error: null });
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        lte: () => query,
        order: () => query,
        limit: () => query,
        range: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
        upsert: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
      };
      return query;
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/lib/csvService", () => ({
  fetchQuestions: vi.fn(async () => []),
  invalidateQuestionsCache: vi.fn(),
  setQuestionsCacheScope: vi.fn(() => false),
}));
vi.mock("@/lib/academyRepository", () => ({
  claimAcademyMembership: () => db.claim(),
  fetchMyAttempts: async () => [],
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));

const membership = { access_level: "full", status: "active" };

let latest: ReturnType<typeof useApp>;
function Probe() {
  latest = useApp();
  return <p>{resolveGate({ authResolved: latest.authResolved, userId: latest.userId, approved: latest.approved })}</p>;
}
const mount = async () => {
  await act(async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
  });
};

describe("membership claim vs the approval gate", () => {
  beforeEach(() => {
    db.session = { user: { id: "user-a" } };
    db.approvalAnswers = [true];
    db.approvalCalls = 0;
    db.claim = async () => null;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens the app on the FIRST load when the claim links the roster row after the gate already asked", async () => {
    // is_approved() answers "no" to the check that raced the claim, "yes" after it.
    db.approvalAnswers = [false, true];
    db.claim = async () => membership;
    await mount();
    await waitFor(() => expect(latest.approved).toBe(true));
    expect(db.approvalCalls).toBe(2);
    expect(latest.academyMember).toEqual(membership);
    // The user must never have been shown the pending screen in between.
    expect(resolveGate({ authResolved: latest.authResolved, userId: latest.userId, approved: latest.approved })).toBe(
      "app",
    );
  });

  it("asks once and stays out when the claim links nothing", async () => {
    db.approvalAnswers = [false];
    db.claim = async () => null;
    await mount();
    await waitFor(() => expect(latest.approved).toBe(false));
    expect(db.approvalCalls).toBe(1);
    expect(resolveGate({ authResolved: latest.authResolved, userId: latest.userId, approved: latest.approved })).toBe(
      "pending",
    );
  });

  it("does not re-ask when the first answer is already yes", async () => {
    db.approvalAnswers = [true];
    db.claim = async () => membership;
    await mount();
    await waitFor(() => expect(latest.approved).toBe(true));
    expect(db.approvalCalls).toBe(1);
  });

  it('a failing claim leaves the gate closed instead of hanging on "loading"', async () => {
    db.approvalAnswers = [false];
    db.claim = async () => {
      throw new Error("claim unavailable");
    };
    await mount();
    await waitFor(() => expect(latest.approved).toBe(false));
    expect(db.approvalCalls).toBe(1);
  });

  it("a claim that never settles falls through to the fail-closed answer instead of hanging the gate", async () => {
    // A rejected claim is already covered above; this is the claim that simply
    // never answers (a hung request). Without a bound on the wait, approved
    // stays null forever and resolveGate() sits on "loading" — a blank app.
    vi.useFakeTimers();
    db.approvalAnswers = [false];
    db.claim = () => new Promise(() => {});
    await mount();
    expect(latest.approved).toBeNull();
    expect(resolveGate({ authResolved: latest.authResolved, userId: latest.userId, approved: latest.approved })).toBe(
      "loading",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(latest.approved).toBe(false);
    expect(db.approvalCalls).toBe(1);
  });

  it("a token refresh inside the claim window still waits for the claim", async () => {
    // TOKEN_REFRESHED re-verifies approval on its own generation. If it asks
    // without the still-open claim, it lands on the pre-claim answer and its
    // generation invalidates the hydration re-check that would have said yes —
    // the exact bug the first test closes, re-opened by a token refresh.
    let releaseClaim: (m: unknown) => void = () => {};
    const held = new Promise((resolve) => {
      releaseClaim = resolve;
    });
    db.approvalAnswers = [false, false, true];
    db.claim = () => held;
    await mount();
    await waitFor(() => expect(db.approvalCalls).toBe(1));
    await act(async () => {
      db.callback!("TOKEN_REFRESHED", { user: { id: "user-a" } });
    });
    await waitFor(() => expect(db.approvalCalls).toBe(2));
    expect(latest.approved).toBeNull(); // neither check has settled: still waiting on the claim
    await act(async () => {
      releaseClaim(membership);
      await held;
    });
    await waitFor(() => expect(latest.approved).toBe(true));
  });

  it("a claim still in flight when the account changes cannot approve the new account", async () => {
    // The real late-identity race: user-a's claim is genuinely still open while
    // user-b signs in, and answers only afterwards. Its re-check must be
    // discarded by identity, not merely arrive early enough to be harmless.
    let releaseA: (m: unknown) => void = () => {};
    const heldA = new Promise((resolve) => {
      releaseA = resolve;
    });
    db.approvalAnswers = [false];
    db.claim = () => heldA;
    await mount();
    await waitFor(() => expect(db.approvalCalls).toBe(1));
    expect(latest.approved).toBeNull(); // user-a is still waiting on its claim
    // user-b signs in while user-a's claim has still not answered.
    db.claim = async () => null;
    await act(async () => {
      db.callback!("SIGNED_IN", { user: { id: "user-b" } });
    });
    await waitFor(() => expect(latest.approved).toBe(false));
    // user-a's claim finally lands, and its re-check would now say yes.
    db.approvalAnswers = [true];
    await act(async () => {
      releaseA(membership);
      await heldA;
    });
    expect(latest.approved).toBe(false);
    expect(latest.userId).toBe("user-b");
    expect(latest.academyMember).toBeNull();
  });
});
