import { describe, expect, it } from "vitest";
import {
  deriveZenSessionSummary,
  formatDurationMs,
  formatRate,
} from "@/components/review/zen/derive-session-summary";
import type { ZenReviewedItem } from "@/components/review/zen/types";

function makeItem(
  partial: Partial<ZenReviewedItem> & Pick<ZenReviewedItem, "id" | "rating">,
): ZenReviewedItem {
  return {
    cardId: `card-${partial.id}`,
    wordId: `word-${partial.id}`,
    word: "stub",
    ratingLabel: partial.rating,
    answeredAt: "2026-01-01T00:00:00.000Z",
    canUndo: false,
    ...partial,
  };
}

describe("deriveZenSessionSummary", () => {
  it("returns zeros for empty history", () => {
    const summary = deriveZenSessionSummary([], undefined);
    expect(summary.totalReviewed).toBe(0);
    expect(summary.activeReviewed).toBe(0);
    expect(summary.undoneCount).toBe(0);
    expect(summary.againCount).toBe(0);
    expect(summary.againRate).toBe(0);
    expect(summary.totalDurationMs).toBe(0);
    expect(summary.averageDurationMs).toBeNull();
  });

  it("counts totalReviewed including undone but distribution only active", () => {
    const history: ZenReviewedItem[] = [
      makeItem({ id: "1", rating: "again", undone: true }),
      makeItem({ id: "2", rating: "good" }),
      makeItem({ id: "3", rating: "easy" }),
      makeItem({ id: "4", rating: "hard" }),
    ];

    const summary = deriveZenSessionSummary(history, undefined);

    expect(summary.totalReviewed).toBe(4);
    expect(summary.activeReviewed).toBe(3);
    expect(summary.undoneCount).toBe(1);
    expect(summary.againCount).toBe(0); // the again was undone
    expect(summary.hardCount).toBe(1);
    expect(summary.goodCount).toBe(1);
    expect(summary.easyCount).toBe(1);
    expect(summary.againRate).toBe(0);
  });

  it("computes againRate against active reviewed only", () => {
    const history: ZenReviewedItem[] = [
      makeItem({ id: "1", rating: "again" }),
      makeItem({ id: "2", rating: "again" }),
      makeItem({ id: "3", rating: "good" }),
      makeItem({ id: "4", rating: "easy" }),
      // an undone again should NOT push the rate
      makeItem({ id: "5", rating: "again", undone: true }),
    ];

    const summary = deriveZenSessionSummary(history, undefined);

    expect(summary.activeReviewed).toBe(4);
    expect(summary.againCount).toBe(2);
    expect(summary.againRate).toBeCloseTo(0.5);
  });

  it("averageDurationMs is null when no active item has a duration", () => {
    const history: ZenReviewedItem[] = [
      makeItem({ id: "1", rating: "good" }), // no durationMs
      makeItem({ id: "2", rating: "easy" }), // no durationMs
    ];
    const summary = deriveZenSessionSummary(history, undefined);
    expect(summary.averageDurationMs).toBeNull();
    expect(summary.totalDurationMs).toBe(0);
  });

  it("averageDurationMs uses only active items, totalDurationMs covers all entries", () => {
    const history: ZenReviewedItem[] = [
      makeItem({ id: "1", rating: "good", durationMs: 1000 }),
      makeItem({ id: "2", rating: "good", durationMs: 3000 }),
      makeItem({ id: "3", rating: "again", durationMs: 5000, undone: true }),
    ];
    const summary = deriveZenSessionSummary(history, undefined);
    // average across active only: (1000 + 3000) / 2 = 2000
    expect(summary.averageDurationMs).toBe(2000);
    // total includes undone entry's recorded duration too
    expect(summary.totalDurationMs).toBe(9000);
  });

  it("forwards startedAt and sets endedAt to a timestamp", () => {
    const summary = deriveZenSessionSummary([], "2026-04-29T01:00:00.000Z");
    expect(summary.startedAt).toBe("2026-04-29T01:00:00.000Z");
    expect(typeof summary.endedAt).toBe("string");
    // Must be a valid ISO date string
    expect(Number.isNaN(Date.parse(summary.endedAt))).toBe(false);
  });
});

describe("formatDurationMs", () => {
  it("returns — for null or non-positive", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(0)).toBe("—");
    expect(formatDurationMs(-100)).toBe("—");
  });

  it("renders sub-minute durations with seconds only", () => {
    expect(formatDurationMs(1000)).toBe("1s");
    expect(formatDurationMs(45_500)).toBe("46s");
  });

  it("renders minute+second for longer durations", () => {
    expect(formatDurationMs(60_000)).toBe("1m 00s");
    expect(formatDurationMs(125_000)).toBe("2m 05s");
  });
});

describe("formatRate", () => {
  it("renders one decimal place percent", () => {
    expect(formatRate(0)).toBe("0.0%");
    expect(formatRate(0.5)).toBe("50.0%");
    expect(formatRate(0.123)).toBe("12.3%");
    expect(formatRate(1)).toBe("100.0%");
  });
});
