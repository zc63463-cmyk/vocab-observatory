"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import type { OwnerWordReviewLogEntry } from "@/lib/owner-word-sidebar";
import { submitReviewRejoin } from "@/lib/review/rejoin-client";
import {
  buildWeekGrid,
  computeRetrievabilityPoints,
  computeReviewStats,
  normalizeReviewLogs,
} from "@/lib/review/timeline-analytics";

const MAX_WEEK_GRID_COLUMNS = 52;
const CHART_WIDTH = 280;
const INTERVAL_CHART_HEIGHT = 60;
const RETRIEVABILITY_CHART_HEIGHT = 50;
const GRID_CELL = 5;
const GRID_GAP = 1;
const GRID_STRIDE = GRID_CELL + GRID_GAP;

interface WordReviewTimelineProps {
  logs: OwnerWordReviewLogEntry[];
  progressId?: string | null;
}

const RATING_COLORS: Record<string, string> = {
  again: "#ef4444",
  hard: "#f97316",
  good: "#84cc16",
  easy: "#16a34a",
};

const RATING_LABELS: Record<string, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

// `getFullYear/Month/Date` returns calendar parts in the *runtime's* local TZ —
// fine in the browser but on Vercel SSR it resolves in UTC, so the same ISO
// string formats one day apart across the SSR/CSR boundary whenever it falls
// late in the UTC day. Pin everything to Asia/Shanghai (the audience's TZ) so
// every consumer of this string is hydration-stable. We use en-CA because its
// short date pattern is `YYYY-MM-DD` natively.
const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return REVIEW_DATE_FORMATTER.format(d);
}

function formatDays(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days < 1) return `${Math.round(days * 24)} 小时`;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} 天`;
  if (days < 365) return `${(days / 30).toFixed(1)} 个月`;
  return `${(days / 365).toFixed(1)} 年`;
}

export function WordReviewTimeline({ logs, progressId }: WordReviewTimelineProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleReviewNow() {
    if (!progressId || submitting) return;
    setSubmitting(true);
    const result = await submitReviewRejoin(progressId);
    if (!mountedRef.current) return;
    if (!result.ok) {
      addToast(result.errorMessage ?? "立即复习失败", "error");
      setSubmitting(false);
      return;
    }
    addToast("已加入今日复习队列", "success");
    startTransition(() => {
      router.push("/review/zen");
    });
    // Keep submitting=true: page navigation is in-flight; resetting would briefly
    // re-enable the button for double-clicks. Component unmounts on route change.
  }

  const sortedLogs = useMemo(() => normalizeReviewLogs(logs), [logs]);
  const stats = useMemo(() => computeReviewStats(sortedLogs), [sortedLogs]);

  const intervalChart = useMemo(() => {
    if (sortedLogs.length === 0) return null;
    const points = sortedLogs
      .map((log, i) => ({
        i,
        days: log.scheduled_days ?? 0,
        rating: log.rating.toLowerCase(),
        reviewedAt: log.reviewed_at,
      }))
      .filter((p) => p.days > 0);
    if (points.length === 0) return null;
    const maxDays = Math.max(...points.map((p) => p.days), 1);
    const stepX = points.length > 1 ? CHART_WIDTH / (points.length - 1) : 0;
    const path = points
      .map((p, idx) => {
        const x = idx * stepX;
        const y = INTERVAL_CHART_HEIGHT - (p.days / maxDays) * (INTERVAL_CHART_HEIGHT - 8) - 4;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return {
      height: INTERVAL_CHART_HEIGHT,
      maxDays,
      path,
      points,
      stepX,
      width: CHART_WIDTH,
    };
  }, [sortedLogs]);

  const weekGrid = useMemo(() => {
    if (sortedLogs.length < 30) return null;
    const grid = buildWeekGrid(sortedLogs, new Date(), MAX_WEEK_GRID_COLUMNS);
    if (!grid) return null;
    return {
      cell: GRID_CELL,
      gap: GRID_GAP,
      height: 7 * GRID_STRIDE - GRID_GAP,
      stride: GRID_STRIDE,
      truncated: grid.truncated,
      weeks: grid.weeks,
      width: grid.weeks.length * GRID_STRIDE - GRID_GAP,
    };
  }, [sortedLogs]);

  const retrievabilityChart = useMemo(() => {
    const points = computeRetrievabilityPoints(sortedLogs);
    if (points.length === 0) return null;
    const stepX = points.length > 1 ? CHART_WIDTH / (points.length - 1) : 0;
    const yOf = (r: number) =>
      RETRIEVABILITY_CHART_HEIGHT - r * (RETRIEVABILITY_CHART_HEIGHT - 6) - 3;
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${yOf(p.r).toFixed(1)}`)
      .join(" ");
    const referenceY = yOf(0.9);
    const avgR = points.reduce((sum, p) => sum + p.r, 0) / points.length;
    return {
      avgR,
      height: RETRIEVABILITY_CHART_HEIGHT,
      path,
      points,
      referenceY,
      stepX,
      width: CHART_WIDTH,
      yOf,
    };
  }, [sortedLogs]);

  if (sortedLogs.length === 0 || !stats) {
    return null;
  }

  return (
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
        Review History
      </p>
      <h3 className="section-title mt-2 text-2xl font-semibold">复习时间线</h3>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
          <p className="text-[var(--color-ink-soft)] opacity-70">复习次数</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
          <p className="text-[var(--color-ink-soft)] opacity-70">成功率</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{stats.successRate}%</p>
        </div>
        <div className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
          <p className="text-[var(--color-ink-soft)] opacity-70">当前间隔</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{formatDays(stats.currentInterval)}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)] opacity-70">
          {weekGrid
            ? weekGrid.truncated
              ? `复习日历（最近 ${MAX_WEEK_GRID_COLUMNS} 周）`
              : "复习日历"
            : "评分轨迹"}
        </p>
        {weekGrid ? (
          <svg
            viewBox={`0 0 ${weekGrid.width} ${weekGrid.height}`}
            className="w-full"
            style={{ maxHeight: "60px" }}
            role="img"
            aria-label="按日聚合的复习日历"
          >
            {weekGrid.weeks.map((week, weekIdx) =>
              week.map((day, dayIdx) => {
                const x = weekIdx * weekGrid.stride;
                const y = dayIdx * weekGrid.stride;
                const rating = day.log?.rating.toLowerCase();
                const color = rating
                  ? (RATING_COLORS[rating] ?? "#94a3b8")
                  : "rgba(148,163,184,0.15)";
                const dateLabel = REVIEW_DATE_FORMATTER.format(day.date);
                return (
                  <rect
                    key={`${weekIdx}-${dayIdx}`}
                    x={x}
                    y={y}
                    width={weekGrid.cell}
                    height={weekGrid.cell}
                    rx={1}
                    fill={color}
                  >
                    {day.log ? (
                      <title>
                        {dateLabel} · {RATING_LABELS[rating ?? ""] ?? day.log.rating}
                        {day.log.scheduled_days != null ? ` · 下次 ${formatDays(day.log.scheduled_days)}` : ""}
                      </title>
                    ) : (
                      <title>{dateLabel} · 未复习</title>
                    )}
                  </rect>
                );
              }),
            )}
          </svg>
        ) : (
          <div className="flex flex-wrap gap-1">
            {sortedLogs.map((log, idx) => {
              const rating = log.rating.toLowerCase();
              const color = RATING_COLORS[rating] ?? "#94a3b8";
              const label = RATING_LABELS[rating] ?? log.rating;
              return (
                <span
                  key={`${log.reviewed_at}-${idx}`}
                  className="inline-block h-3 w-3 rounded-sm transition-transform hover:scale-150"
                  style={{ backgroundColor: color }}
                  title={`${formatDate(log.reviewed_at)} · ${label}${log.scheduled_days != null ? ` · 下次 ${formatDays(log.scheduled_days)}` : ""}`}
                  aria-label={`第 ${idx + 1} 次复习：${label}`}
                />
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--color-ink-soft)]">
          {(["again", "hard", "good", "easy"] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: RATING_COLORS[key] }}
              />
              <span>
                {RATING_LABELS[key]} · {stats.ratingCounts[key]}
              </span>
            </span>
          ))}
        </div>
      </div>

      {intervalChart && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)] opacity-70">
            间隔变化（峰值 {formatDays(intervalChart.maxDays)}）
          </p>
          <svg
            viewBox={`0 0 ${intervalChart.width} ${intervalChart.height}`}
            className="h-16 w-full"
            role="img"
            aria-label="复习间隔变化折线"
          >
            <path
              d={intervalChart.path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {intervalChart.points.map((p, idx) => {
              const x = idx * intervalChart.stepX;
              const y =
                intervalChart.height -
                (p.days / intervalChart.maxDays) * (intervalChart.height - 8) -
                4;
              const color = RATING_COLORS[p.rating] ?? "#94a3b8";
              return (
                <circle
                  key={`${p.reviewedAt}-${idx}`}
                  cx={x}
                  cy={y}
                  r={2.5}
                  fill={color}
                >
                  <title>
                    {formatDate(p.reviewedAt)} · {RATING_LABELS[p.rating] ?? p.rating} · {formatDays(p.days)}
                  </title>
                </circle>
              );
            })}
          </svg>
        </div>
      )}

      {retrievabilityChart && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)] opacity-70">
            回忆概率（平均 {Math.round(retrievabilityChart.avgR * 100)}%）
          </p>
          <svg
            viewBox={`0 0 ${retrievabilityChart.width} ${retrievabilityChart.height}`}
            className="h-12 w-full"
            role="img"
            aria-label="每次复习时的回忆概率折线"
          >
            <line
              x1={0}
              x2={retrievabilityChart.width}
              y1={retrievabilityChart.referenceY}
              y2={retrievabilityChart.referenceY}
              stroke="var(--color-ink-soft)"
              strokeWidth={0.5}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <text
              x={retrievabilityChart.width - 2}
              y={retrievabilityChart.referenceY - 2}
              textAnchor="end"
              fontSize={8}
              fill="var(--color-ink-soft)"
              opacity={0.6}
            >
              90%
            </text>
            <path
              d={retrievabilityChart.path}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {retrievabilityChart.points.map((p, idx) => {
              const x = idx * retrievabilityChart.stepX;
              const y = retrievabilityChart.yOf(p.r);
              const color = RATING_COLORS[p.rating] ?? "#94a3b8";
              return (
                <circle key={`${p.reviewedAt}-${idx}`} cx={x} cy={y} r={2.2} fill={color}>
                  <title>
                    {formatDate(p.reviewedAt)} · 回忆前概率 {Math.round(p.r * 100)}% · {RATING_LABELS[p.rating] ?? p.rating}
                  </title>
                </circle>
              );
            })}
          </svg>
          <p className="mt-1 text-[10px] text-[var(--color-ink-soft)] opacity-60">
            FSRS 估算：复习开始时仍能记得的概率（虚线为 90% 保留度参考）。
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[var(--color-ink-soft)] opacity-60">
          最近一次：{formatDate(stats.lastReviewed)} · {RATING_LABELS[stats.lastRating.toLowerCase()] ?? stats.lastRating}
        </p>
        {progressId ? (
          <button
            type="button"
            onClick={handleReviewNow}
            disabled={submitting}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/20 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "加入中…" : "立即复习此词 →"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
