"use client";

import { motion } from "framer-motion";
import type { RatingKey } from "./types";
import { RATING_CONFIG } from "./types";

interface ZenRatingDistributionProps {
  again: number;
  hard: number;
  good: number;
  easy: number;
  /** Total active count used as denominator. If 0, all bars render at 0% width. */
  total: number;
}

const ROWS: Array<{ rating: RatingKey; key: keyof Omit<ZenRatingDistributionProps, "total"> }> = [
  { rating: "again", key: "again" },
  { rating: "hard", key: "hard" },
  { rating: "good", key: "good" },
  { rating: "easy", key: "easy" },
];

/**
 * Minimal horizontal-bar rating distribution.
 * - Thin (3px) bars with rating-color fill
 * - Monospace count, serif label
 * - Animates width on mount; reduced-motion users get instant fill via global MotionConfig
 */
export function ZenRatingDistribution({
  again,
  hard,
  good,
  easy,
  total,
}: ZenRatingDistributionProps) {
  const counts = { again, hard, good, easy };

  return (
    <div className="flex flex-col gap-2.5" role="list" aria-label="评分分布">
      {ROWS.map(({ rating, key }) => {
        const count = counts[key];
        const percent = total > 0 ? (count / total) * 100 : 0;
        const color = RATING_CONFIG[rating].color;
        const label = RATING_CONFIG[rating].label;

        return (
          <div
            key={rating}
            role="listitem"
            className="flex items-center gap-3"
          >
            <span
              className="w-12 flex-shrink-0 text-xs text-[var(--color-ink-soft)] opacity-80"
              style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
            >
              {label}
            </span>
            <div
              className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)] opacity-70"
              aria-hidden="true"
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="w-10 flex-shrink-0 text-right font-mono text-xs tabular-nums text-[var(--color-ink-soft)]">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
