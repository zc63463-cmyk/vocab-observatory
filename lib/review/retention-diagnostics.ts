/**
 * Personal retention diagnostic.
 *
 * Given a user's recent review_logs plus their configured desired_retention,
 * compute an honest estimate of the *actual* retention rate at scheduled time,
 * with a 95% confidence interval. Intentionally does NOT emit aggressive
 * "raise/lower retention" prescriptions — those should come from FSRS Optimizer
 * after w-parameter refitting. We only surface observational data.
 *
 * Key design choices vs the naive `ratingDistribution.again / reviewLogs.length`
 * that already lives in `lib/dashboard.ts`:
 *
 * 1. Counts only **due reviews** (elapsed_days >= scheduled_days, scheduled_days >= 1).
 *    Early reviews (cramming, preview) trivially succeed and bias the estimate upward.
 * 2. Uses Wilson score interval instead of normal approximation — correct at small n
 *    and at proportions near 0 or 1.
 * 3. Gates any comparison with desiredRetention behind a minimum sample threshold.
 *
 * All functions are pure; `now` is injected for deterministic tests.
 */

export const RETENTION_DIAGNOSTIC_MIN_SAMPLES = 50;
export const RETENTION_DIAGNOSTIC_WINDOW_DAYS = 90;
/**
 * Per-bucket sample threshold. We keep it lower than the overall threshold
 * because splitting by interval class naturally halves each bucket's count,
 * and demanding 50 per bucket would gate out most real users. 20 still gives
 * a Wilson CI narrow enough to be useful as a directional signal.
 */
export const RETENTION_BUCKET_MIN_SAMPLES = 20;
/**
 * Anki/FSRS convention: reviews with scheduled_days ≥ 21 are "mature"; below
 * that (but ≥ 1, i.e. excluding learning-state) are "young". This threshold
 * is widely used because it roughly corresponds to when FSRS stability has
 * stopped growing linearly and starts to exhibit genuine long-term behavior.
 */
export const RETENTION_MATURE_THRESHOLD_DAYS = 21;
/** 95% two-sided z score. */
export const WILSON_Z_95 = 1.959963984540054;

export interface RetentionDiagnosticLog {
  elapsed_days: number | null;
  rating: string;
  reviewed_at: string;
  scheduled_days: number | null;
}

export interface RetentionDiagnosticInput {
  desiredRetention: number;
  logs: RetentionDiagnosticLog[];
  now?: Date;
  windowDays?: number;
}

export type RetentionSuggestionKind =
  | "above-target"
  | "below-target"
  | "insufficient-data"
  | "on-target";

/**
 * A single retention estimate: fraction of non-"again" answers among due
 * reviews, with a Wilson CI and a classification against the user's target.
 * Applied both to the overall population and to per-interval buckets.
 */
export interface RetentionSlice {
  againCount: number;
  confidenceInterval: { high: number; low: number } | null;
  dueReviews: number;
  gap: number | null;
  gapSignificant: boolean;
  observedRetention: number | null;
  sampleSufficient: boolean;
  suggestionKind: RetentionSuggestionKind;
}

export type RetentionBucketKey = "young" | "mature";

export interface RetentionDiagnostic extends RetentionSlice {
  /**
   * Per-interval-class breakdown. Each bucket applies the same Wilson CI
   * machinery over its own filtered logs, with its own sample-sufficiency
   * threshold. Useful for separating "I'm not learning new cards properly"
   * (young below target) from "my long-term model is off" (mature below target).
   */
  buckets: Record<RetentionBucketKey, RetentionSlice>;
  desiredRetention: number;
  totalReviews: number;
  windowDays: number;
}

/**
 * Wilson score confidence interval for a binomial proportion.
 *
 * More reliable than the normal-approximation "p ± 1.96 * sqrt(p(1-p)/n)"
 * at small n or when p is near 0 or 1 (where normal approx can produce
 * intervals that extend below 0 or above 1).
 *
 * Returns null when total <= 0.
 */
export function computeWilsonInterval(
  successes: number,
  total: number,
  z: number = WILSON_Z_95,
): { high: number; low: number } | null {
  if (!Number.isFinite(successes) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  if (successes < 0 || successes > total) return null;

  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  let low = (center - margin) / denom;
  let high = (center + margin) / denom;
  // Exact bounds at extremes (mathematically 0 or 1; floating-point otherwise overshoots).
  if (successes === 0) low = 0;
  if (successes === total) high = 1;
  // Clamp any residual overshoot from rounding.
  low = Math.max(0, Math.min(1, low));
  high = Math.max(0, Math.min(1, high));
  return { high, low };
}

/**
 * Keeps only logs that measure retention at or past the scheduled review time
 * for a mature card. Rationale:
 *
 * - `scheduled_days >= 1` excludes learning/relearning cards (where
 *   scheduled_days is 0 or fractional) and brand-new cards (null / 0).
 * - `elapsed_days >= scheduled_days` excludes early reviews, which would
 *   inflate the apparent retention rate.
 * - Missing/non-finite values are treated as "not eligible" rather than 0,
 *   since a null elapsed_days could equally well mean a brand-new card.
 */
export function filterDueReviews(
  logs: RetentionDiagnosticLog[],
): RetentionDiagnosticLog[] {
  return logs.filter((log) => {
    const elapsed = log.elapsed_days;
    const scheduled = log.scheduled_days;
    if (elapsed == null || !Number.isFinite(elapsed)) return false;
    if (scheduled == null || !Number.isFinite(scheduled)) return false;
    if (scheduled < 1) return false;
    return elapsed >= scheduled;
  });
}

function filterLogsWithinWindow(
  logs: RetentionDiagnosticLog[],
  now: Date,
  windowDays: number,
): RetentionDiagnosticLog[] {
  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return logs.filter((log) => {
    const t = Date.parse(log.reviewed_at);
    if (!Number.isFinite(t)) return false;
    return t >= cutoffMs && t <= now.getTime();
  });
}

function classifySuggestion(
  sampleSufficient: boolean,
  confidenceInterval: { high: number; low: number } | null,
  desiredRetention: number,
): { kind: RetentionSuggestionKind; significant: boolean } {
  if (!sampleSufficient || !confidenceInterval) {
    return { kind: "insufficient-data", significant: false };
  }
  // CI entirely above desired → observed retention is reliably higher than target.
  if (confidenceInterval.low > desiredRetention) {
    return { kind: "above-target", significant: true };
  }
  // CI entirely below desired → observed retention is reliably lower than target.
  if (confidenceInterval.high < desiredRetention) {
    return { kind: "below-target", significant: true };
  }
  // CI straddles desired → we can't distinguish from target.
  return { kind: "on-target", significant: false };
}

/**
 * Computes a retention slice (proportion + CI + classification) from an
 * already-filtered set of due logs. Broken out so the overall diagnostic
 * and each bucket-level diagnostic share exactly one calculation path.
 */
export function computeSlice(
  dueLogs: RetentionDiagnosticLog[],
  desiredRetention: number,
  minSamples: number,
): RetentionSlice {
  const dueReviews = dueLogs.length;
  const againCount = dueLogs.filter(
    (l) => l.rating.toLowerCase() === "again",
  ).length;
  const sampleSufficient = dueReviews >= minSamples;
  const observedRetention = dueReviews > 0 ? 1 - againCount / dueReviews : null;
  // Wilson is computed on the *success* count (non-again among due reviews).
  const ci =
    dueReviews > 0
      ? computeWilsonInterval(dueReviews - againCount, dueReviews)
      : null;
  const { kind, significant } = classifySuggestion(
    sampleSufficient,
    ci,
    desiredRetention,
  );

  return {
    againCount,
    confidenceInterval: ci,
    dueReviews,
    gap:
      observedRetention != null ? observedRetention - desiredRetention : null,
    gapSignificant: significant,
    observedRetention,
    sampleSufficient,
    suggestionKind: kind,
  };
}

/**
 * Partitions due logs by interval class:
 * - young: 1 ≤ scheduled_days < RETENTION_MATURE_THRESHOLD_DAYS
 * - mature: scheduled_days ≥ RETENTION_MATURE_THRESHOLD_DAYS
 *
 * Assumes inputs are already due-filtered, i.e. scheduled_days is a finite
 * number ≥ 1. (Guaranteed by `filterDueReviews`.)
 */
export function bucketDueLogs(
  dueLogs: RetentionDiagnosticLog[],
): Record<RetentionBucketKey, RetentionDiagnosticLog[]> {
  const young: RetentionDiagnosticLog[] = [];
  const mature: RetentionDiagnosticLog[] = [];
  for (const log of dueLogs) {
    // filterDueReviews guarantees scheduled_days is finite and ≥ 1, but be defensive.
    const days = log.scheduled_days ?? 0;
    if (days >= RETENTION_MATURE_THRESHOLD_DAYS) {
      mature.push(log);
    } else {
      young.push(log);
    }
  }
  return { mature, young };
}

/**
 * Top-level composition. Applies window + due-filter, computes overall
 * proportion + Wilson CI, and additionally splits by interval class to
 * yield per-bucket slices.
 */
export function computeRetentionDiagnostic(
  input: RetentionDiagnosticInput,
): RetentionDiagnostic {
  const windowDays = input.windowDays ?? RETENTION_DIAGNOSTIC_WINDOW_DAYS;
  const now = input.now ?? new Date();

  const windowed = filterLogsWithinWindow(input.logs, now, windowDays);
  const due = filterDueReviews(windowed);
  const overall = computeSlice(
    due,
    input.desiredRetention,
    RETENTION_DIAGNOSTIC_MIN_SAMPLES,
  );
  const { young, mature } = bucketDueLogs(due);
  const youngSlice = computeSlice(
    young,
    input.desiredRetention,
    RETENTION_BUCKET_MIN_SAMPLES,
  );
  const matureSlice = computeSlice(
    mature,
    input.desiredRetention,
    RETENTION_BUCKET_MIN_SAMPLES,
  );

  return {
    ...overall,
    buckets: {
      mature: matureSlice,
      young: youngSlice,
    },
    desiredRetention: input.desiredRetention,
    totalReviews: windowed.length,
    windowDays,
  };
}
