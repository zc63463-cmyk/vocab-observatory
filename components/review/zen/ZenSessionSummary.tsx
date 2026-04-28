"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { springs } from "@/components/motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import { ZenSessionMetric } from "./ZenSessionMetric";
import { ZenRatingDistribution } from "./ZenRatingDistribution";
import {
  deriveZenSessionSummary,
  formatDurationMs,
  formatRate,
} from "./derive-session-summary";

/**
 * Phase 0.1: Calm, restrained session summary panel.
 * Renders only when phase === "done" AND sessionHistory has at least one entry.
 *
 * Design constraints (per spec):
 * - Pure local derivation (no API)
 * - No big colorful charts; thin bars only
 * - Numbers in monospace, labels/headings in serif
 * - Lighter glass card than the main flashcard
 * - Light/dark friendly via CSS vars
 * - Reduced-motion: framer-motion's MotionConfig handles the global flag
 */
export function ZenSessionSummary() {
  const { uiState, session, exit, toggleHistory } = useZenReviewContext();
  const { sessionHistory } = uiState;

  const summary = useMemo(
    () => deriveZenSessionSummary(sessionHistory, session?.started_at),
    [sessionHistory, session?.started_at],
  );

  return (
    <motion.div
      key="zen-session-summary"
      className="flex min-h-[80vh] w-full flex-col items-center justify-center px-4 py-12"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      <div
        className="
          relative w-full max-w-xl
          rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-surface)]/60 backdrop-blur-sm
          px-6 py-8 sm:px-10 sm:py-10
          shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]
        "
      >
        {/* Header */}
        <div className="flex flex-col items-start gap-2">
          <span
            className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)] opacity-60"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            Session ended
          </span>
          <h2
            className="text-2xl font-semibold text-[var(--color-ink)] sm:text-3xl"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            本次会话已完成
          </h2>
        </div>

        {/* Hero metrics */}
        <div className="mt-8 grid grid-cols-3 gap-4 sm:gap-6">
          <ZenSessionMetric
            label="Reviewed"
            value={summary.activeReviewed}
            hint={
              summary.undoneCount > 0
                ? `of ${summary.totalReviewed} · excludes ${summary.undoneCount} undone`
                : "excludes undone"
            }
            tone="primary"
          />
          <ZenSessionMetric
            label="Again rate"
            value={summary.activeReviewed > 0 ? formatRate(summary.againRate) : "—"}
            tone="default"
          />
          <ZenSessionMetric
            label="Undone"
            value={summary.undoneCount}
            tone={summary.undoneCount > 0 ? "default" : "muted"}
          />
        </div>

        {/* Divider */}
        <div className="my-8 h-px w-full bg-[var(--color-border)] opacity-50" />

        {/* Rating distribution */}
        <div className="flex flex-col gap-3">
          <span
            className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-soft)] opacity-60"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            Distribution
          </span>
          <ZenRatingDistribution
            again={summary.againCount}
            hard={summary.hardCount}
            good={summary.goodCount}
            easy={summary.easyCount}
            total={summary.activeReviewed}
          />
        </div>

        {/* Time metrics row */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6">
          <ZenSessionMetric
            label="Total time"
            value={formatDurationMs(summary.totalDurationMs)}
            tone="muted"
          />
          <ZenSessionMetric
            label="Avg / card"
            value={formatDurationMs(summary.averageDurationMs)}
            tone="muted"
          />
        </div>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={toggleHistory}
            className="
              rounded-full border border-[var(--color-border)]
              bg-transparent px-5 py-2.5 text-sm
              text-[var(--color-ink-soft)] transition
              hover:border-[var(--color-accent)]/30 hover:text-[var(--color-ink)]
            "
            title="按 H 打开记录"
          >
            查看记录
          </button>
          <button
            type="button"
            onClick={exit}
            className="
              rounded-full bg-[var(--color-accent)] px-5 py-2.5
              text-sm font-semibold text-white transition hover:opacity-90
            "
            title="按 Enter 或 Esc 返回"
          >
            返回复习页
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-6 text-[11px] text-[var(--color-ink-soft)] opacity-50">
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>
          <span className="mx-1.5">/</span>
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[10px]">
            Esc
          </kbd>
          <span className="ml-2">返回</span>
          <span className="mx-2">·</span>
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[10px]">
            H
          </kbd>
          <span className="ml-2">查看记录</span>
        </p>
      </div>
    </motion.div>
  );
}
