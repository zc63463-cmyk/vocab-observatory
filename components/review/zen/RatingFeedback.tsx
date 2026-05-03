"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import {
  RATING_TO_PERCENT,
  computeCalibrationDelta,
  gradeCalibration,
  type CalibrationSeverity,
} from "@/lib/review/calibration";
import { RATING_CONFIG } from "./types";

const RATING_COLORS = {
  again: "rgba(178, 87, 47, 0.15)",
  hard: "rgba(243, 220, 162, 0.3)",
  good: "rgba(15, 111, 98, 0.12)",
  easy: "rgba(62, 201, 180, 0.15)",
} as const;

const SEVERITY_TONE: Record<CalibrationSeverity, { bg: string; ink: string; border: string }> = {
  good: {
    bg: "rgba(15, 111, 98, 0.12)",
    ink: "var(--color-accent)",
    border: "rgba(15, 111, 98, 0.4)",
  },
  ok: {
    bg: "rgba(217, 155, 59, 0.14)",
    ink: "#a8771f",
    border: "rgba(217, 155, 59, 0.45)",
  },
  warn: {
    bg: "rgba(192, 89, 75, 0.14)",
    ink: "var(--color-accent-2)",
    border: "rgba(192, 89, 75, 0.45)",
  },
};

/**
 * Brief overlay shown during phase === "rating" — the ~350 ms window
 * between the user committing a rating and the API persisting it. Two
 * roles in one component:
 *
 *   1. Tints the whole canvas with the rating color so even peripheral
 *      vision registers the commit. Same as the original implementation.
 *
 *   2. NEW: when the user had committed a pre-flip prediction, surface a
 *      single calibration badge ("你预测 75% · 实际 Good (67%) · 差 8%")
 *      so they get immediate metacognitive feedback while their answer
 *      is still fresh. Without this loop, the prediction value would be
 *      a write-only signal — the user couldn't tell whether they're
 *      becoming better calibrated.
 */
export function RatingFeedback() {
  const { lastRating, phase, prediction } = useZenReviewContext();

  const show = phase === "rating" && lastRating !== null;
  const hasPrediction = show && prediction !== null;
  const calibration = hasPrediction
    ? computeCalibrationDelta(prediction!, lastRating!)
    : null;
  const grade = calibration ? gradeCalibration(calibration.absDelta) : null;
  const tone = grade ? SEVERITY_TONE[grade.severity] : null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="feedback"
          className="pointer-events-none fixed inset-0 z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            background: lastRating ? RATING_COLORS[lastRating] : "transparent",
          }}
          aria-hidden="true"
        />
      )}
      {calibration && grade && tone && lastRating && (
        <motion.div
          key="calibration-badge"
          // pointer-events-none so the badge never blocks the rating UI
          // beneath it; aria-live makes the comparison reachable for
          // screen-reader users who can't see the colored tint.
          className="pointer-events-none fixed top-24 left-1/2 z-30 -translate-x-1/2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          aria-live="polite"
        >
          <div
            className="rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur-md sm:text-sm"
            style={{
              background: tone.bg,
              color: tone.ink,
              borderColor: tone.border,
            }}
          >
            <span className="font-mono tabular-nums">{calibration.predicted}%</span>
            <span className="mx-2 opacity-50">→</span>
            <span>
              {RATING_CONFIG[lastRating].label} (
              <span className="font-mono tabular-nums">
                {RATING_TO_PERCENT[lastRating]}%
              </span>
              )
            </span>
            <span className="mx-2 opacity-50">·</span>
            <span className="font-semibold">{grade.label}</span>
            {calibration.absDelta > 0 && (
              <span className="ml-1.5 opacity-70">
                差 <span className="font-mono tabular-nums">{calibration.absDelta}</span>
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
