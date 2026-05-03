"use client";

import { Badge } from "@/components/ui/Badge";
import { formatPercent, formatSignedPoints } from "../format";
import type { DashboardSummary } from "../types";

interface RetentionGapBodyProps {
  summary: Pick<
    DashboardSummary,
    "retentionGapSeries14d" | "fsrsCalibrationGap30d" | "forgettingRate30d"
  >;
}

/**
 * Pure body for the retention-gap section. Renders the 14-day positive /
 * negative gap series + summary stats + a brief explanation of what the
 * sign means.
 *
 * Visual encoding (preserved from the previous panel-blur dashboard
 * design that has since been folded into this lab module):
 *   - positive (warm) bars  = above tolerance
 *   - negative (cool) bars  = below tolerance
 *   - neutral (muted) bars  = no reviews that day
 */
export function RetentionGapBody({ summary }: RetentionGapBodyProps) {
  const series = summary.retentionGapSeries14d;
  const activeDays = series.filter((d) => d.reviewCount > 0);
  const avgGap14d =
    activeDays.length > 0
      ? activeDays.reduce((sum, d) => sum + d.gap, 0) / activeDays.length
      : 0;
  const aboveTargetDays = activeDays.filter((d) => d.gap > 0).length;

  if (series.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">暂无 retention 趋势数据。</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
          正值 = 观测 Again 率高于目标允许的遗忘率（实际更难记住）。
          负值 = 观测优于目标（卡片可能可以拉长间隔）。
        </p>
        <Badge tone={avgGap14d > 0 ? "warm" : "default"}>
          {formatSignedPoints(avgGap14d)} 平均
        </Badge>
      </div>

      <div className="grid grid-cols-7 gap-2 sm:grid-cols-14">
        {series.map((item) => {
          const barHeight =
            item.reviewCount === 0
              ? 10
              : Math.max(16, Math.min(96, Math.abs(item.gap) * 220));
          const barColor =
            item.reviewCount === 0
              ? "rgba(120, 135, 130, 0.45)"
              : item.gap > 0
                ? "#f59e0b"
                : "#0f766e";

          return (
            <div key={item.date} className="min-w-0">
              <div
                className="flex h-28 items-end justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-2"
                title={`${item.date}: ${formatSignedPoints(item.gap, 1)} gap, ${formatPercent(item.againRate, 1)} Again, ${item.reviewCount} 次复习`}
              >
                <div
                  className="w-full rounded-full"
                  style={{ backgroundColor: barColor, height: `${barHeight}px` }}
                />
              </div>
              <p className="mt-1.5 text-center text-[10px] leading-tight text-[var(--color-ink-soft)]">
                {item.date.slice(5)}
              </p>
              <p className="text-center text-[10px] leading-tight text-[var(--color-ink-soft)] opacity-60">
                {item.reviewCount}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="施压天数">
          <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
            {aboveTargetDays}/{activeDays.length || 14}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
            观测遗忘超出目标容忍度的天数。
          </p>
        </Card>
        <Card title="最近活跃日">
          {activeDays.at(-1) ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                {formatSignedPoints(activeDays.at(-1)!.gap)}
              </p>
              <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
                {activeDays.at(-1)!.date}：{formatPercent(activeDays.at(-1)!.againRate)} Again
                vs {formatPercent(activeDays.at(-1)!.targetForgettingRate)} 目标遗忘
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">最近 14 天没有复习记录。</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        {title}
      </p>
      {children}
    </div>
  );
}
