"use client";

import Link from "next/link";
import { AnimatedCounter } from "@/components/motion/AnimatedCounter";
import { formatPercent, formatSignedPoints } from "../format";
import type { DashboardSummary } from "../types";

interface TodaySnapshotBodyProps {
  summary: Pick<
    DashboardSummary,
    | "metrics"
    | "configuredDesiredRetention"
    | "fsrsCalibrationGap30d"
    | "ratingDistribution"
    | "activeSession"
  >;
}

/**
 * Pure body for the today-snapshot section. Triggered by the diagonal
 * pattern (1-5-9). Acts as the "executive summary" — re-states the four
 * hero metrics in a denser layout plus the day's headline ratios.
 *
 * Absorbed scope (Phase 4): formerly the desktop layout rendered a
 * separate `TodayNarrative` panel next to the pattern lock, which
 * duplicated most of this body's editorial content. That panel was
 * removed and its two unique pieces — the headline verdict and the
 * streak-milestone language — are now folded in here so they remain
 * reachable through the diagonal-pattern modal.
 */
export function TodaySnapshotBody({ summary }: TodaySnapshotBodyProps) {
  const total = Object.values(summary.ratingDistribution).reduce((a, b) => a + b, 0);
  const againPct = total > 0 ? summary.ratingDistribution.again / total : 0;
  const { dueToday, streakDays } = summary.metrics;
  const drift = summary.fsrsCalibrationGap30d;

  /* Headline verdict (formerly in TodayNarrative). Two-axis call:
       1. load   — based on dueToday count
       2. drift  — FSRS calibration gap sign + magnitude
     The pair is composed into a single sentence so the snapshot opens
     with a single bold takeaway before any tabular numbers. */
  const loadVerdict =
    dueToday === 0
      ? "今日没有到期卡片"
      : dueToday < 15
        ? "今日负载轻松"
        : dueToday < 30
          ? "今日负载适中"
          : "今日负载偏重";
  const driftVerdict =
    Math.abs(drift) < 0.02
      ? "FSRS 校准与目标吻合"
      : drift > 0
        ? "实际遗忘略高于目标"
        : "实际记忆优于目标预期";

  return (
    <div className="space-y-6">
      {/* Headline verdict — single bold sentence pulled from the
          retired TodayNarrative component. */}
      <p className="section-title text-2xl font-semibold leading-snug text-[var(--color-ink)] sm:text-[1.7rem]">
        {loadVerdict}，{driftVerdict}。
      </p>

      {/* Hero stat block */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Hero label="连续天数" value={summary.metrics.streakDays} suffix="d" />
        <Hero label="今日到期" value={summary.metrics.dueToday} tone="warm" />
        <Hero label="今日已复习" value={summary.metrics.reviewedToday} />
        <Hero label="今日新词" value={summary.metrics.todayNewCount} tone="warm" />
      </div>

      {/* Editorial summary */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          一行简报
        </p>
        <p className="mt-2.5 text-base leading-relaxed text-[var(--color-ink)]">
          目标 retention <strong>{formatPercent(summary.configuredDesiredRetention)}</strong>，
          30 日校准偏移 <strong>{formatSignedPoints(summary.fsrsCalibrationGap30d)}</strong>
          {summary.fsrsCalibrationGap30d > 0.02
            ? "（观测遗忘略高于目标，可考虑调高 retention 目标）。"
            : summary.fsrsCalibrationGap30d < -0.02
              ? "（观测优于目标，可适度延长间隔）。"
              : "（拟合良好）。"}
          {total > 0 && (
            <>
              {" "}近期 Again 占比 <strong>{formatPercent(againPct, 1)}</strong>
              {againPct > 0.18 ? "，偏高，注意挑战卡。" : "，节奏稳定。"}
            </>
          )}
        </p>
        {/* Streak-milestone callouts — second piece pulled from the
            retired TodayNarrative. Only renders when there is actually
            something noteworthy to say (≥7 days). */}
        {streakDays >= 7 && (
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            连续学习{" "}
            <strong className="font-semibold tabular-nums text-[var(--color-ink)]">
              {streakDays}
            </strong>{" "}
            天，节奏稳定。
            {streakDays >= 100
              ? " 三位数连续，是真正的复习训练。"
              : streakDays >= 30
                ? " 已达成 30 天习惯里程碑。"
                : ""}
          </p>
        )}
      </div>

      {/* Active session callout */}
      {summary.activeSession && (
        <div className="rounded-2xl border border-[rgba(15,111,98,0.18)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-ink-soft)]">
          <p>
            当前活跃会话进行中，已浏览{" "}
            <strong className="text-[var(--color-ink)]">{summary.activeSession.cards_seen}</strong>{" "}
            张卡片
          </p>
          <Link
            href="/review"
            className="mt-2 inline-block text-xs font-semibold text-[var(--color-accent)] hover:underline"
          >
            继续复习 →
          </Link>
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/review"
          className="inline-flex items-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          开始复习
        </Link>
        <Link
          href="/words"
          className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
        >
          浏览词条
        </Link>
        <Link
          href="/notes"
          className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
        >
          查看笔记
        </Link>
      </div>
    </div>
  );
}

function Hero({
  label,
  value,
  suffix,
  tone = "default",
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "warm";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "warm"
          ? "border-[rgba(178,87,47,0.25)] bg-[var(--color-surface-muted-warm)]"
          : "border-[rgba(15,111,98,0.18)] bg-[var(--color-surface-muted)]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="section-title mt-2 text-3xl font-semibold text-[var(--color-ink)]">
        <AnimatedCounter target={value} />
        {suffix && <span className="text-base text-[var(--color-ink-soft)] ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

