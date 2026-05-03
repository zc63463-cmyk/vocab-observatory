"use client";

import type { DashboardSummary } from "./types";

/**
 * TodayNarrative — editorial prose interpretation of today's readings.
 *
 * Designed for the Console (desktop) layout where the InstrumentCluster
 * already gives the **numeric** readings above. This component provides
 * the **interpretation** — a short paragraph that translates gauges into
 * meaning, in the same way a Bloomberg morning brief translates raw
 * tickers into narrative.
 *
 * Heuristic structure:
 *   - First sentence: today's load + calibration verdict
 *   - Optional follow-ups: streak milestone, again-rate alert
 *
 * Numbers in prose use tabular-nums so figures align across reflows.
 */
export interface TodayNarrativeProps {
  summary: Pick<
    DashboardSummary,
    | "metrics"
    | "configuredDesiredRetention"
    | "fsrsCalibrationGap30d"
    | "ratingDistribution"
    | "activeSession"
  >;
}

export function TodayNarrative({ summary }: TodayNarrativeProps) {
  const { dueToday, reviewedToday, streakDays, todayNewCount } = summary.metrics;
  const drift = summary.fsrsCalibrationGap30d;
  const total = Object.values(summary.ratingDistribution).reduce((a, b) => a + b, 0);
  const againPct = total > 0 ? summary.ratingDistribution.again / total : 0;

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

  const targetPct = Math.round(summary.configuredDesiredRetention * 100);

  return (
    <section className="panel relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
      {/* Editorial flavour: subtle paper-texture-style left rule */}
      <div
        aria-hidden
        className="absolute left-0 top-8 bottom-8 w-px"
        style={{ background: "var(--color-accent)", opacity: 0.4 }}
      />

      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
          Today&apos;s Reading · 今日解读
        </p>

        <p className="section-title mt-3 text-2xl font-semibold leading-snug text-[var(--color-ink)] sm:text-[1.7rem]">
          {loadVerdict}，{driftVerdict}。
        </p>

        <div className="mt-5 space-y-2 text-sm leading-7 text-[var(--color-ink-soft)]">
          <p>
            目标 retention 设定为{" "}
            <strong className="font-semibold text-[var(--color-ink)] tabular-nums">
              {targetPct}%
            </strong>
            ，30 日观测偏移{" "}
            <strong
              className={`font-semibold tabular-nums ${
                Math.abs(drift) < 0.02
                  ? "text-[var(--color-ink)]"
                  : drift > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-teal-700 dark:text-teal-300"
              }`}
            >
              {drift >= 0 ? "+" : ""}
              {(drift * 100).toFixed(1)}pp
            </strong>
            {drift > 0.025
              ? " — 可考虑提升目标至更保守区间。"
              : drift < -0.025
                ? " — 间隔可适度延长，节省复习时间。"
                : "。"}
          </p>

          {streakDays >= 7 && (
            <p>
              连续学习{" "}
              <strong className="font-semibold text-[var(--color-ink)] tabular-nums">
                {streakDays}
              </strong>{" "}
              天，节奏稳定。
              {streakDays >= 30 && " 已达成 30 天习惯里程碑。"}
              {streakDays >= 100 && " 三位数连续，是真正的复习训练。"}
            </p>
          )}

          {againPct > 0.18 && total >= 20 && (
            <p>
              近期 Again 占比{" "}
              <strong className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {Math.round(againPct * 100)}%
              </strong>{" "}
              偏高，对挑战卡多停留几秒、或单独标注重点会有帮助。
            </p>
          )}

          {summary.activeSession && (
            <p className="text-[var(--color-accent)]">
              当前有进行中的复习会话，已浏览{" "}
              <strong className="font-semibold tabular-nums">
                {summary.activeSession.cards_seen}
              </strong>{" "}
              张。
            </p>
          )}

          {reviewedToday > 0 && (
            <p className="opacity-80">
              今日已完成{" "}
              <strong className="font-semibold text-[var(--color-ink)] tabular-nums">
                {reviewedToday}
              </strong>{" "}
              张
              {todayNewCount > 0 && (
                <>
                  ，其中新词{" "}
                  <strong className="font-semibold text-[var(--color-ink)] tabular-nums">
                    {todayNewCount}
                  </strong>{" "}
                  张
                </>
              )}
              。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
