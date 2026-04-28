import type { ZenReviewedItem } from "./types";

/**
 * Local, session-scoped summary derived purely from the in-memory `sessionHistory`.
 * Never persisted, never written to the DB. Refresh = lost (by design).
 */
export interface ZenSessionSummary {
  totalReviewed: number;
  activeReviewed: number;
  undoneCount: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  /** againCount / activeReviewed; 0 when activeReviewed === 0 */
  againRate: number;
  /** Sum of durationMs for items where it was recorded (active + undone) */
  totalDurationMs: number;
  /** Average across only active (non-undone) items that have durationMs */
  averageDurationMs: number | null;
  startedAt?: string;
  endedAt: string;
}

/**
 * Derive summary from history + optional session start time.
 *
 * Rules (per Phase 0.1 spec):
 * 1. totalReviewed counts ALL successful ratings (incl. undone).
 * 2. activeReviewed counts only undone === false.
 * 3. Rating distribution counts only ACTIVE (undone === false) items.
 * 4. againRate = againCount / activeReviewed; 0 when activeReviewed = 0.
 * 5. averageDurationMs is null if no active items have a recorded durationMs.
 */
export function deriveZenSessionSummary(
  history: ZenReviewedItem[],
  startedAt: string | undefined,
): ZenSessionSummary {
  const totalReviewed = history.length;
  const activeItems = history.filter((h) => !h.undone);
  const activeReviewed = activeItems.length;
  const undoneCount = totalReviewed - activeReviewed;

  const againCount = activeItems.filter((h) => h.rating === "again").length;
  const hardCount = activeItems.filter((h) => h.rating === "hard").length;
  const goodCount = activeItems.filter((h) => h.rating === "good").length;
  const easyCount = activeItems.filter((h) => h.rating === "easy").length;

  const againRate = activeReviewed > 0 ? againCount / activeReviewed : 0;

  const durationsActive = activeItems
    .map((h) => h.durationMs)
    .filter((d): d is number => typeof d === "number");
  const totalDurationActive = durationsActive.reduce((sum, d) => sum + d, 0);
  const averageDurationMs =
    durationsActive.length > 0
      ? Math.round(totalDurationActive / durationsActive.length)
      : null;

  // totalDurationMs covers all history entries that have a recorded duration
  const totalDurationMs = history
    .map((h) => h.durationMs)
    .filter((d): d is number => typeof d === "number")
    .reduce((sum, d) => sum + d, 0);

  return {
    totalReviewed,
    activeReviewed,
    undoneCount,
    againCount,
    hardCount,
    goodCount,
    easyCount,
    againRate,
    totalDurationMs,
    averageDurationMs,
    startedAt,
    endedAt: new Date().toISOString(),
  };
}

/** mm:ss formatter for compact duration display. Returns "—" for null/0. */
export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/** "12.3%" formatter for ratios. */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
