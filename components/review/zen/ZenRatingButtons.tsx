"use client";

import { motion } from "framer-motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import { RATING_CONFIG } from "./types";
import type { RatingKey } from "./types";

const RATING_STYLES: Record<RatingKey, { bg: string; text: string; border: string }> = {
  again: {
    bg: "bg-[rgba(178,87,47,0.12)]",
    text: "text-[var(--color-accent-2)]",
    border: "border-[rgba(178,87,47,0.2)]",
  },
  hard: {
    bg: "bg-[rgba(243,220,162,0.55)]",
    text: "text-[var(--color-ink)]",
    border: "border-[rgba(243,220,162,0.8)]",
  },
  good: {
    bg: "bg-[var(--color-surface-muted)]",
    text: "text-[var(--color-accent)]",
    border: "border-[rgba(15,111,98,0.16)]",
  },
  easy: {
    bg: "bg-[rgba(15,111,98,0.2)]",
    text: "text-[var(--color-accent)]",
    border: "border-[rgba(15,111,98,0.3)]",
  },
};

export function ZenRatingButtons() {
  const { rate, phase, isAnimating } = useZenReviewContext();
  const canRate = phase === "back" && !isAnimating;

  return (
    <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
      {(Object.keys(RATING_CONFIG) as RatingKey[]).map((key) => {
        const config = RATING_CONFIG[key];
        const styles = RATING_STYLES[key];
        
        return (
          <motion.button
            key={key}
            type="button"
            disabled={!canRate}
            onClick={() => rate(key)}
            className={`
              flex min-w-[80px] flex-col items-center justify-center rounded-2xl border px-4 py-3
              transition-all duration-150
              ${styles.bg} ${styles.text} ${styles.border}
              disabled:cursor-not-allowed disabled:opacity-50
              hover:scale-105 hover:opacity-90 active:scale-95
              sm:min-w-[100px] sm:px-6 sm:py-4
            `}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-sm font-semibold sm:text-base">
              {config.label}
            </span>
            <span className="mt-1 flex items-center gap-1 text-[10px] opacity-70 sm:text-xs">
              <kbd className="rounded border border-current/20 px-1">{config.key}</kbd>
              <span className="hidden sm:inline">/</span>
              <kbd className="hidden rounded border border-current/20 px-1 sm:inline">{config.vimKey}</kbd>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
