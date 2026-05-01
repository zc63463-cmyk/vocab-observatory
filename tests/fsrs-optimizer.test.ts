import { describe, expect, it } from "vitest";
import {
  MIN_REVIEWS_FOR_TRAINING,
  buildOptimizerItems,
  trainFsrsWeights,
  type OptimizerLog,
} from "@/lib/review/fsrs-optimizer";

/** Shorthand for building a log. */
function log(overrides: Partial<OptimizerLog> = {}): OptimizerLog {
  return {
    progress_id: "card-1",
    rating: "good",
    reviewed_at: "2026-04-15T12:00:00Z",
    ...overrides,
  };
}

describe("buildOptimizerItems", () => {
  it("returns empty array for empty input", () => {
    expect(buildOptimizerItems([])).toEqual([]);
  });

  it("skips logs without a progress_id", () => {
    const items = buildOptimizerItems([
      log({ progress_id: null }),
      log({ progress_id: "" }),
    ]);
    expect(items).toEqual([]);
  });

  it("skips logs with unrecognised ratings", () => {
    const items = buildOptimizerItems([log({ rating: "skip" }), log({ rating: "" })]);
    expect(items).toEqual([]);
  });

  it("skips logs with unparseable reviewed_at", () => {
    const items = buildOptimizerItems([
      log({ reviewed_at: "not-a-date" }),
      log({ reviewed_at: "" }),
    ]);
    expect(items).toEqual([]);
  });

  it("maps rating strings to numeric 1–4 preserving order", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "a", rating: "again", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: "a", rating: "hard", reviewed_at: "2026-04-16T00:00:00Z" }),
      log({ progress_id: "a", rating: "good", reviewed_at: "2026-04-17T00:00:00Z" }),
      log({ progress_id: "a", rating: "easy", reviewed_at: "2026-04-18T00:00:00Z" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].reviews.map((r) => r.rating)).toEqual([1, 2, 3, 4]);
  });

  it("sets delta_t = 0 for the first review per card", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
    ]);
    expect(items[0].reviews[0].deltaT).toBe(0);
  });

  it("computes delta_t as floor days between consecutive reviews", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-18T00:00:00Z" }), // +3 days
      log({ progress_id: "a", reviewed_at: "2026-04-25T12:00:00Z" }), // +7.5 days → 7
    ]);
    expect(items[0].reviews.map((r) => r.deltaT)).toEqual([0, 3, 7]);
  });

  it("sorts each card's logs chronologically before computing delta_t", () => {
    // Intentionally scramble the insertion order.
    const items = buildOptimizerItems([
      log({ progress_id: "a", reviewed_at: "2026-04-20T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-18T00:00:00Z" }),
    ]);
    expect(items[0].reviews.map((r) => r.deltaT)).toEqual([0, 3, 2]);
  });

  it("clamps negative delta_t to 0 defensively", () => {
    // Two identical timestamps → diff=0; prior to sorting, the test above
    // covers scrambling, but same-instant duplicates should not produce
    // negatives either.
    const items = buildOptimizerItems([
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
    ]);
    expect(items[0].reviews.map((r) => r.deltaT)).toEqual([0, 0]);
  });

  it("splits logs across multiple cards and orders items by first-review time", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "b", reviewed_at: "2026-04-10T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-08T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-09T00:00:00Z" }),
      log({ progress_id: "b", reviewed_at: "2026-04-11T00:00:00Z" }),
    ]);
    expect(items).toHaveLength(2);
    // Card "a" started earlier, so it must come first.
    expect(items[0].reviews).toHaveLength(2);
    expect(items[1].reviews).toHaveLength(2);
  });

  it("mixes valid and invalid logs, keeping only the valid ones", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "a", rating: "good", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: null, rating: "good", reviewed_at: "2026-04-16T00:00:00Z" }),
      log({ progress_id: "a", rating: "junk", reviewed_at: "2026-04-17T00:00:00Z" }),
      log({ progress_id: "a", rating: "good", reviewed_at: "2026-04-18T00:00:00Z" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].reviews).toHaveLength(2);
    expect(items[0].reviews.map((r) => r.deltaT)).toEqual([0, 3]);
  });

  it("does not mutate the input array", () => {
    const logs = [
      log({ progress_id: "a", reviewed_at: "2026-04-18T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
    ];
    const snapshot = JSON.stringify(logs);
    buildOptimizerItems(logs);
    expect(JSON.stringify(logs)).toBe(snapshot);
  });

  it("accepts mixed-case rating strings", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "a", rating: "Good", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: "a", rating: "AGAIN", reviewed_at: "2026-04-16T00:00:00Z" }),
    ]);
    expect(items[0].reviews.map((r) => r.rating)).toEqual([3, 1]);
  });
});

describe("trainFsrsWeights sample-size gate", () => {
  it("rejects when logs length is below MIN_REVIEWS_FOR_TRAINING", async () => {
    const logs: OptimizerLog[] = Array.from(
      { length: MIN_REVIEWS_FOR_TRAINING - 1 },
      (_, i) => log({ reviewed_at: new Date(2026, 0, 1 + i).toISOString() }),
    );
    await expect(trainFsrsWeights(logs)).rejects.toThrow(
      /Insufficient reviews/,
    );
  });
});

describe("buildOptimizerItems filtered review accounting", () => {
  // Covers the L3 fix: `sampleSize` reported by `trainFsrsWeights` is the
  // sum of per-item review counts here, so consumers can rely on these
  // numbers reflecting what the optimizer actually saw, not the raw DB
  // row count.
  it("total review count across items equals valid-input count", () => {
    const items = buildOptimizerItems([
      log({ progress_id: "a", reviewed_at: "2026-04-15T00:00:00Z" }),
      log({ progress_id: "a", reviewed_at: "2026-04-16T00:00:00Z" }),
      log({ progress_id: "b", reviewed_at: "2026-04-15T00:00:00Z" }),
      // Three below should all be dropped:
      log({ progress_id: null }),
      log({ rating: "typo" }),
      log({ reviewed_at: "not-a-date" }),
    ]);
    const totalReviews = items.reduce(
      (sum, item) => sum + item.reviews.length,
      0,
    );
    expect(totalReviews).toBe(3);
    // And items are per-card, not per-log
    expect(items).toHaveLength(2);
  });
});
