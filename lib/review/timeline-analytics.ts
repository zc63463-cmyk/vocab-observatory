import type { OwnerWordReviewLogEntry } from "@/lib/owner-word-sidebar";

export type ReviewRatingKey = "again" | "hard" | "good" | "easy";

export interface ReviewStats {
  currentInterval: number | null;
  knownTotal: number;
  lastRating: string;
  lastReviewed: string;
  maxScheduled: number;
  ratingCounts: Record<ReviewRatingKey, number>;
  successRate: number;
  total: number;
}

export interface RetrievabilityPoint {
  idx: number;
  r: number;
  rating: string;
  reviewedAt: string;
}

export interface WeekGridDay {
  date: Date;
  log: OwnerWordReviewLogEntry | null;
}

export interface WeekGrid {
  truncated: boolean;
  weeks: WeekGridDay[][];
}

const RATING_KEYS: readonly ReviewRatingKey[] = ["again", "hard", "good", "easy"];

function isKnownRating(value: string): value is ReviewRatingKey {
  return (RATING_KEYS as readonly string[]).includes(value);
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Drops log entries whose reviewed_at is missing or unparseable, and returns a
 * new array sorted ascending by reviewed_at (ISO strings sort lexicographically).
 * Never mutates the input.
 */
export function normalizeReviewLogs(
  logs: OwnerWordReviewLogEntry[],
): OwnerWordReviewLogEntry[] {
  return logs
    .filter((log) => {
      if (!log.reviewed_at) return false;
      return Number.isFinite(Date.parse(log.reviewed_at));
    })
    .slice()
    .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
}

/**
 * Aggregates rating counts, success rate, and the latest-review snapshot.
 * successRate uses knownTotal (ratings matching RATING_KEYS) as denominator so
 * unknown labels (e.g. "learn") don't silently drag down the number.
 * Returns null when there are no logs.
 */
export function computeReviewStats(
  logs: OwnerWordReviewLogEntry[],
): ReviewStats | null {
  if (logs.length === 0) return null;

  const ratingCounts: Record<ReviewRatingKey, number> = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  };
  let knownTotal = 0;

  for (const log of logs) {
    const key = log.rating.toLowerCase();
    if (isKnownRating(key)) {
      ratingCounts[key] += 1;
      knownTotal += 1;
    }
  }

  const lastLog = logs[logs.length - 1];
  const scheduledDays = logs
    .map((l) => l.scheduled_days)
    .filter((d): d is number => d != null);
  const maxScheduled = scheduledDays.length > 0 ? Math.max(...scheduledDays) : 0;
  const successCount = ratingCounts.good + ratingCounts.easy;
  const successRate =
    knownTotal > 0 ? Math.round((successCount / knownTotal) * 100) : 0;

  return {
    currentInterval: lastLog.scheduled_days,
    knownTotal,
    lastRating: lastLog.rating,
    lastReviewed: lastLog.reviewed_at,
    maxScheduled,
    ratingCounts,
    successRate,
    total: logs.length,
  };
}

/**
 * FSRS-style retrievability at each review attempt:
 *   R = (1 + elapsed_days / (9 * prev_stability)) ^ -1
 *
 * Uses the PREVIOUS log's stability because it represents the memory strength
 * at the moment of recall. The first log has no prior stability and is skipped.
 * Entries with missing/negative/zero stability or invalid elapsed_days are skipped.
 * Output values are clamped to [0, 1] to guard against floating-point overshoot.
 */
export function computeRetrievabilityPoints(
  logs: OwnerWordReviewLogEntry[],
): RetrievabilityPoint[] {
  if (logs.length < 2) return [];

  const points: RetrievabilityPoint[] = [];
  for (let i = 1; i < logs.length; i += 1) {
    const log = logs[i];
    const prev = logs[i - 1];
    const elapsed = log.elapsed_days;
    const prevStability = prev.stability;

    if (
      elapsed == null ||
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      prevStability == null ||
      !Number.isFinite(prevStability) ||
      prevStability <= 0
    ) {
      continue;
    }

    const r = 1 / (1 + elapsed / (9 * prevStability));
    if (!Number.isFinite(r)) continue;

    points.push({
      idx: i,
      r: Math.max(0, Math.min(1, r)),
      rating: log.rating.toLowerCase(),
      reviewedAt: log.reviewed_at,
    });
  }
  return points;
}

/**
 * Builds a GitHub-style 7-row week grid spanning from the Sunday of the first
 * review's week through the Saturday of `today`'s week. Caps at the most recent
 * `maxWeeks` columns so the rendered cells stay readable.
 *
 * @param logs - Must already be normalized (sorted ascending, valid dates).
 * @param today - Injected for deterministic tests; callers may pass `new Date()`.
 * @param maxWeeks - Upper bound on columns; when the logical span exceeds this,
 *   the oldest weeks are dropped and `truncated` is set to true.
 * @returns null when logs are empty or first reviewed_at is invalid.
 */
export function buildWeekGrid(
  logs: OwnerWordReviewLogEntry[],
  today: Date,
  maxWeeks: number,
): WeekGrid | null {
  if (logs.length === 0) return null;

  const firstDate = new Date(logs[0].reviewed_at);
  if (Number.isNaN(firstDate.getTime())) return null;
  firstDate.setHours(0, 0, 0, 0);

  const todayAtMidnight = new Date(today);
  todayAtMidnight.setHours(0, 0, 0, 0);

  // Never let the start land after the end (would yield 0 weeks + negative width)
  if (firstDate.getTime() > todayAtMidnight.getTime()) return null;

  const start = new Date(firstDate);
  start.setDate(firstDate.getDate() - firstDate.getDay());
  const end = new Date(todayAtMidnight);
  end.setDate(todayAtMidnight.getDate() + (6 - todayAtMidnight.getDay()));

  const dayMap = new Map<string, OwnerWordReviewLogEntry>();
  for (const log of logs) {
    const parsed = new Date(log.reviewed_at);
    if (Number.isNaN(parsed.getTime())) continue;
    // Last-write-wins: normalized logs are ascending, so latest same-day wins.
    dayMap.set(localDayKey(parsed), log);
  }

  const weeks: WeekGridDay[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: WeekGridDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ date: new Date(cursor), log: dayMap.get(localDayKey(cursor)) ?? null });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const truncated = weeks.length > maxWeeks;
  if (truncated) {
    weeks.splice(0, weeks.length - maxWeeks);
  }

  return { truncated, weeks };
}
