import { describe, it, expect, vi } from "vitest";
import { createInFlightGuard } from "@/lib/inFlightGuard";

describe("createInFlightGuard", () => {
  it("skips the second call while the first is still in-flight", async () => {
    let resolveFirst: (() => void) | undefined;
    const inner = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const guarded = createInFlightGuard(inner);

    const firstCall = guarded();
    const secondCall = guarded();

    expect(inner).toHaveBeenCalledTimes(1);

    resolveFirst!();
    await firstCall;
    await secondCall;

    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("allows a new call once the in-flight one resolves", async () => {
    const inner = vi.fn(() => Promise.resolve("ok"));
    const guarded = createInFlightGuard(inner);

    await guarded();
    await guarded();
    await guarded();

    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("releases the guard when the inner function throws", async () => {
    let shouldThrow = true;
    const inner = vi.fn(async () => {
      if (shouldThrow) throw new Error("boom");
      return "ok";
    });
    const guarded = createInFlightGuard(inner);

    await expect(guarded()).rejects.toThrow("boom");

    shouldThrow = false;
    const result = await guarded();
    expect(result).toBe("ok");
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("forwards arguments to the inner function", async () => {
    const inner = vi.fn(async (a: number, b: string) => `${a}-${b}`);
    const guarded = createInFlightGuard(inner);

    const result = await guarded(42, "hello");
    expect(result).toBe("42-hello");
    expect(inner).toHaveBeenCalledWith(42, "hello");
  });
});
