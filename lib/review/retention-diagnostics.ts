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

export interface RetentionDiagnostic {
  againCount: number;
  confidenceInterval: { high: number; low: number } | null;
  desiredRetention: number;
  dueReviews: number;
  gap: number | null;
  gapSignificant: boolean;
  observedRetention: number | null;
  sampleSufficient: boolean;
  suggestionKind: RetentionSuggestionKind;
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
 * Top-level composition. Applies window + due-filter, computes proportion +
 * Wilson CI, and classifies the result against desiredRetention.
 */
export function computeRetentionDiagnostic(
  input: RetentionDiagnosticInput,
): RetentionDiagnostic {
  const windowDays = input.windowDays ?? RETENTION_DIAGNOSTIC_WINDOW_DAYS;
  const now = input.now ?? new Date();

  const windowed = filterLogsWithinWindow(input.logs, now, windowDays);
  const due = filterDueReviews(windowed);
  const dueReviews = due.length;
  const againCount = due.filter((l) => l.rating.toLowerCase() === "again").length;

  const sampleSufficient = dueReviews >= RETENTION_DIAGNOSTIC_MIN_SAMPLES;
  const observedRetention = dueReviews > 0 ? 1 - againCount / dueReviews : null;
  // Wilson is computed on the *success* count (non-again among due reviews).
  const ci =
    dueReviews > 0
      ? computeWilsonInterval(dueReviews - againCount, dueReviews)
      : null;
  const { kind, significant } = classifySuggestion(
    sampleSufficient,
    ci,
    input.desiredRetention,
  );

  return {
    againCount,
    confidenceInterval: ci,
    desiredRetention: input.desiredRetention,
    dueReviews,
    gap:
      observedRetention != null ? observedRetention - input.desiredRetention : null,
    gapSignificant: significant,
    observedRetention,
    sampleSufficient,
    suggestionKind: kind,
    totalReviews: windowed.length,
    windowDays,
  };
}
