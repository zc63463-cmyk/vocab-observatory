"use client";

import { PlanVsActualChart } from "@/components/ui/PlanVsActualChart";
import type { DashboardSummary } from "../types";

interface PlanVsActualBodyProps {
  summary: Pick<DashboardSummary, "planVsActual">;
}

/**
 * Pure body for the plan-vs-actual section. Wraps the existing chart
 * component (`@/components/ui/PlanVsActualChart`) with a short editorial
 * preamble suitable for a modal context.
 */
export function PlanVsActualBody({ summary }: PlanVsActualBodyProps) {
  const data = summary.planVsActual;

  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        暂无数据——完成一次复习后即可对比计划与实际。
      </p>
    );
  }

  const totalForecast = data.reduce((sum, p) => sum + p.forecastCount, 0);
  const totalActual = data.reduce((sum, p) => sum + p.actualCount, 0);
  const ratio = totalForecast > 0 ? totalActual / totalForecast : 0;

  return (
    <div className="space-y-5">
      <PlanVsActualChart data={data} />

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="14d 计划合计" value={totalForecast} />
        <Stat label="14d 实际合计" value={totalActual} />
        <Stat
          label="完成率"
          value={`${Math.round(ratio * 100)}%`}
          tone={ratio < 0.8 ? "warm" : "default"}
        />
      </div>
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
      <p className="mt-1.5 text-xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
