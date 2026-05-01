/**
 * FSRS parameter optimizer.
 *
 * Given a user's review history, fit the 19 w-parameters that govern
 * stability/difficulty growth so the scheduler predicts *this user's*
 * retention instead of the population average baked into ts-fsrs defaults.
 *
 * Pipeline:
 *   review_logs (flat rows)
 *     → group by card (progress_id)
 *     → compute delta_t between consecutive reviews
 *     → map rating strings to FSRS numeric ratings
 *     → FSRSBindingItem[]
 *     → computeParameters() → number[] (length 19)
 *
 * The conversion layer is pure and deterministic — that's what `tests/` target.
 * The computeParameters call is async and uses a WASI binary; wrapped here
 * so callers don't need to import the native binding directly.
 */

import { MIN_REVIEWS_FOR_TRAINING } from "@/lib/review/settings";

// Re-export so existing internal callers that grabbed the constant from
// here keep compiling. New code should import directly from
// `@/lib/review/settings` to avoid bundling the optimizer's WASI binding.
export { MIN_REVIEWS_FOR_TRAINING };

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Ratings FSRS recognises; our DB uses string enum values. */
const RATING_TO_NUMERIC: Record<string, 1 | 2 | 3 | 4> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

/**
 * Log shape we need from the caller. Deliberately looser than our full
 * DB type so this module stays testable without supabase round-trips.
 */
export interface OptimizerLog {
  progress_id: string | null;
  rating: string;
  reviewed_at: string;
}

/**
 * Building block mirroring @open-spaced-repetition/binding's shape without
 * depending on the native classes. Tests can assert against plain objects.
 * Matches the constructor signature of `new FSRSBindingReview(rating, delta_t)`.
 */
export interface OptimizerReview {
  deltaT: number;
  rating: 1 | 2 | 3 | 4;
}

export interface OptimizerItem {
  reviews: OptimizerReview[];
}

/**
 * Groups logs by card, sorts each group chronologically, and emits one
 * OptimizerItem per card with per-review delta_t. Pure function.
 *
 * Skips:
 *   - logs with null/empty progress_id (not attached to a card)
 *   - logs with unrecognised ratings
 *   - logs with unparseable reviewed_at timestamps
 *   - cards whose entire review list got filtered to empty
 *
 * Returns items ordered by first-review timestamp for stability (tests).
 */
export function buildOptimizerItems(logs: OptimizerLog[]): OptimizerItem[] {
  const groups = new Map<string, Array<{ ms: number; rating: 1 | 2 | 3 | 4 }>>();

  for (const log of logs) {
    const cardId = log.progress_id;
    if (!cardId) continue;
    const rating = RATING_TO_NUMERIC[log.rating?.toLowerCase?.()];
    if (!rating) continue;
    const ms = Date.parse(log.reviewed_at);
    if (!Number.isFinite(ms)) continue;

    let bucket = groups.get(cardId);
    if (!bucket) {
      bucket = [];
      groups.set(cardId, bucket);
    }
    bucket.push({ ms, rating });
  }

  const items: Array<{ firstMs: number; item: OptimizerItem }> = [];
  for (const bucket of groups.values()) {
    // Sort chronologically. Stable sort keeps same-instant entries in insertion order.
    bucket.sort((a, b) => a.ms - b.ms);
    if (bucket.length === 0) continue;

    const reviews: OptimizerReview[] = [];
    let prevMs = bucket[0].ms;
    for (let i = 0; i < bucket.length; i += 1) {
      const entry = bucket[i];
      const deltaT =
        i === 0 ? 0 : Math.max(0, Math.floor((entry.ms - prevMs) / DAY_IN_MS));
      reviews.push({ deltaT, rating: entry.rating });
      prevMs = entry.ms;
    }

    items.push({ firstMs: bucket[0].ms, item: { reviews } });
  }

  // Stable ordering: cards that started being reviewed earlier come first.
  // Matches FSRS expectation of chronological training data and makes tests deterministic.
  items.sort((a, b) => a.firstMs - b.firstMs);
  return items.map((entry) => entry.item);
}

export interface TrainOptions {
  /**
   * Whether to fit the short-term (same-day) learning parameters. Enable
   * unless you have a reason not to — matches ts-fsrs default behaviour.
   */
  enableShortTerm?: boolean;
  numRelearningSteps?: number;
  /**
   * Optional progress callback invoked from the optimizer. Receives
   * `(current, total)` iterations. Returning false cancels training.
   */
  progress?: (current: number, total: number) => boolean | undefined | void;
  /**
   * Per-iteration timeout in milliseconds. Null falls back to the binding's
   * own default. Not total wall time — training may take far longer than this.
   */
  timeout?: number;
}

/**
 * Async wrapper around the native optimizer. Imports the binding lazily so
 * environments that never train (or don't have the WASI files available)
 * can still import this module.
 *
 * Throws when review count is below MIN_REVIEWS_FOR_TRAINING; callers
 * should gate the UI before calling this.
 */
export async function trainFsrsWeights(
  logs: OptimizerLog[],
  options: TrainOptions = {},
): Promise<{ sampleSize: number; weights: number[] }> {
  if (logs.length < MIN_REVIEWS_FOR_TRAINING) {
    throw new Error(
      `Insufficient reviews for FSRS training: need at least ${MIN_REVIEWS_FOR_TRAINING}, got ${logs.length}`,
    );
  }

  const items = buildOptimizerItems(logs);
  if (items.length === 0) {
    throw new Error("No valid review groups found after filtering");
  }

  // Dynamic import so the heavier binding (WASI blob) is only loaded when
  // training actually runs — critical for cold-start latency on serverless.
  const binding = await import("@open-spaced-repetition/binding");
  const bindingItems = items.map(
    (item) =>
      new binding.FSRSBindingItem(
        item.reviews.map((r) => new binding.FSRSBindingReview(r.rating, r.deltaT)),
      ),
  );

  const weights = await binding.computeParameters(bindingItems, {
    enableShortTerm: options.enableShortTerm ?? true,
    numRelearningSteps: options.numRelearningSteps,
    progress: options.progress,
    timeout: options.timeout,
  });

  return { sampleSize: logs.length, weights };
}
