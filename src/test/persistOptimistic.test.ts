import { describe, it, expect, vi, beforeEach } from "vitest";
import { persistOptimistic } from "@/lib/persistOptimistic";

// Mock sonner toast to verify error UX without rendering anything
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

describe("persistOptimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("applies local change immediately (optimistic UX)", async () => {
    const applyLocal = vi.fn();
    const dbCall = vi.fn().mockResolvedValue({ error: null });
    const rollback = vi.fn();

    const promise = persistOptimistic({
      applyLocal,
      dbCall,
      rollback,
      errorLabel: "test",
    });

    // applyLocal must run synchronously before awaiting the DB call
    expect(applyLocal).toHaveBeenCalledTimes(1);
    expect(dbCall).toHaveBeenCalledTimes(1);

    await promise;
    expect(rollback).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does NOT rollback on success", async () => {
    const applyLocal = vi.fn();
    const rollback = vi.fn();

    await persistOptimistic({
      applyLocal,
      dbCall: () => Promise.resolve({ error: null }),
      rollback,
      errorLabel: "shouldnt fire",
    });

    expect(rollback).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rolls back + toasts when Supabase returns {error}", async () => {
    const applyLocal = vi.fn();
    const rollback = vi.fn();

    await persistOptimistic({
      applyLocal,
      dbCall: () => Promise.resolve({ error: { message: "RLS denied" } }),
      rollback,
      errorLabel: "שמירת מועדף נכשלה",
    });

    expect(applyLocal).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("שמירת מועדף נכשלה");
  });

  it("rolls back + toasts when dbCall throws (network failure)", async () => {
    const applyLocal = vi.fn();
    const rollback = vi.fn();

    await persistOptimistic({
      applyLocal,
      dbCall: () => Promise.reject(new Error("network down")),
      rollback,
      errorLabel: "שמירה נכשלה",
    });

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("שמירה נכשלה");
  });

  it("rolls back exactly once even on thrown promise", async () => {
    const rollback = vi.fn();

    await persistOptimistic({
      applyLocal: () => {},
      dbCall: () => Promise.reject(new Error("boom")),
      rollback,
      errorLabel: "x",
    });

    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it("does not call rollback if applyLocal itself throws (caller bug — surface it)", async () => {
    const rollback = vi.fn();
    await expect(
      persistOptimistic({
        applyLocal: () => {
          throw new Error("apply bug");
        },
        dbCall: () => Promise.resolve({ error: null }),
        rollback,
        errorLabel: "x",
      }),
    ).rejects.toThrow("apply bug");

    // Important: rollback is the inverse of applyLocal — if applyLocal failed,
    // there's nothing to undo. Calling rollback would break invariants further.
    expect(rollback).not.toHaveBeenCalled();
  });
});
