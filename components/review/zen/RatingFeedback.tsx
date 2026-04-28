"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import { RATING_CONFIG } from "./types";

const RATING_COLORS = {
  again: "rgba(178, 87, 47, 0.15)",
  hard: "rgba(243, 220, 162, 0.3)",
  good: "rgba(15, 111, 98, 0.12)",
  easy: "rgba(62, 201, 180, 0.15)",
} as const;

export function RatingFeedback() {
  const { lastRating, phase } = useZenReviewContext();

  const show = phase === "rating" && lastRating !== null;

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
    </AnimatePresence>
  );
}
