import { describe, expect, it } from "vitest";
import {
  assertFillWindowOpen,
  buildDeadlinePlan,
  parseQuoteValidUntil,
} from "./deadlines";

const NOW_MS = 1_787_443_200_000; // 2026-08-23T00:00:00Z
const NOW_SEC = NOW_MS / 1000;

describe("parseQuoteValidUntil", () => {
  it("accepts epoch seconds", () => {
    expect(parseQuoteValidUntil(NOW_SEC)).toBe(NOW_SEC);
  });

  it("accepts epoch milliseconds", () => {
    expect(parseQuoteValidUntil(NOW_MS)).toBe(NOW_SEC);
  });

  it("accepts a numeric string", () => {
    expect(parseQuoteValidUntil(String(NOW_SEC))).toBe(NOW_SEC);
  });

  it("accepts an ISO string", () => {
    expect(parseQuoteValidUntil("2026-08-23T00:00:00Z")).toBe(NOW_SEC);
  });

  it("rejects unusable input", () => {
    for (const v of [null, undefined, "", "not-a-date", 0, -1]) {
      expect(parseQuoteValidUntil(v)).toBeNull();
    }
  });
});

describe("buildDeadlinePlan", () => {
  it("honours a numeric validUntil rather than falling back to the max TTL", () => {
    const plan = buildDeadlinePlan({
      quoteValidUntil: NOW_SEC + 120,
      nowMs: NOW_MS,
    });
    expect(plan.fillDeadline).toBe(NOW_SEC + 120);
  });

  it("caps a distant validUntil at the max fill TTL", () => {
    const plan = buildDeadlinePlan({
      quoteValidUntil: NOW_SEC + 86_400,
      nowMs: NOW_MS,
    });
    expect(plan.fillDeadline).toBe(NOW_SEC + 15 * 60);
  });

  it("puts the refund unlock after the fill cutoff", () => {
    const plan = buildDeadlinePlan({ nowMs: NOW_MS });
    expect(plan.expires).toBeGreaterThan(plan.fillDeadline);
  });

  it("refuses a quote already at its expiry", () => {
    expect(() =>
      buildDeadlinePlan({ quoteValidUntil: NOW_SEC + 5, nowMs: NOW_MS }),
    ).toThrow(/too close to expiry/);
  });
});

describe("assertFillWindowOpen", () => {
  it("passes while the window is open", () => {
    expect(() =>
      assertFillWindowOpen(NOW_SEC + 10 * 60, NOW_MS),
    ).not.toThrow();
  });

  it("throws once the window has closed", () => {
    expect(() => assertFillWindowOpen(NOW_SEC - 1, NOW_MS)).toThrow(
      /expired before the order was opened/,
    );
  });

  it("throws inside the safety margin", () => {
    expect(() => assertFillWindowOpen(NOW_SEC + 5, NOW_MS)).toThrow();
  });
});
