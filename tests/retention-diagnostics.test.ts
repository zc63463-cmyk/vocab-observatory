import { describe, expect, it } from "vitest";
import {
  RETENTION_BUCKET_MIN_SAMPLES,
  RETENTION_DIAGNOSTIC_MIN_SAMPLES,
  RETENTION_DIAGNOSTIC_WINDOW_DAYS,
  RETENTION_MATURE_THRESHOLD_DAYS,
  bucketDueLogs,
  computeRetentionDiagnostic,
  computeSlice,
  computeWilsonInterval,
  filterDueReviews,
  type RetentionDiagnosticLog,
} from "@/lib/review/retention-diagnostics";

function mkLog(over: Partial<RetentionDiagnosticLog> = {}): RetentionDiagnosticLog {
  return {
    elapsed_days: 10,
    rating: "good",
    reviewed_at: "2026-04-15T12:00:00Z",
    scheduled_days: 10,
    ...over,
  };
}

/** Generate N due logs with the given again count, spread across the window. */
function generateDueLogs(
  total: number,
  againCount: number,
  anchorIso = "2026-04-15T00:00:00Z",
): RetentionDiagnosticLog[] {
  const anchor = new Date(anchorIso).getTime();
  const logs: RetentionDiagnosticLog[] = [];
  for (let i = 0; i < total; i += 1) {
    // Space reviews 1 hour apart walking backward from anchor.
    const t = new Date(anchor - i * 60 * 60 * 1000).toISOString();
    logs.push({
      elapsed_days: 10,
      rating: i < againCount ? "again" : "good",
      reviewed_at: t,
      scheduled_days: 10,
    });
  }
  return logs;
}

// ---------------------------------------------------------------------------
// computeWilsonInterval
// ---------------------------------------------------------------------------
describe("computeWilsonInterval", () => {
  it("returns null for zero total", () => {
    expect(computeWilsonInterval(0, 0)).toBeNull();
  });

  it("returns null for negative total", () => {
    expect(computeWilsonInterval(0, -1)).toBeNull();
  });

  it("returns null when successes > total", () => {
    expect(computeWilsonInterval(11, 10)).toBeNull();
  });

  it("returns null when successes is negative", () => {
    expect(computeWilsonInterval(-1, 10)).toBeNull();
  });

  it("returns null for non-finite inputs", () => {
    expect(computeWilsonInterval(Number.NaN, 10)).toBeNull();
    expect(computeWilsonInterval(5, Number.NaN)).toBeNull();
    expect(computeWilsonInterval(5, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("matches textbook Wilson 95% CI for 90/100", () => {
    const ci = computeWilsonInterval(90, 100);
    expect(ci).not.toBeNull();
    // Reference values computed analytically.
    expect(ci!.low).toBeCloseTo(0.8257, 3);
    expect(ci!.high).toBeCloseTo(0.9448, 3);
  });

  it("matches textbook Wilson 95% CI for 45/50", () => {
    const ci = computeWilsonInterval(45, 50);
    expect(ci!.low).toBeCloseTo(0.7864, 3);
    expect(ci!.high).toBeCloseTo(0.9565, 3);
  });

  it("bounds are clamped to [0, 1]", () => {
    const p0 = computeWilsonInterval(0, 10);
    expect(p0!.low).toBe(0);
    expect(p0!.high).toBeGreaterThan(0);
    expect(p0!.high).toBeLessThanOrEqual(1);

    const p1 = computeWilsonInterval(10, 10);
    expect(p1!.high).toBe(1);
    expect(p1!.low).toBeLessThan(1);
    expect(p1!.low).toBeGreaterThanOrEqual(0);
  });

  it("wider CI for smaller n at the same proportion", () => {
    const small = computeWilsonInterval(9, 10)!;
    const large = computeWilsonInterval(900, 1000)!;
    const smallWidth = small.high - small.low;
    const largeWidth = large.high - large.low;
    expect(smallWidth).toBeGreaterThan(largeWidth);
  });
});

// ---------------------------------------------------------------------------
// filterDueReviews
// ---------------------------------------------------------------------------
describe("filterDueReviews", () => {
  it("keeps logs where elapsed >= scheduled and scheduled >= 1", () => {
    const logs = [mkLog({ elapsed_days: 10, scheduled_days: 10 })];
    expect(filterDueReviews(logs)).toHaveLength(1);
  });

  it("keeps overdue logs", () => {
    const logs = [mkLog({ elapsed_days: 15, scheduled_days: 10 })];
    expect(filterDueReviews(logs)).toHaveLength(1);
  });

  it("drops early reviews (elapsed < scheduled)", () => {
    const logs = [mkLog({ elapsed_days: 5, scheduled_days: 10 })];
    expect(filterDueReviews(logs)).toHaveLength(0);
  });

  it("drops learning cards with scheduled_days < 1", () => {
    const logs = [mkLog({ elapsed_days: 1, scheduled_days: 0 })];
    expect(filterDueReviews(logs)).toHaveLength(0);
  });

  it("drops null elapsed_days", () => {
    const logs = [mkLog({ elapsed_days: null })];
    expect(filterDueReviews(logs)).toHaveLength(0);
  });

  it("drops null scheduled_days", () => {
    const logs = [mkLog({ scheduled_days: null })];
    expect(filterDueReviews(logs)).toHaveLength(0);
  });

  it("drops non-finite values", () => {
    const logs = [
      mkLog({ elapsed_days: Number.NaN }),
      mkLog({ scheduled_days: Number.POSITIVE_INFINITY }),
    ];
    expect(filterDueReviews(logs)).toHaveLength(0);
  });

  it("does not mutate input", () => {
    const logs = [mkLog(), mkLog({ elapsed_days: 1, scheduled_days: 10 })];
    const snapshot = JSON.stringify(logs);
    filterDueReviews(logs);
    expect(JSON.stringify(logs)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// computeRetentionDiagnostic
// ---------------------------------------------------------------------------
describe("computeRetentionDiagnostic", () => {
  const now = new Date("2026-04-30T00:00:00Z");

  it("returns insufficient-data for empty logs", () => {
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs: [],
      now,
    });
    expect(d.dueReviews).toBe(0);
    expect(d.totalReviews).toBe(0);
    expect(d.observedRetention).toBeNull();
    expect(d.confidenceInterval).toBeNull();
    expect(d.gap).toBeNull();
    expect(d.sampleSufficient).toBe(false);
    expect(d.gapSignificant).toBe(false);
    expect(d.suggestionKind).toBe("insufficient-data");
  });

  it("returns insufficient-data below MIN_SAMPLES threshold", () => {
    const logs = generateDueLogs(RETENTION_DIAGNOSTIC_MIN_SAMPLES - 1, 0);
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.dueReviews).toBe(RETENTION_DIAGNOSTIC_MIN_SAMPLES - 1);
    expect(d.sampleSufficient).toBe(false);
    expect(d.suggestionKind).toBe("insufficient-data");
    // CI is still computed for any n > 0; only the suggestion is gated.
    expect(d.observedRetention).toBe(1);
    expect(d.confidenceInterval).not.toBeNull();
  });

  it("flips to non-insufficient exactly at MIN_SAMPLES", () => {
    // 90% retention at exactly the minimum sample count.
    const logs = generateDueLogs(
      RETENTION_DIAGNOSTIC_MIN_SAMPLES,
      Math.round(RETENTION_DIAGNOSTIC_MIN_SAMPLES * 0.1),
    );
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.sampleSufficient).toBe(true);
    expect(d.suggestionKind).not.toBe("insufficient-data");
  });

  it("excludes early and learning-state reviews from dueReviews", () => {
    const logs: RetentionDiagnosticLog[] = [
      // eligible
      mkLog({ elapsed_days: 10, rating: "again", scheduled_days: 10 }),
      mkLog({ elapsed_days: 10, rating: "good", scheduled_days: 10 }),
      mkLog({ elapsed_days: 20, rating: "good", scheduled_days: 10 }),
      // ineligible: early review
      mkLog({ elapsed_days: 2, rating: "good", scheduled_days: 10 }),
      // ineligible: learning card
      mkLog({ elapsed_days: 1, rating: "again", scheduled_days: 0 }),
      // ineligible: null fields
      mkLog({ elapsed_days: null, rating: "good" }),
    ];
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.totalReviews).toBe(6);
    expect(d.dueReviews).toBe(3);
    expect(d.againCount).toBe(1);
    // 1 again in 3 due → retention 2/3
    expect(d.observedRetention).toBeCloseTo(2 / 3, 5);
  });

  it("computes gap with correct sign", () => {
    // 95% retention observed vs 90% desired → gap = +0.05
    const logs = generateDueLogs(100, 5);
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.observedRetention).toBe(0.95);
    expect(d.gap).toBeCloseTo(0.05, 5);

    // 70% observed vs 90% desired → gap = -0.20
    const d2 = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs: generateDueLogs(100, 30),
      now,
    });
    expect(d2.gap).toBeCloseTo(-0.2, 5);
  });

  it("classifies above-target when CI entirely above desired", () => {
    // 98/100 success → CI ~[0.93, 0.99]; desired 0.8 is below low bound.
    const logs = generateDueLogs(100, 2);
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.8,
      logs,
      now,
    });
    expect(d.confidenceInterval!.low).toBeGreaterThan(0.8);
    expect(d.suggestionKind).toBe("above-target");
    expect(d.gapSignificant).toBe(true);
  });

  it("classifies below-target when CI entirely below desired", () => {
    // 75/100 success → CI ~[0.66, 0.83]; desired 0.9 is above high bound.
    const logs = generateDueLogs(100, 25);
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.confidenceInterval!.high).toBeLessThan(0.9);
    expect(d.suggestionKind).toBe("below-target");
    expect(d.gapSignificant).toBe(true);
  });

  it("classifies on-target when CI straddles desired", () => {
    // 45/50 success → CI ~[0.79, 0.96]; desired 0.9 sits inside.
    const logs = generateDueLogs(50, 5);
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.confidenceInterval!.low).toBeLessThan(0.9);
    expect(d.confidenceInterval!.high).toBeGreaterThan(0.9);
    expect(d.suggestionKind).toBe("on-target");
    expect(d.gapSignificant).toBe(false);
  });

  it("filters logs outside the window by reviewed_at", () => {
    // 60 in-window + 40 out-of-window = 100 total, but only 60 should count.
    const inWindow = generateDueLogs(60, 6, "2026-04-29T00:00:00Z"); // within 90d
    const outOfWindow = generateDueLogs(40, 0, "2025-01-01T00:00:00Z"); // far before
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs: [...inWindow, ...outOfWindow],
      now,
    });
    expect(d.totalReviews).toBe(60);
    expect(d.dueReviews).toBe(60);
    expect(d.againCount).toBe(6);
    expect(d.observedRetention).toBeCloseTo(0.9, 5);
  });

  it("respects a custom windowDays", () => {
    // With a 7-day window, logs from 30 days ago are excluded.
    const recent = generateDueLogs(50, 5, "2026-04-29T00:00:00Z"); // 1 day ago
    const older = generateDueLogs(50, 0, "2026-04-10T00:00:00Z"); // 20 days ago
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs: [...recent, ...older],
      now,
      windowDays: 7,
    });
    expect(d.dueReviews).toBe(50);
    expect(d.againCount).toBe(5);
    expect(d.windowDays).toBe(7);
  });

  it("uses default window when not provided", () => {
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs: [],
      now,
    });
    expect(d.windowDays).toBe(RETENTION_DIAGNOSTIC_WINDOW_DAYS);
  });

  it("handles case-insensitive rating 'Again'", () => {
    const logs: RetentionDiagnosticLog[] = [
      mkLog({ elapsed_days: 10, rating: "Again", scheduled_days: 10 }),
      mkLog({ elapsed_days: 10, rating: "AGAIN", scheduled_days: 10 }),
      mkLog({ elapsed_days: 10, rating: "good", scheduled_days: 10 }),
    ];
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.againCount).toBe(2);
  });

  it("drops logs with invalid reviewed_at", () => {
    const logs: RetentionDiagnosticLog[] = [
      mkLog({ reviewed_at: "not-a-date" }),
      mkLog({ reviewed_at: "" }),
    ];
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.totalReviews).toBe(0);
    expect(d.dueReviews).toBe(0);
  });

  it("drops future logs (after now)", () => {
    const futureAnchor = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const logs = generateDueLogs(5, 0, futureAnchor);
    const d = computeRetentionDiagnostic({
      desiredRetention: 0.9,
      logs,
      now,
    });
    expect(d.totalReviews).toBe(0);
  });

  it("does not mutate input logs", () => {
    const logs = generateDueLogs(10, 1);
    const snapshot = JSON.stringify(logs);
    computeRetentionDiagnostic({ desiredRetention: 0.9, logs, now });
    expect(JSON.stringify(logs)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// bucketDueLogs
// ---------------------------------------------------------------------------
describe("bucketDueLogs", () => {
  function dueLog(scheduledDays: number): RetentionDiagnosticLog {
    return mkLog({ elapsed_days: scheduledDays, scheduled_days: scheduledDays });
  }

  it("partitions empty input into empty buckets", () => {
    const { young, mature } = bucketDueLogs([]);
    expect(young).toEqual([]);
    expect(mature).toEqual([]);
  });

  it("puts scheduled_days = threshold - 1 into young", () => {
    const { young, mature } = bucketDueLogs([
      dueLog(RETENTION_MATURE_THRESHOLD_DAYS - 1),
    ]);
    expect(young).toHaveLength(1);
    expect(mature).toHaveLength(0);
  });

  it("puts scheduled_days = threshold into mature", () => {
    const { young, mature } = bucketDueLogs([
      dueLog(RETENTION_MATURE_THRESHOLD_DAYS),
    ]);
    expect(young).toHaveLength(0);
    expect(mature).toHaveLength(1);
  });

  it("puts scheduled_days = threshold + 1 into mature", () => {
    const { young, mature } = bucketDueLogs([
      dueLog(RETENTION_MATURE_THRESHOLD_DAYS + 1),
    ]);
    expect(young).toHaveLength(0);
    expect(mature).toHaveLength(1);
  });

  it("partitions a mixed batch deterministically", () => {
    const logs = [
      dueLog(1),
      dueLog(7),
      dueLog(20),
      dueLog(21),
      dueLog(60),
      dueLog(365),
    ];
    const { young, mature } = bucketDueLogs(logs);
    expect(young).toHaveLength(3);
    expect(mature).toHaveLength(3);
  });

  it("preserves the sum of inputs (no loss, no dup)", () => {
    const logs = Array.from({ length: 30 }, (_, i) => dueLog(i + 1));
    const { young, mature } = bucketDueLogs(logs);
    expect(young.length + mature.length).toBe(logs.length);
  });
});

// ---------------------------------------------------------------------------
// computeSlice
// ---------------------------------------------------------------------------
describe("computeSlice", () => {
  it("reports zeroes for empty input", () => {
    const slice = computeSlice([], 0.9, 20);
    expect(slice).toEqual({
      againCount: 0,
      confidenceInterval: null,
      dueReviews: 0,
      gap: null,
      gapSignificant: false,
      observedRetention: null,
      sampleSufficient: false,
      suggestionKind: "insufficient-data",
    });
  });

  it("honours the minSamples threshold parameter (bucket vs overall)", () => {
    // 25 reviews: enough for RETENTION_BUCKET_MIN_SAMPLES (20) but not RETENTION_DIAGNOSTIC_MIN_SAMPLES (50).
    const logs = generateDueLogs(25, 0);
    const bucketSlice = computeSlice(logs, 0.9, RETENTION_BUCKET_MIN_SAMPLES);
    const overallSlice = computeSlice(logs, 0.9, RETENTION_DIAGNOSTIC_MIN_SAMPLES);
    expect(bucketSlice.sampleSufficient).toBe(true);
    expect(overallSlice.sampleSufficient).toBe(false);
  });

  it("classifies above-target when CI entirely exceeds desired", () => {
    // 98 / 100 good ⇒ observed 0.98, CI roughly [0.93, 0.99] → above 0.9.
    const logs = generateDueLogs(100, 2);
    const slice = computeSlice(logs, 0.9, 20);
    expect(slice.suggestionKind).toBe("above-target");
  });

  it("classifies below-target when CI entirely below desired", () => {
    // 75 / 100 good ⇒ observed 0.75, CI roughly [0.66, 0.82] → below 0.9.
    const logs = generateDueLogs(100, 25);
    const slice = computeSlice(logs, 0.9, 20);
    expect(slice.suggestionKind).toBe("below-target");
  });
});

// ---------------------------------------------------------------------------
// computeRetentionDiagnostic with buckets
// ---------------------------------------------------------------------------
describe("computeRetentionDiagnostic (buckets)", () => {
  const now = new Date("2026-04-15T12:00:00Z");

  /** Build N due logs with a target scheduled_days (to land in a specific bucket). */
  function bucketLogs(
    total: number,
    againCount: number,
    scheduledDays: number,
    anchorIso = "2026-04-15T00:00:00Z",
  ): RetentionDiagnosticLog[] {
    const anchor = new Date(anchorIso).getTime();
    return Array.from({ length: total }, (_, i) => ({
      elapsed_days: scheduledDays,
      rating: i < againCount ? "again" : "good",
      reviewed_at: new Date(anchor - i * 60 * 60 * 1000).toISOString(),
      scheduled_days: scheduledDays,
    }));
  }

  it("always emits both bucket keys even when empty", () => {
    const d = computeRetentionDiagnostic({ desiredRetention: 0.9, logs: [], now });
    expect(d.buckets.young.dueReviews).toBe(0);
    expect(d.buckets.mature.dueReviews).toBe(0);
    expect(d.buckets.young.suggestionKind).toBe("insufficient-data");
    expect(d.buckets.mature.suggestionKind).toBe("insufficient-data");
  });

  it("routes all logs to the correct bucket based on scheduled_days", () => {
    const logs = [
      ...bucketLogs(10, 0, 5, "2026-04-15T08:00:00Z"), // young
      ...bucketLogs(10, 0, 60, "2026-04-10T08:00:00Z"), // mature
    ];
    const d = computeRetentionDiagnostic({ desiredRetention: 0.9, logs, now });
    expect(d.buckets.young.dueReviews).toBe(10);
    expect(d.buckets.mature.dueReviews).toBe(10);
    expect(d.buckets.young.dueReviews + d.buckets.mature.dueReviews).toBe(d.dueReviews);
  });

  it("diverges suggestions between young and mature when retention actually differs", () => {
    // Young bucket: 60 perfect reviews → CI low ≈ 0.94, well above 0.9 target.
    // Mature bucket: 60 reviews with 30 again (50% retention) → CI high ≈ 0.62, well below 0.9.
    // Desired 0.9.
    const logs = [
      ...bucketLogs(60, 0, 5, "2026-04-15T08:00:00Z"),
      ...bucketLogs(60, 30, 60, "2026-04-10T08:00:00Z"),
    ];
    const d = computeRetentionDiagnostic({ desiredRetention: 0.9, logs, now });
    expect(d.buckets.young.suggestionKind).toBe("above-target");
    expect(d.buckets.mature.suggestionKind).toBe("below-target");
  });

  it("marks bucket as insufficient-data when under RETENTION_BUCKET_MIN_SAMPLES", () => {
    // 30 young (≥20 threshold), 10 mature (below threshold).
    const logs = [
      ...bucketLogs(30, 0, 5, "2026-04-15T08:00:00Z"),
      ...bucketLogs(10, 0, 60, "2026-04-10T08:00:00Z"),
    ];
    const d = computeRetentionDiagnostic({ desiredRetention: 0.9, logs, now });
    expect(d.buckets.young.sampleSufficient).toBe(true);
    expect(d.buckets.mature.sampleSufficient).toBe(false);
    expect(d.buckets.mature.suggestionKind).toBe("insufficient-data");
  });

  it("bucket observedRetention + dueReviews is conserved against overall", () => {
    const logs = [
      ...bucketLogs(40, 4, 5, "2026-04-15T08:00:00Z"), // young: 36/40 = 0.9
      ...bucketLogs(60, 12, 60, "2026-04-10T08:00:00Z"), // mature: 48/60 = 0.8
    ];
    const d = computeRetentionDiagnostic({ desiredRetention: 0.85, logs, now });
    // Overall dueReviews = sum of bucket dueReviews
    expect(d.dueReviews).toBe(d.buckets.young.dueReviews + d.buckets.mature.dueReviews);
    // Overall againCount = sum of bucket againCounts
    expect(d.againCount).toBe(d.buckets.young.againCount + d.buckets.mature.againCount);
  });

  it("treats 20-day and 21-day scheduled at the canonical boundary", () => {
    const logs = [
      ...bucketLogs(
        25,
        0,
        RETENTION_MATURE_THRESHOLD_DAYS - 1,
        "2026-04-15T08:00:00Z",
      ),
      ...bucketLogs(
        25,
        0,
        RETENTION_MATURE_THRESHOLD_DAYS,
        "2026-04-10T08:00:00Z",
      ),
    ];
    const d = computeRetentionDiagnostic({ desiredRetention: 0.9, logs, now });
    expect(d.buckets.young.dueReviews).toBe(25);
    expect(d.buckets.mature.dueReviews).toBe(25);
  });
});
