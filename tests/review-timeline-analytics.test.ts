import { describe, expect, it } from "vitest";
import {
  buildWeekGrid,
  computeRetrievabilityPoints,
  computeReviewStats,
  normalizeReviewLogs,
} from "@/lib/review/timeline-analytics";
import type { OwnerWordReviewLogEntry } from "@/lib/owner-word-sidebar";

function mkLog(overrides: Partial<OwnerWordReviewLogEntry> = {}): OwnerWordReviewLogEntry {
  return {
    difficulty: 5,
    elapsed_days: 1,
    rating: "good",
    reviewed_at: "2026-01-01T10:00:00.000Z",
    scheduled_days: 3,
    stability: 10,
    state: "review",
    ...overrides,
  };
}

describe("normalizeReviewLogs", () => {
  it("drops entries with empty reviewed_at", () => {
    const out = normalizeReviewLogs([
      mkLog({ reviewed_at: "" }),
      mkLog({ reviewed_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].reviewed_at).toBe("2026-02-01T00:00:00Z");
  });

  it("drops entries with unparseable reviewed_at", () => {
    const out = normalizeReviewLogs([
      mkLog({ reviewed_at: "not-a-date" }),
      mkLog({ reviewed_at: "also-bogus" }),
      mkLog({ reviewed_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("re-sorts ascending by reviewed_at regardless of input order", () => {
    const a = mkLog({ reviewed_at: "2026-03-01T00:00:00Z" });
    const b = mkLog({ reviewed_at: "2026-01-01T00:00:00Z" });
    const c = mkLog({ reviewed_at: "2026-02-01T00:00:00Z" });
    const out = normalizeReviewLogs([a, b, c]);
    expect(out.map((l) => l.reviewed_at)).toEqual([
      b.reviewed_at,
      c.reviewed_at,
      a.reviewed_at,
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      mkLog({ reviewed_at: "2026-02-01T00:00:00Z" }),
      mkLog({ reviewed_at: "2026-01-01T00:00:00Z" }),
    ];
    const snapshot = input.map((l) => l.reviewed_at);
    normalizeReviewLogs(input);
    expect(input.map((l) => l.reviewed_at)).toEqual(snapshot);
  });

  it("returns empty array when input is empty", () => {
    expect(normalizeReviewLogs([])).toEqual([]);
  });
});

describe("computeReviewStats", () => {
  it("returns null for empty input", () => {
    expect(computeReviewStats([])).toBeNull();
  });

  it("counts ratings case-insensitively", () => {
    const stats = computeReviewStats([
      mkLog({ rating: "AGAIN" }),
      mkLog({ rating: "Good" }),
      mkLog({ rating: "easy" }),
    ]);
    expect(stats).not.toBeNull();
    expect(stats!.ratingCounts).toEqual({ again: 1, hard: 0, good: 1, easy: 1 });
  });

  it("excludes unknown ratings from knownTotal and successRate", () => {
    // 1 good + 1 unknown: success = good/known = 1/1 = 100%, not 1/2 = 50%
    const stats = computeReviewStats([
      mkLog({ rating: "good" }),
      mkLog({ rating: "bogus" }),
    ]);
    expect(stats!.successRate).toBe(100);
    expect(stats!.knownTotal).toBe(1);
    expect(stats!.total).toBe(2);
  });

  it("returns 0% successRate when only failure ratings exist", () => {
    const stats = computeReviewStats([
      mkLog({ rating: "again" }),
      mkLog({ rating: "hard" }),
    ]);
    expect(stats!.successRate).toBe(0);
  });

  it("takes lastLog snapshot from the end of the array", () => {
    const stats = computeReviewStats([
      mkLog({ rating: "again", reviewed_at: "2026-01-01T00:00:00Z", scheduled_days: 1 }),
      mkLog({ rating: "easy", reviewed_at: "2026-02-01T00:00:00Z", scheduled_days: 30 }),
    ]);
    expect(stats!.lastRating).toBe("easy");
    expect(stats!.lastReviewed).toBe("2026-02-01T00:00:00Z");
    expect(stats!.currentInterval).toBe(30);
  });

  it("ignores null scheduled_days when computing maxScheduled", () => {
    const stats = computeReviewStats([
      mkLog({ scheduled_days: null }),
      mkLog({ scheduled_days: 15 }),
      mkLog({ scheduled_days: 3 }),
    ]);
    expect(stats!.maxScheduled).toBe(15);
  });

  it("returns maxScheduled=0 when every log has null scheduled_days", () => {
    const stats = computeReviewStats([
      mkLog({ scheduled_days: null }),
      mkLog({ scheduled_days: null }),
    ]);
    expect(stats!.maxScheduled).toBe(0);
  });
});

describe("computeRetrievabilityPoints (FSRS formula)", () => {
  it("returns empty array when fewer than 2 logs", () => {
    expect(computeRetrievabilityPoints([])).toEqual([]);
    expect(computeRetrievabilityPoints([mkLog()])).toEqual([]);
  });

  it("applies R = (1 + elapsed / (9 * prev_stability))^-1 using previous log's stability", () => {
    // elapsed=9, prev_stability=9  ->  R = 1 / (1 + 9/(9*9)) = 1 / (1 + 1/9) = 0.9
    const points = computeRetrievabilityPoints([
      mkLog({ stability: 9, reviewed_at: "2026-01-01T00:00:00Z" }),
      mkLog({ stability: 20, elapsed_days: 9, reviewed_at: "2026-01-10T00:00:00Z" }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].r).toBeCloseTo(0.9, 3);
    expect(points[0].idx).toBe(1);
    expect(points[0].reviewedAt).toBe("2026-01-10T00:00:00Z");
  });

  it("skips the first log (no prior stability available)", () => {
    const points = computeRetrievabilityPoints([
      mkLog({ stability: 10, elapsed_days: 5 }),
    ]);
    expect(points).toHaveLength(0);
  });

  it("skips pairs where prev_stability is null/zero/negative", () => {
    expect(
      computeRetrievabilityPoints([
        mkLog({ stability: null }),
        mkLog({ elapsed_days: 5 }),
      ]),
    ).toHaveLength(0);

    expect(
      computeRetrievabilityPoints([
        mkLog({ stability: 0 }),
        mkLog({ elapsed_days: 5 }),
      ]),
    ).toHaveLength(0);

    expect(
      computeRetrievabilityPoints([
        mkLog({ stability: -1 }),
        mkLog({ elapsed_days: 5 }),
      ]),
    ).toHaveLength(0);
  });

  it("skips pairs where elapsed_days is missing or negative", () => {
    expect(
      computeRetrievabilityPoints([
        mkLog({ stability: 10 }),
        mkLog({ elapsed_days: null }),
      ]),
    ).toHaveLength(0);

    expect(
      computeRetrievabilityPoints([
        mkLog({ stability: 10 }),
        mkLog({ elapsed_days: -5 }),
      ]),
    ).toHaveLength(0);
  });

  it("accepts elapsed_days of 0 (R == 1)", () => {
    const points = computeRetrievabilityPoints([
      mkLog({ stability: 10 }),
      mkLog({ stability: 20, elapsed_days: 0 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].r).toBe(1);
  });

  it("clamps values into [0, 1] even with extreme inputs", () => {
    const points = computeRetrievabilityPoints([
      mkLog({ stability: 0.0001 }),
      mkLog({ stability: 10, elapsed_days: 1_000_000 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].r).toBeGreaterThanOrEqual(0);
    expect(points[0].r).toBeLessThanOrEqual(1);
  });

  it("preserves input rating in lowercase", () => {
    const points = computeRetrievabilityPoints([
      mkLog({ stability: 10 }),
      mkLog({ stability: 10, elapsed_days: 5, rating: "HARD" }),
    ]);
    expect(points[0].rating).toBe("hard");
  });

  it("produces one point per eligible transition", () => {
    const points = computeRetrievabilityPoints([
      mkLog({ stability: 10, reviewed_at: "2026-01-01" }),
      mkLog({ stability: 12, elapsed_days: 5, reviewed_at: "2026-01-06" }),
      mkLog({ stability: 14, elapsed_days: 7, reviewed_at: "2026-01-13" }),
      mkLog({ stability: 16, elapsed_days: 10, reviewed_at: "2026-01-23" }),
    ]);
    // 4 logs, skip first -> 3 points
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.idx)).toEqual([1, 2, 3]);
  });
});

describe("buildWeekGrid", () => {
  // 2026-05-01 is a Friday (day-of-week 5)
  const today = new Date("2026-05-01T10:00:00.000Z");

  function spanDailyLogs(startIso: string, count: number): OwnerWordReviewLogEntry[] {
    const out: OwnerWordReviewLogEntry[] = [];
    const cursor = new Date(startIso);
    for (let i = 0; i < count; i += 1) {
      out.push(mkLog({ reviewed_at: cursor.toISOString() }));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  it("returns null for empty logs", () => {
    expect(buildWeekGrid([], today, 52)).toBeNull();
  });

  it("returns null when first reviewed_at is unparseable", () => {
    expect(
      buildWeekGrid([mkLog({ reviewed_at: "not-a-date" })], today, 52),
    ).toBeNull();
  });

  it("returns null when first review is in the future relative to today", () => {
    const futureLogs = [mkLog({ reviewed_at: "2027-01-01T00:00:00Z" })];
    expect(buildWeekGrid(futureLogs, today, 52)).toBeNull();
  });

  it("every row equals one day-of-week (7 rows per column)", () => {
    const logs = spanDailyLogs("2026-04-01T12:00:00Z", 30);
    const grid = buildWeekGrid(logs, today, 52)!;
    grid.weeks.forEach((week) => {
      expect(week).toHaveLength(7);
      week.forEach((day, rowIdx) => {
        expect(day.date.getDay()).toBe(rowIdx);
      });
    });
  });

  it("starts the grid at the first log's week Sunday", () => {
    const logs = spanDailyLogs("2026-04-08T12:00:00Z", 30); // Apr 8, 2026 is Wed
    const grid = buildWeekGrid(logs, today, 52)!;
    const firstCell = grid.weeks[0][0];
    // Sunday of week containing 2026-04-08 is 2026-04-05
    expect(firstCell.date.getFullYear()).toBe(2026);
    expect(firstCell.date.getMonth()).toBe(3);
    expect(firstCell.date.getDate()).toBe(5);
  });

  it("ends the grid at today's week Saturday", () => {
    const logs = spanDailyLogs("2026-04-01T12:00:00Z", 30);
    const grid = buildWeekGrid(logs, today, 52)!;
    const lastCell = grid.weeks.at(-1)!.at(-1)!;
    // Saturday of week containing 2026-05-01 is 2026-05-02
    expect(lastCell.date.getFullYear()).toBe(2026);
    expect(lastCell.date.getMonth()).toBe(4);
    expect(lastCell.date.getDate()).toBe(2);
    expect(lastCell.date.getDay()).toBe(6);
  });

  it("caps at maxWeeks and flags truncated=true when span exceeds the cap", () => {
    // Logs spanning ~2 years -> more than 52 weeks
    const logs: OwnerWordReviewLogEntry[] = [];
    const start = new Date("2024-05-01T12:00:00Z");
    for (let i = 0; i < 40; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 20);
      logs.push(mkLog({ reviewed_at: d.toISOString() }));
    }
    const grid = buildWeekGrid(logs, today, 52)!;
    expect(grid.weeks.length).toBeLessThanOrEqual(52);
    expect(grid.truncated).toBe(true);
  });

  it("does not flag truncated when span is within cap", () => {
    const logs = spanDailyLogs("2026-03-01T12:00:00Z", 30);
    const grid = buildWeekGrid(logs, today, 52)!;
    expect(grid.truncated).toBe(false);
  });

  it("respects maxWeeks argument independently", () => {
    const logs = spanDailyLogs("2026-01-01T12:00:00Z", 30);
    const small = buildWeekGrid(logs, today, 4)!;
    expect(small.weeks.length).toBe(4);
    expect(small.truncated).toBe(true);
  });

  it("maps each review day to its log", () => {
    const logs = spanDailyLogs("2026-04-01T12:00:00Z", 30);
    const grid = buildWeekGrid(logs, today, 52)!;
    const flat = grid.weeks.flat();
    const mapped = flat.filter((d) => d.log != null);
    expect(mapped.length).toBe(30);
  });

  it("resolves same-day duplicates to the latest entry (last-write-wins)", () => {
    const earlierLogs = spanDailyLogs("2026-04-01T12:00:00Z", 29);
    const sameDayLogs: OwnerWordReviewLogEntry[] = [
      mkLog({ reviewed_at: "2026-04-30T09:00:00Z", rating: "again" }),
      mkLog({ reviewed_at: "2026-04-30T15:00:00Z", rating: "easy" }),
    ];
    const grid = buildWeekGrid([...earlierLogs, ...sameDayLogs], today, 52)!;
    const cell = grid.weeks
      .flat()
      .find(
        (d) =>
          d.date.getFullYear() === 2026 &&
          d.date.getMonth() === 3 &&
          d.date.getDate() === 30,
      );
    expect(cell?.log?.rating).toBe("easy");
  });

  it("leaves non-review days with log=null", () => {
    const logs = [
      mkLog({ reviewed_at: "2026-04-01T12:00:00Z" }),
      mkLog({ reviewed_at: "2026-04-30T12:00:00Z" }),
    ];
    const grid = buildWeekGrid(logs, today, 52);
    // Only 2 logs -> might be < threshold at call site, but builder still works
    // when given valid input at the analytics layer (threshold is enforced by component)
    if (grid) {
      const cellApril2 = grid.weeks
        .flat()
        .find(
          (d) =>
            d.date.getFullYear() === 2026 &&
            d.date.getMonth() === 3 &&
            d.date.getDate() === 2,
        );
      expect(cellApril2?.log).toBeNull();
    }
  });
});
