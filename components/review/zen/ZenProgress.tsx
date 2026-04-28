"use client";

import { motion } from "framer-motion";
import { useZenReviewContext } from "./ZenReviewProvider";

export function ZenProgress() {
  const { completedCount, totalCount, progress, stats } = useZenReviewContext();

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between text-xs text-[var(--color-ink-soft)] opacity-70">
        <span>{completedCount}/{totalCount}</span>
        {stats && stats.newCards > 0 && (
          <span className="rounded-full border border-[var(--color-pill-border)] bg-[var(--color-pill-bg)] px-2 py-0.5 text-[10px] text-[var(--color-pill-text)]">
            {stats.newCards} 新词
          </span>
        )}
      </div>
      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)] opacity-60">
        <motion.div
          className="h-full rounded-full bg-[var(--color-accent)]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
