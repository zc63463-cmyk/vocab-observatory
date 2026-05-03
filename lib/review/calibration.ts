import type { ReviewRating } from "@/types/database.types";

/**
 * Maps each FSRS rating to a "true recall percentage". The 0 / 33 / 67 / 100
 * spacing matches the four-bucket calibration framing the user sees on the
 * front-face slider: again is "I will fail", easy is "I will recall
 * effortlessly". The middle two are equally spaced rather than 33/66 vs
 * 25/75 because we want the predictive UX to read as quartiles when the
 * user thinks of confidence in tens — 33 % rounds to "low-mid" and 67 %
 * rounds to "high-mid" naturally.
 *
 * If we ever swap the front-face slider to a 4-button quick-select
 * (instead of a continuous 0–100 slider), this same table is what powers
 * the quick-select labels.
 */
export const RATING_TO_PERCENT: Record<ReviewRating, number> = {
  again: 0,
  hard: 33,
  good: 67,
  easy: 100,
};

export interface CalibrationDelta {
  /** What the user predicted before flipping, [0, 100]. */
  predicted: number;
  /** What we infer the actual recall percentage to be, [0, 100]. */
  actualPercent: number;
  /** Signed delta = predicted - actualPercent. Positive = overconfident. */
  delta: number;
  /** Magnitude only. Useful for the calibration grade. */
  absDelta: number;
}

export function computeCalibrationDelta(
  predicted: number,
  rating: ReviewRating,
): CalibrationDelta {
  const clamped = clampPercent(predicted);
  const actualPercent = RATING_TO_PERCENT[rating];
  const delta = clamped - actualPercent;
  return {
    predicted: clamped,
    actualPercent,
    delta,
    absDelta: Math.abs(delta),
  };
}

export type CalibrationSeverity = "good" | "ok" | "warn";

export interface CalibrationGrade {
  label: string;
  severity: CalibrationSeverity;
}

/**
 * Maps absolute delta to a label triple. Thresholds are chosen so a user
 * who's within one bucket-width (33 percentage points) is "ok", within
 * half a bucket is "good", and beyond a bucket is "warn". This mirrors
 * the four-bucket nature of FSRS ratings — being one bucket off is
 * semantically equivalent to "I said hard, it was actually good".
 */
export function gradeCalibration(absDelta: number): CalibrationGrade {
  if (absDelta < 17) return { label: "校准良好", severity: "good" };
  if (absDelta < 34) return { label: "可接受偏差", severity: "ok" };
  return { label: "估计偏差较大", severity: "warn" };
}

export interface SessionCalibrationStats {
  /** Number of rated cards that recorded a prediction. */
  count: number;
  /** Mean of |predicted - actual|, in [0, 100]. 0 if count is 0. */
  avgAbsDelta: number;
  /** Cards where predicted > actual. */
  overconfidentCount: number;
  /** Cards where predicted < actual. */
  underconfidentCount: number;
}

export interface CalibrationHistoryEntry {
  predictedRecall: number | null;
  rating: ReviewRating;
  /** Optional: when true, the entry is excluded from the calibration roll-up. */
  undone?: boolean;
}

/**
 * Aggregates per-card calibration into a session-level summary. Cards
 * without a prediction OR cards that were undone are skipped. Skipping
 * undone cards is critical — otherwise a user who experiments with undo
 * would see their accuracy distorted by ratings they themselves rolled back.
 */
export function summarizeSessionCalibration(
  history: ReadonlyArray<CalibrationHistoryEntry>,
): SessionCalibrationStats {
  let count = 0;
  let sumAbsDelta = 0;
  let over = 0;
  let under = 0;

  for (const entry of history) {
    if (entry.undone) continue;
    if (entry.predictedRecall === null) continue;
    const d = computeCalibrationDelta(entry.predictedRecall, entry.rating);
    count += 1;
    sumAbsDelta += d.absDelta;
    if (d.delta > 0) over += 1;
    else if (d.delta < 0) under += 1;
  }

  return {
    count,
    avgAbsDelta: count > 0 ? sumAbsDelta / count : 0,
    overconfidentCount: over,
    underconfidentCount: under,
  };
}

function clampPercent(value: number): number {
  // NaN → 0 (no useful information). +Infinity → 100, -Infinity → 0 so the
  // semantic ordering is preserved: values beyond the high bound get the
  // high clamp, values beyond the low bound get the low clamp.
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}
