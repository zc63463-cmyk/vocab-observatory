"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useZenReviewContext } from "./ZenReviewProvider";

export function ZenExitButton() {
  const { exit } = useZenReviewContext();

  return (
    <motion.button
      type="button"
      onClick={exit}
      className="
        fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center
        rounded-full border border-[var(--color-border)] bg-[var(--color-surface-glass)]
        text-[var(--color-ink-soft)] backdrop-blur-sm
        transition-colors hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)]
        sm:right-6 sm:top-6 sm:h-12 sm:w-12
      "
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label="退出禅意模式"
      title="退出禅意模式 (Esc)"
    >
      <X className="h-5 w-5 sm:h-6 sm:w-6" />
    </motion.button>
  );
}
