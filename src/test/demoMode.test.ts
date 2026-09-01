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

  it("never collides — 30 distinct keys get 30 distinct aliases", () => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    const keys = Array.from({ length: 30 }, (_, i) => `resident.${i}@gmail.com`);
    expect(new Set(keys.map(maskName)).size).toBe(30);
    expect(new Set(keys.map(maskEmail)).size).toBe(30);
  });

  it("stays on when sessionStorage throws but ?demo is in the URL", () => {
    window.history.replaceState({}, "", "/?demo");
    _resetDemoCache();
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(isDemo()).toBe(true);
    } finally {
      Storage.prototype.setItem = orig;
    }
  });

  it("handles empty values safely", () => {
    sessionStorage.setItem("ysnp-demo", "1");
    _resetDemoCache();
    expect(maskName("")).toBe("");
    expect(maskEmail("")).toBe("");
  });
});
