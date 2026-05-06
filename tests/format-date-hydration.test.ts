import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/utils";

/**
 * Regression for the React #418 hydration error reported in
 * `dogfood-output/dogfood-report.md` (2026-05-06).
 *
 * Root cause: `Intl.DateTimeFormat("zh-CN", {...})` had no explicit `timeZone`
 * option, so it picked up the runtime's local TZ — UTC on Vercel SSR, the
 * user's local TZ on CSR. Whenever a stored `updated_at` straddled UTC
 * midnight, the same ISO string formatted to a different calendar day on
 * each side, producing a hydration text-mismatch the moment a client
 * component (e.g. `PlazaSearchShell`) re-rendered after hydration.
 *
 * The contract this test pins down:
 *   - Same ISO input → same formatted output regardless of `process.env.TZ`.
 *   - The output is taken in Asia/Shanghai (UTC+8), so a UTC-late timestamp
 *     like `2025-01-01T16:30:00Z` is reported as `2025年1月2日`, not the
 *     UTC-day `2025年1月1日`.
 */
describe("hydration-safe date formatting", () => {
  // 16:30 UTC on Jan 1 = 00:30 next day in Asia/Shanghai. This is exactly the
  // class of timestamp that used to flip the calendar day between SSR and CSR.
  const lateUtcIso = "2025-01-01T16:30:00.000Z";

  it("formatDate outputs the same string regardless of process TZ", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const inUtc = formatDate(lateUtcIso);

      process.env.TZ = "America/Los_Angeles";
      const inPdt = formatDate(lateUtcIso);

      process.env.TZ = "Asia/Shanghai";
      const inShanghai = formatDate(lateUtcIso);

      expect(inUtc).toBe(inShanghai);
      expect(inPdt).toBe(inShanghai);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("formatDateTime outputs the same string regardless of process TZ", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const inUtc = formatDateTime(lateUtcIso);

      process.env.TZ = "America/Los_Angeles";
      const inPdt = formatDateTime(lateUtcIso);

      process.env.TZ = "Asia/Shanghai";
      const inShanghai = formatDateTime(lateUtcIso);

      expect(inUtc).toBe(inShanghai);
      expect(inPdt).toBe(inShanghai);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("formatDate reports the Asia/Shanghai calendar day for UTC-late timestamps", () => {
    // The bug used to surface as `1月1日` on SSR vs `1月2日` on CSR for this
    // exact input. Asserting the Shanghai-day result keeps both sides honest.
    const formatted = formatDate(lateUtcIso);
    expect(formatted).toContain("2025");
    expect(formatted).toContain("1月2日");
  });

  it("formatDateTime reports the Asia/Shanghai wall-clock for UTC-late timestamps", () => {
    const formatted = formatDateTime(lateUtcIso);
    expect(formatted).toContain("2025");
    expect(formatted).toContain("1月2日");
    // 16:30 UTC + 8h = 00:30 next day — pin the minute fraction so a future
    // accidental TZ change shows up in CI.
    expect(formatted).toContain("00:30");
  });

  it("falls back to the placeholder for null/empty input", () => {
    expect(formatDate(null)).toBe("未记录");
    expect(formatDate(undefined)).toBe("未记录");
    expect(formatDate("not-a-date")).toBe("未记录");
    expect(formatDateTime(null)).toBe("未记录");
  });
});
