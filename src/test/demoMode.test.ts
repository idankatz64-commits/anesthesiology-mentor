import { describe, it, expect, beforeEach } from "vitest";
import { isDemo, maskName, maskEmail, _resetDemoCache } from "@/lib/demoMode";

describe("demoMode", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    _resetDemoCache();
  });

  it("is off by default and passes values through", () => {
    expect(isDemo()).toBe(false);
    expect(maskName("ישראל ישראלי")).toBe("ישראל ישראלי");
    expect(maskEmail("real@gmail.com")).toBe("real@gmail.com");
  });

  it("turns on via ?demo and persists in sessionStorage", () => {
    window.history.replaceState({}, "", "/?demo");
    _resetDemoCache();
    expect(isDemo()).toBe(true);
    // param gone, flag survives
    window.history.replaceState({}, "", "/");
    _resetDemoCache();
    expect(isDemo()).toBe(true);
  });

  it("masks deterministically — same key, same alias", () => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    expect(maskName("real@gmail.com")).toBe(maskName("real@gmail.com"));
    expect(maskEmail("real@gmail.com")).toBe(maskEmail("real@gmail.com"));
  });

  it("masks distinct keys to distinct aliases and hides the original", () => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    const a = maskName("alice@gmail.com");
    const b = maskName("bob@gmail.com");
    expect(a).not.toBe(b);
    expect(a).not.toContain("alice");
    expect(maskEmail("alice@gmail.com")).toMatch(/@demo\.local$/);
    expect(maskEmail("alice@gmail.com")).not.toContain("alice");
  });

  it("handles empty values safely", () => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    expect(maskName("")).toBe("");
    expect(maskEmail("")).toBe("");
  });
});
