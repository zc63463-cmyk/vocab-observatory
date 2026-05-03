"use client";

import { formatPercent, getLoadColor } from "../format";
import type { DashboardSummary } from "../types";
import type { DailyForecastDay } from "@/lib/dashboard";

interface ForecastCalendarBodyProps {
  summary: Pick<DashboardSummary, "dailyForecast" | "configuredDesiredRetention">;
  /** Compact mode = mobile featured surface; standard = modal-internal. */
  variant?: "compact" | "standard";
}

/**
 * Pure body for the forecast calendar.
 *
 * Variants:
 *   - `"compact"` (default mobile featured + desktop ObservationDeck):
 *     drops the legend and suggestion banner, forces a 7-wide grid so
 *     the calendar lays out as 2 rows × 7 days regardless of host width.
 *   - `"standard"` (SectionModal drill-down): includes the legend, the
 *     ForecastSuggestion banner, and unfolds to a single 14-wide row at
 *     `lg` for at-a-glance fortnight reading.
 */
export function ForecastCalendarBody({ summary, variant = "standard" }: ForecastCalendarBodyProps) {
  const days = summary.dailyForecast;

  if (days.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">暂无预测数据。</p>;
  }

  /* Grid breakpoint strategy:
     - "standard" (modal-internal, always wide ≥ ~720px) expands to a
       single row of 14 at lg so the whole fortnight reads left-to-right.
     - "compact" stays 7-wide at *all* widths so it renders as 2 rows of
       7 regardless of host size. This is crucial for the desktop
       ObservationDeck, where the calendar lives in a ~500px half-column
       at lg — forcing 14-in-a-row there would squeeze cells to ~30px. */
  const gridClass =
    variant === "compact"
      ? "grid grid-cols-7 gap-1.5 sm:gap-2"
      : "grid grid-cols-7 gap-1.5 sm:gap-2 lg:grid-cols-14";

  return (
    <div className="space-y-5">
      <div className={gridClass}>
        {days.map((day) => (
          <DayCell key={day.date} day={day} compact={variant === "compact"} />
        ))}
      </div>

      {variant === "standard" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
              负载等级
            </span>
            {[
              { label: "轻", color: "#0f766e" },
              { label: "中", color: "#3b82f6" },
              { label: "较高", color: "#f59e0b" },
              { label: "重", color: "#ef4444" },
            ].map((level) => (
              <span key={level.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: level.color }}
                />
                <span className="text-xs text-[var(--color-ink-soft)]">{level.label}</span>
              </span>
            ))}
          </div>

          <ForecastSuggestion days={days} />

          <p className="text-[11px] leading-relaxed text-[var(--color-ink-soft)] opacity-70">
            基于当前 retention 目标 {formatPercent(summary.configuredDesiredRetention)} 配算的未来 14 天每日到期量。
            浅色填充代表预计到期，深色绿条覆盖代表当天实际已完成。
          </p>
        </>
      )}
    </div>
  );
}

function DayCell({ day, compact }: { day: DailyForecastDay; compact: boolean }) {
  const color = getLoadColor(day.dueCount);
  const hasActual = day.actualReviewCount !== null;

  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl border p-2 transition-all ${
        day.isToday
          ? "border-[var(--color-accent)] bg-[var(--color-surface)] shadow-sm"
          : "border-[var(--color-border)] bg-[var(--color-surface-soft)]"
      } ${day.isPast ? "opacity-60" : ""}`}
    >
      {day.isToday && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
          今天
        </span>
      )}
      <p className="text-[10px] font-medium text-[var(--color-ink-soft)]">周{day.weekday}</p>
      <p className="text-[10px] text-[var(--color-ink-soft)] opacity-70">{day.dateLabel}</p>

      <div className="mt-1.5 flex w-full flex-col items-center gap-0.5">
        {hasActual ? (
          <div className="relative h-7 w-full">
            <div
              className="absolute bottom-0 w-full rounded-t-md opacity-25"
              style={{
                backgroundColor: color,
                height: `${Math.min(100, Math.max(8, day.dueCount * 2))}%`,
              }}
            />
            <div
              className="absolute bottom-0 w-full rounded-t-md"
              style={{
                backgroundColor: "#22c55e",
                height: `${Math.min(100, Math.max(4, (day.actualReviewCount ?? 0) * 2))}%`,
              }}
            />
          </div>
        ) : (
          <div className="flex h-7 w-full items-end justify-center rounded-t-md" style={{ backgroundColor: `${color}20` }}>
            <div
              className="w-full rounded-t-md transition-all"
              style={{
                backgroundColor: color,
                height: `${Math.min(100, Math.max(6, day.dueCount * 2))}%`,
              }}
            />
          </div>
        )}
        <span
          className={`font-bold ${compact ? "text-sm" : "text-base"}`}
          style={{ color: day.dueCount > 0 ? color : "var(--color-ink-soft)" }}
        >
          {day.dueCount}
        </span>
      </div>

      {hasActual && !compact && (
        <p className="text-[9px] leading-tight text-emerald-600 dark:text-emerald-400">
          实际 {day.actualReviewCount}
        </p>
      )}
    </div>
  );
}

function ForecastSuggestion({ days }: { days: DailyForecastDay[] }) {
  const suggestion = computeSuggestion(days);
  return (
    <p
      className={`rounded-2xl border p-4 text-sm leading-relaxed ${
        suggestion.tone === "warm"
          ? "border-[rgba(178,87,47,0.25)] bg-[var(--color-surface-muted-warm)] text-amber-700 dark:text-amber-400"
          : "border-[rgba(15,111,98,0.18)] bg-[var(--color-surface-muted)] text-teal-700 dark:text-teal-300"
      }`}
    >
      💡 {suggestion.text}
    </p>
  );
}

function computeSuggestion(days: DailyForecastDay[]): { text: string; tone: "cool" | "warm" } {
  const today = days.find((d) => d.isToday);
  if (!today) return { text: "无法获取今日数据", tone: "warm" };
  const futureDays = days.filter((d) => !d.isPast && !d.isToday);
  const maxFuture = Math.max(...futureDays.map((d) => d.dueCount), 0);
  const avgFuture =
    futureDays.length > 0 ? futureDays.reduce((sum, d) => sum + d.dueCount, 0) / futureDays.length : 0;
  const tomorrow = futureDays[0];

  if (today.dueCount === 0 && maxFuture > 0) {
    return {
      text: `今天没有到期卡片，可以提前复习。未来 ${futureDays.length} 天平均每日 ${Math.round(avgFuture)} 张，最高 ${maxFuture} 张。`,
      tone: "cool",
    };
  }
  if (today.dueCount > avgFuture * 1.5) {
    return {
      text: `今天负载较高（${today.dueCount} 张），是日均的 ${Math.round(today.dueCount / Math.max(avgFuture, 1))} 倍。建议专注完成核心复习，非紧急卡可推迟到明天（${tomorrow?.dueCount ?? 0} 张）。`,
      tone: "warm",
    };
  }
  if (tomorrow && tomorrow.dueCount > today.dueCount * 1.5) {
    return {
      text: `明天负载会上升（${tomorrow.dueCount} vs 今天 ${today.dueCount}）。如果时间充裕，今天可以多处理一些，减轻明日压力。`,
      tone: "warm",
    };
  }
  if (today.dueCount <= 10 && maxFuture <= 20) {
    return {
      text: `负载平稳，今天 ${today.dueCount} 张，未来两周峰值 ${maxFuture} 张。节奏舒适，保持即可。`,
      tone: "cool",
    };
  }
  return {
    text: `今天 ${today.dueCount} 张待复习，未来 ${futureDays.length} 天共 ${futureDays.reduce((s, d) => s + d.dueCount, 0)} 张。`,
    tone: "cool",
  };
}
