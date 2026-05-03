"use client";

import { Badge } from "@/components/ui/Badge";
import { formatPercent } from "../format";
import type { DashboardSummary } from "../types";

interface PresetForecastBodyProps {
  summary: Pick<
    DashboardSummary,
    "retentionForecasts" | "configuredDesiredRetention" | "configuredRetentionForecast"
  >;
}

/**
 * Pure body for the preset-forecast section.
 *
 * Compares Sprint / Balanced / Conservative retention presets to the
 * currently-configured target so the user can see how the next 7 / 14
 * days of workload would shift before retuning.
 */
export function PresetForecastBody({ summary }: PresetForecastBodyProps) {
  const current = summary.configuredRetentionForecast;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
        当前目标：{formatPercent(summary.configuredDesiredRetention)}。
        每个 preset 旁边的差值显示与当前目标相比 7 天内多/少多少卡。
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        {summary.retentionForecasts.map((forecast) => {
          const delta7d = forecast.due7d - current.due7d;
          const delta14d = forecast.due14d - current.due14d;
          const isCurrent =
            Math.abs(forecast.desiredRetention - summary.configuredDesiredRetention) < 0.0005;

          return (
            <div
              key={forecast.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {forecast.label} {formatPercent(forecast.desiredRetention)}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--color-ink-soft)]">
                    {forecast.description}
                  </p>
                </div>
                <Badge tone={delta7d > 0 ? "warm" : "default"}>
                  {isCurrent ? "当前" : `${delta7d >= 0 ? "+" : ""}${delta7d}/7d`}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <Stat label="即时" value={forecast.dueNow} />
                <Stat label="7d" value={forecast.due7d} />
                <Stat label="14d" value={forecast.due14d} />
              </div>

              <p className="mt-2.5 text-[11px] leading-5 text-[var(--color-ink-soft)] opacity-70">
                vs 当前：{delta7d >= 0 ? "+" : ""}{delta7d} / 7d，
                {delta14d >= 0 ? "+" : ""}{delta14d} / 14d
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="text-base font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
