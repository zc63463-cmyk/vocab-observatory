import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { buildRetentionForecast, buildRetentionGapSeries } from "@/lib/dashboard";

describe("dashboard retention helpers", () => {
  it("builds a daily gap series from observed misses and logged desired retention", () => {
    const series = buildRetentionGapSeries(
      3,
      [
        {
          metadata: { desired_retention: 0.9 },
          rating: "again",
          reviewed_at: "2026-05-01T09:00:00.000Z",
        },
        {
          metadata: { desired_retention: 0.95 },
          rating: "good",
          reviewed_at: "2026-05-02T09:00:00.000Z",
        },
        {
          metadata: null,
          rating: "again",
          reviewed_at: "2026-05-02T12:00:00.000Z",
        },
      ],
      0.9,
      new Date("2026-05-03T10:00:00.000Z"),
    );

    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({
      date: "2026-05-01",
      reviewCount: 1,
    });
    expect(series[0].againRate).toBe(1);
    expect(series[0].targetForgettingRate).toBeCloseTo(0.1);
    expect(series[0].gap).toBeCloseTo(0.9);

    expect(series[1]).toMatchObject({
      date: "2026-05-02",
      reviewCount: 2,
    });
    expect(series[1].againRate).toBeCloseTo(0.5);
    expect(series[1].targetForgettingRate).toBeCloseTo(0.075);
    expect(series[1].gap).toBeCloseTo(0.425);

    expect(series[2]).toEqual({
      againRate: 0,
      date: "2026-05-03",
      gap: 0,
      reviewCount: 0,
      targetForgettingRate: 0,
    });
  });

  it("forecasts higher workload for higher desired retention while excluding suspended cards", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const progressRows = [
      {
        desired_retention: 0.9,
        due_at: "2026-05-21T10:00:00.000Z",
        scheduler_payload: {
          difficulty: 4.5,
          due: "2026-05-21T10:00:00.000Z",
          elapsed_days: 8,
          lapses: 1,
          learning_steps: 0,
          last_review: "2026-04-23T10:00:00.000Z",
          reps: 12,
          scheduled_days: 20,
          stability: 22,
          state: State.Review,
        },
        state: "review",
      },
      {
        desired_retention: 0.9,
        due_at: "2026-05-03T10:00:00.000Z",
        scheduler_payload: null,
        state: "learning",
      },
      {
        desired_retention: 0.9,
        due_at: "2026-04-30T10:00:00.000Z",
        scheduler_payload: null,
        state: "suspended",
      },
    ];

    const conservative = buildRetentionForecast(progressRows, 0.85, now);
    const balanced = buildRetentionForecast(progressRows, 0.9, now);
    const sprint = buildRetentionForecast(progressRows, 0.97, now);

    expect(conservative).toEqual({
      desiredRetention: 0.85,
      due14d: 1,
      due7d: 1,
      dueNow: 0,
    });
    expect(balanced).toEqual({
      desiredRetention: 0.9,
      due14d: 2,
      due7d: 1,
      dueNow: 0,
    });
    expect(sprint).toEqual({
      desiredRetention: 0.97,
      due14d: 2,
      due7d: 2,
      dueNow: 1,
    });
  });
});
