import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type AppSupabaseClient = SupabaseClient<Database>;

/**
 * One day in the forecast-vs-actual history. `forecastCount` is the
 * morning snapshot we recorded; `actualCount` is the live count of
 * non-undone review_logs for that day. Both are non-negative integers.
 */
export interface PlanVsActualPoint {
  /** YYYY-MM-DD in user-local time. */
  date: string;
  /** Number of reviews actually completed on that day. */
  actualCount: number;
  /** Number of reviews predicted at the start of that day. */
  forecastCount: number;
  /** True for "today" — past days are immutable; today's actual is still climbing. */
  isToday: boolean;
}

/**
 * Idempotent upsert of today's forecast snapshot. We deliberately use
 * `INSERT ... ON CONFLICT DO NOTHING` semantics (via `ignoreDuplicates`)
 * so subsequent dashboard loads on the same day don't overwrite the
 * morning prediction with a mid-day count that's already been deflated
 * by completed reviews. The first hit each day wins.
 *
 * Errors are intentionally swallowed and logged: telemetry must never
 * block the dashboard from rendering.
 */
export async function captureTodayForecastSnapshot(params: {
  supabase: AppSupabaseClient;
  userId: string;
  date: string;
  forecastCount: number;
  desiredRetention: number;
}) {
  const { supabase, userId, date, forecastCount, desiredRetention } = params;
  try {
    const { error } = await supabase
      .from("daily_forecast_snapshots")
      .upsert(
        {
          user_id: userId,
          date,
          forecast_count: Math.max(0, Math.floor(forecastCount)),
          desired_retention: desiredRetention,
        },
        { onConflict: "user_id,date", ignoreDuplicates: true },
      );
    if (error) {
      console.warn("[forecast-snapshots] upsert failed:", error);
    }
  } catch (error) {
    console.warn("[forecast-snapshots] unexpected error:", error);
  }
}

export interface BuildPlanVsActualOptions {
  /**
   * Past-day window. The series always ends on `today`, anchored to the
   * supplied `now`. Default 14 mirrors the look-back used by the existing
   * volume series so the two charts read at the same temporal scale.
   */
  days?: number;
  now?: Date;
}

interface SnapshotRow {
  date: string;
  forecast_count: number;
}

interface ReviewLogDateRow {
  reviewed_at: string;
}

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDayKey(value: string) {
  return formatDayKey(new Date(value));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Pure builder. Given snapshot rows (one per past day) and the raw review
 * logs for the window, emits one `PlanVsActualPoint` per day. Days
 * without a snapshot fall through with `forecastCount: 0` so the chart
 * still draws a continuous x-axis. Tested in isolation — the dashboard
 * code only does the wiring.
 */
export function buildPlanVsActualSeries(
  snapshots: SnapshotRow[],
  reviewLogs: ReviewLogDateRow[],
  options: BuildPlanVsActualOptions = {},
): PlanVsActualPoint[] {
  const days = options.days ?? 14;
  const anchor = new Date(options.now ?? new Date());
  anchor.setHours(0, 0, 0, 0);
  const todayKey = formatDayKey(anchor);

  // Pre-bucket logs by local day so we don't scan them per-row in the
  // O(days) loop below. This keeps the function O(snapshots + logs).
  const actualByDay = new Map<string, number>();
  for (const log of reviewLogs) {
    const key = toLocalDayKey(log.reviewed_at);
    actualByDay.set(key, (actualByDay.get(key) ?? 0) + 1);
  }

  const forecastByDay = new Map<string, number>();
  for (const snap of snapshots) {
    forecastByDay.set(snap.date, snap.forecast_count);
  }

  const points: PlanVsActualPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(anchor, -i);
    const key = formatDayKey(day);
    points.push({
      date: key,
      actualCount: actualByDay.get(key) ?? 0,
      forecastCount: forecastByDay.get(key) ?? 0,
      isToday: key === todayKey,
    });
  }

  return points;
}

/**
 * Loads `days` worth of snapshots for the given user and combines them with
 * the supplied review logs. Pulls slightly extra days as a safety margin
 * in case timezone offsets push the boundary by ±1.
 */
export async function fetchPlanVsActualSeries(params: {
  supabase: AppSupabaseClient;
  userId: string;
  reviewLogs: ReviewLogDateRow[];
  days?: number;
  now?: Date;
}): Promise<PlanVsActualPoint[]> {
  const { supabase, userId, reviewLogs, days = 14, now } = params;
  const anchor = new Date(now ?? new Date());
  anchor.setHours(0, 0, 0, 0);
  const earliest = formatDayKey(addDays(anchor, -(days + 1)));

  const { data, error } = await supabase
    .from("daily_forecast_snapshots")
    .select("date, forecast_count")
    .eq("user_id", userId)
    .gte("date", earliest)
    .order("date", { ascending: false })
    .limit(days + 2);

  if (error) {
    console.warn("[forecast-snapshots] read failed:", error);
    return buildPlanVsActualSeries([], reviewLogs, { days, now });
  }

  return buildPlanVsActualSeries(
    (data ?? []) as SnapshotRow[],
    reviewLogs,
    { days, now },
  );
}
