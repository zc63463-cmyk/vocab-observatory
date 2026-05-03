import { describe, expect, it } from "vitest";
import { buildPlanVsActualSeries } from "@/lib/review/forecast-snapshots";

// 2026-05-01 local midnight — matches the window math deterministically.
const NOW = new Date("2026-05-01T10:00:00");

function day(offset: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

describe("buildPlanVsActualSeries", () => {
  it("returns one point per day in the requested window", () => {
    const points = buildPlanVsActualSeries([], [], { days: 7, now: NOW });
    expect(points).toHaveLength(7);
    // Window is [now-6 .. now], chronologically ascending.
    expect(points[0].date).toBe(day(-6));
    expect(points[6].date).toBe(day(0));
  });

  it("marks only the final day as today", () => {
    const points = buildPlanVsActualSeries([], [], { days: 5, now: NOW });
    const todayFlags = points.map((p) => p.isToday);
    expect(todayFlags).toEqual([false, false, false, false, true]);
  });

  it("fills missing forecast snapshots with zero", () => {
    const points = buildPlanVsActualSeries(
      [{ date: day(-1), forecast_count: 42 }],
      [],
      { days: 3, now: NOW },
    );
    const yesterday = points.find((p) => p.date === day(-1));
    const today = points.find((p) => p.date === day(0));
    expect(yesterday?.forecastCount).toBe(42);
    expect(today?.forecastCount).toBe(0);
  });

  it("aggregates review logs into actual counts bucketed by local day", () => {
    const logs = [
      { reviewed_at: new Date(`${day(-1)}T02:00:00`).toISOString() },
      { reviewed_at: new Date(`${day(-1)}T20:00:00`).toISOString() },
      { reviewed_at: new Date(`${day(0)}T09:00:00`).toISOString() },
    ];
    const points = buildPlanVsActualSeries([], logs, { days: 3, now: NOW });
    const yesterday = points.find((p) => p.date === day(-1));
    const today = points.find((p) => p.date === day(0));
    expect(yesterday?.actualCount).toBe(2);
    expect(today?.actualCount).toBe(1);
  });

  it("ignores logs that fall outside the window", () => {
    const logs = [
      { reviewed_at: new Date(`${day(-30)}T12:00:00`).toISOString() },
    ];
    const points = buildPlanVsActualSeries([], logs, { days: 7, now: NOW });
    const total = points.reduce((sum, p) => sum + p.actualCount, 0);
    expect(total).toBe(0);
  });

  it("defaults to a 14-day window when days is omitted", () => {
    const points = buildPlanVsActualSeries([], [], { now: NOW });
    expect(points).toHaveLength(14);
  });

  it("pairs forecast and actual on the same day", () => {
    const points = buildPlanVsActualSeries(
      [{ date: day(-1), forecast_count: 10 }],
      [{ reviewed_at: new Date(`${day(-1)}T10:00:00`).toISOString() }],
      { days: 3, now: NOW },
    );
    const yesterday = points.find((p) => p.date === day(-1))!;
    expect(yesterday.forecastCount).toBe(10);
    expect(yesterday.actualCount).toBe(1);
  });
});
