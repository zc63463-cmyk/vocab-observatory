"use client";

import { MiniBarChart } from "@/components/ui/MiniBarChart";
import type { DashboardSummary } from "../types";

interface ReviewVolumeBodyProps {
  summary: Pick<DashboardSummary, "reviewVolume7d" | "reviewVolume30d" | "metrics" | "weakestSemanticFields">;
  /** "7d" shows 7-day bars; "30d" shows the trailing 30-day series + weakest fields. */
  range: "7d" | "30d";
}

/**
 * Pure body for the review-volume section. Driven by `range` prop:
 *   - 7d: short bar chart, focused on this week's pulse
 *   - 30d: longer bar chart + weakest semantic fields callout
 */
export function ReviewVolumeBody({ summary, range }: ReviewVolumeBodyProps) {
  if (range === "7d") {
    const data = summary.reviewVolume7d;
    const max = Math.max(...data.map((d) => d.count), 1);
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const peak = Math.max(...data.map((d) => d.count), 0);
    /* Use the actual series length as the divisor instead of a hard-
       coded 7. Normally the server emits 7 entries, but if upstream
       returns fewer (data outage, partial fill, future shorter
       windows) we want "average per day" to mean exactly that. */
    const dailyAverage = data.length > 0 ? Math.round(total / data.length) : 0;

    return (
      <div className="space-y-5">
        <MiniBarChart data={data} maxCount={max} />
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="本周总量" value={total} />
          <Stat label="日均" value={dailyAverage} />
          <Stat label="单日峰值" value={peak} />
        </div>
        <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
          快读这一周节奏是否平稳。若某一天显著高于其他天，可能是补卡，
          也可能是计划堆积——结合『计划 vs 实际』看更准。
        </p>
      </div>
    );
  }

  const data = summary.reviewVolume30d.slice(-14);
  const max = Math.max(...summary.reviewVolume30d.map((d) => d.count), 1);
  const total30d = summary.metrics.reviewed30d;
  const today = summary.reviewVolume30d.at(-1)?.count ?? 0;
  const peak30d = Math.max(...summary.reviewVolume30d.map((d) => d.count), 0);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          最近 14 天（30 日序列尾段）
        </p>
        <MiniBarChart data={data} maxCount={max} accentColor="var(--color-accent-2)" />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="30 日总量" value={total30d} />
        <Stat label="今日" value={today} />
        <Stat label="单日峰值" value={peak30d} />
      </div>

      {summary.weakestSemanticFields.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            最易遗忘的语义场
          </p>
          <div className="mt-3 space-y-2">
            {summary.weakestSemanticFields.map((field) => (
              <div
                key={field.name}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3"
              >
                <span className="font-medium text-[var(--color-ink)]">{field.name}</span>
                <span className="text-sm text-[var(--color-ink-soft)]">
                  {(field.againRate * 100).toFixed(0)}% Again
                  <span className="ml-2 opacity-60">· {field.total} 次</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
