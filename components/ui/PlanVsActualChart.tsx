"use client";

import { motion } from "framer-motion";
import { useId, useMemo } from "react";
import type { PlanVsActualPoint } from "@/lib/review/forecast-snapshots";

interface PlanVsActualChartProps {
  className?: string;
  /** Series oldest → newest. `isToday` on the final point renders it dimmed. */
  data: PlanVsActualPoint[];
}

/**
 * Lightweight inline SVG dual-line chart — deliberately dependency-free to
 * stay consistent with `MiniBarChart`. One line per series plus an area
 * fill under the forecast so the eye can see both the *envelope* (planned)
 * and the *trace* (actual) at a glance.
 *
 * Layout:
 *   - fixed 24-unit-tall viewBox (height scales responsively via CSS)
 *   - x-axis evenly spaced across the width, no date ticks on the SVG
 *     itself (labels render below the chart for better typography)
 *   - y-axis auto-scales to max(forecast, actual) with a 10% headroom
 *     so lines don't kiss the top edge.
 */
export function PlanVsActualChart({ data, className }: PlanVsActualChartProps) {
  const areaId = useId();

  const { forecastPath, actualPath, areaPath, maxY, dotPositions } = useMemo(
    () => buildPaths(data),
    [data],
  );

  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        暂无数据——完成一次复习后即可对比计划与实际。
      </p>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <figure className="relative w-full">
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="h-36 w-full"
          role="img"
          aria-label="Forecast vs actual daily review volume"
        >
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Forecast area — drawn first so the actual line sits on top. */}
          {areaPath ? (
            <motion.path
              d={areaPath}
              fill={`url(#${areaId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}

          {/* Forecast line (dashed, cool) */}
          {forecastPath ? (
            <motion.path
              d={forecastPath}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="0.35"
              strokeDasharray="1,0.8"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}

          {/* Actual line (solid, warm) */}
          {actualPath ? (
            <motion.path
              d={actualPath}
              fill="none"
              stroke="var(--color-accent-2)"
              strokeWidth="0.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}

          {/* Today marker — vertical tick so the user sees which end is live. */}
          {dotPositions.map((pos) => (
            <g key={pos.date} transform={`translate(${pos.x}, 0)`}>
              {pos.isToday ? (
                <line
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="24"
                  stroke="var(--color-ink-soft)"
                  strokeWidth="0.15"
                  strokeDasharray="0.5,0.5"
                  opacity="0.55"
                />
              ) : null}
            </g>
          ))}
        </svg>

        {/* Hover targets — a transparent column per day for tooltips. */}
        <div className="pointer-events-none absolute inset-0 flex">
          {data.map((point) => (
            <div
              key={point.date}
              className="group pointer-events-auto relative flex-1"
              title={`${point.date}\n预计 ${point.forecastCount} · 实际 ${point.actualCount}`}
            >
              <span className="sr-only">
                {point.date}: forecast {point.forecastCount}, actual {point.actualCount}
              </span>
            </div>
          ))}
        </div>
      </figure>

      <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-ink-soft)]">
        <span>{data[0]?.date.slice(5)}</span>
        <div className="flex items-center gap-3">
          <LegendSwatch kind="forecast" label="预计到期" />
          <LegendSwatch kind="actual" label="实际复习" />
        </div>
        <span>
          {data[data.length - 1]?.isToday ? "今日" : data[data.length - 1]?.date.slice(5)}
        </span>
      </div>

      <p className="text-[11px] leading-5 text-[var(--color-ink-soft)]">
        y 轴最大 {maxY}。虚线是早晨记录的计划到期量；实线是当天真实完成的复习数量。
        两线拟合良好说明节奏稳定；持续偏低代表积压，持续偏高代表有额外加练。
      </p>
    </div>
  );
}

function LegendSwatch({ kind, label }: { kind: "forecast" | "actual"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-[2px] w-6 rounded-full"
        style={{
          backgroundColor:
            kind === "forecast" ? "var(--color-accent)" : "var(--color-accent-2)",
          borderTop:
            kind === "forecast" ? "1px dashed var(--color-accent)" : undefined,
        }}
      />
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Pure helpers below. Exported for unit tests.
// ────────────────────────────────────────────────────────────────────────

interface DotPosition {
  date: string;
  isToday: boolean;
  x: number;
}

interface BuiltPaths {
  actualPath: string;
  areaPath: string;
  dotPositions: DotPosition[];
  forecastPath: string;
  maxY: number;
}

export function buildPaths(data: PlanVsActualPoint[]): BuiltPaths {
  if (data.length === 0) {
    return { actualPath: "", areaPath: "", dotPositions: [], forecastPath: "", maxY: 0 };
  }

  const rawMax = data.reduce(
    (acc, point) => Math.max(acc, point.forecastCount, point.actualCount),
    0,
  );
  // 10% headroom, minimum of 1 so an all-zeros chart still renders lines.
  const maxY = Math.max(1, Math.ceil(rawMax * 1.1));

  const stepX = data.length > 1 ? 100 / (data.length - 1) : 0;
  const projectY = (v: number) => {
    // Invert: 0 at the bottom of the SVG. 1-unit top padding so the line
    // never clips the top edge.
    const normalized = v / maxY;
    return 23 - normalized * 22;
  };

  const forecastPts = data.map((p, i) => `${i * stepX},${projectY(p.forecastCount)}`);
  const actualPts = data.map((p, i) => `${i * stepX},${projectY(p.actualCount)}`);

  const forecastPath = `M ${forecastPts.join(" L ")}`;
  const actualPath = `M ${actualPts.join(" L ")}`;
  const areaPath =
    data.length > 1
      ? `M 0,24 L ${forecastPts.join(" L ")} L ${(data.length - 1) * stepX},24 Z`
      : "";

  const dotPositions = data.map((p, i) => ({
    date: p.date,
    isToday: p.isToday,
    x: i * stepX,
  }));

  return { actualPath, areaPath, dotPositions, forecastPath, maxY };
}
