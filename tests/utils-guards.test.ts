import { describe, expect, it } from "vitest";
import { chunkArray, startOfTodayIso } from "@/lib/utils";

/**
 * Regression tests for the two P0 findings in
 * `.trae/documents/code-robustness-review-report.md` that weren't yet
 * covered elsewhere:
 *   1. `startOfTodayIso` needs to resolve the same UTC instant regardless
 *      of `process.env.TZ`, matching Asia/Shanghai civil day.
 *   2. `chunkArray` must refuse non-positive / non-finite chunk sizes
 *      instead of spinning forever.
 */

describe("startOfTodayIso — TZ-stable civil day", () => {
  function computeShanghaiMidnightIso(now: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return new Date(`${year}-${month}-${day}T00:00:00+08:00`).toISOString();
  }

  it("returns the same ISO string regardless of process TZ", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const inUtc = startOfTodayIso();

      process.env.TZ = "America/Los_Angeles";
      const inPdt = startOfTodayIso();

      process.env.TZ = "Asia/Shanghai";
      const inShanghai = startOfTodayIso();

      expect(inUtc).toBe(inShanghai);
      expect(inPdt).toBe(inShanghai);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("anchors to Asia/Shanghai midnight of the current civil day", () => {
    const expected = computeShanghaiMidnightIso(new Date());
    expect(startOfTodayIso()).toBe(expected);
  });

  it("returns a valid ISO 8601 UTC string", () => {
    const iso = startOfTodayIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});

describe("chunkArray — boundary guards", () => {
  it("returns an empty array when chunkSize is zero", () => {
    expect(chunkArray([1, 2, 3, 4], 0)).toEqual([]);
  });

  it("returns an empty array when chunkSize is negative", () => {
    expect(chunkArray([1, 2, 3, 4], -2)).toEqual([]);
  });

  it("returns an empty array when chunkSize is NaN", () => {
    expect(chunkArray([1, 2, 3, 4], Number.NaN)).toEqual([]);
  });

  it("returns an empty array when chunkSize is Infinity", () => {
    expect(chunkArray([1, 2, 3, 4], Number.POSITIVE_INFINITY)).toEqual([]);
    expect(chunkArray([1, 2, 3, 4], Number.NEGATIVE_INFINITY)).toEqual([]);
  });

  it("still chunks normally for valid sizes", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
    expect(chunkArray([1], 10)).toEqual([[1]]);
  });
});
