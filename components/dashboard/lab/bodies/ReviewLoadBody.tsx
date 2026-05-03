"use client";

import { Badge } from "@/components/ui/Badge";
import { RetentionDiagnostics } from "@/components/review/RetentionDiagnostics";
import { ReviewRetentionSettings } from "@/components/review/ReviewRetentionSettings";
import { formatPercent, formatSignedPoints } from "../format";
import type { DashboardSummary } from "../types";

interface ReviewLoadBodyProps {
  summary: Pick<
    DashboardSummary,
    | "metrics"
    | "configuredDesiredRetention"
    | "averageDesiredRetention"
    | "configuredRetentionForecast"
    | "fsrsCalibrationGap30d"
    | "fsrsForgettingRate"
    | "forgettingRate30d"
    | "retentionDiagnostic"
    | "activeSession"
  >;
}

/**
 * Pure body for the review-load section.
 *
 * The decision-driving panel: lets the user retune retention target,
 * see calibration gap, run a quick diagnostic, and check the active
 * session at a glance. FSRS training UI is split into its own section
 * (`FsrsTrainingBody`) so this body stays focused on the steady-state
 * retention loop.
 */
export function ReviewLoadBody({ summary }: ReviewLoadBodyProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
          调节目标 retention，观察当前 FSRS 偏差与活跃队列大小。
        </p>
        <Badge tone="warm">{formatPercent(summary.fsrsForgettingRate)} FSRS 期望遗忘</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="跟踪词" value={summary.metrics.trackedWords} />
        <Stat label="今日到期" value={summary.metrics.dueToday} tone="warm" />
        <Stat label="今日已复习" value={summary.metrics.reviewedToday} />
        <Stat
          label="FSRS Gap 30d"
          value={formatSignedPoints(summary.fsrsCalibrationGap30d)}
          tone={summary.fsrsCalibrationGap30d > 0 ? "warm" : "default"}
        />
      </div>

      <ReviewRetentionSettings
        key={summary.configuredDesiredRetention}
        initialDesiredRetention={summary.configuredDesiredRetention}
        averageDesiredRetention={summary.averageDesiredRetention}
        trackedWords={summary.metrics.trackedWords}
      />

      <RetentionDiagnostics diagnostic={summary.retentionDiagnostic} />

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            当前目标
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
            {formatPercent(summary.configuredDesiredRetention)}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">
            活跃卡片平均目标：{formatPercent(summary.averageDesiredRetention)}
          </p>
        </Card>
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            当前预测
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini label="即时" value={summary.configuredRetentionForecast.dueNow} />
            <Mini label="7d" value={summary.configuredRetentionForecast.due7d} />
            <Mini label="14d" value={summary.configuredRetentionForecast.due14d} />
          </div>
        </Card>
      </div>

      {summary.activeSession && (
        <div className="rounded-2xl border border-[rgba(15,111,98,0.18)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-ink-soft)]">
          <p>当前活跃会话已开始</p>
          <p className="mt-1 opacity-80">已浏览 {summary.activeSession.cards_seen} 张卡片</p>
          <p className="mt-1 opacity-80">观测 Again 率 30d：{formatPercent(summary.forgettingRate30d)}</p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warm";
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === "warm"
          ? "border-[rgba(178,87,47,0.25)] bg-[var(--color-surface-muted-warm)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-soft)]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      {children}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="text-base font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
