"use client";

import { useMemo } from "react";
import type { OwnerWordReviewLogEntry } from "@/lib/owner-word-sidebar";

interface WordReviewTimelineProps {
  logs: OwnerWordReviewLogEntry[];
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDays(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days < 1) return `${Math.round(days * 24)} 小时`;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} 天`;
  if (days < 365) return `${(days / 30).toFixed(1)} 个月`;
  return `${(days / 365).toFixed(1)} 年`;
}

export function WordReviewTimeline({ logs }: WordReviewTimelineProps) {
  const stats = useMemo(() => {
    if (logs.length === 0) return null;
    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const log of logs) {
      const r = log.rating.toLowerCase();
      if (r in ratingCounts) {
        ratingCounts[r as keyof typeof ratingCounts] += 1;
      }
    }
    const lastLog = logs[logs.length - 1];
    const scheduledDays = logs
      .map((l) => l.scheduled_days)
      .filter((d): d is number => d != null);
    const maxScheduled = scheduledDays.length > 0 ? Math.max(...scheduledDays) : 0;
    const successCount = ratingCounts.good + ratingCounts.easy;
    const successRate = logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 0;
    return {
      ratingCounts,
      lastRating: lastLog.rating,
      lastReviewed: lastLog.reviewed_at,
      currentInterval: lastLog.scheduled_days,
      maxScheduled,
      successRate,
      total: logs.length,
    };
  }, [logs]);

  const intervalChart = useMemo(() => {
    if (logs.length === 0) return null;
    const points = logs
      .map((log, i) => ({
        i,
        days: log.scheduled_days ?? 0,
        rating: log.rating.toLowerCase(),
        reviewedAt: log.reviewed_at,
      }))
      .filter((p) => p.days > 0);
    if (points.length === 0) return null;
    const maxDays = Math.max(...points.map((p) => p.days), 1);
    const width = 280;
    const height = 60;
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;
    const path = points
      .map((p, idx) => {
        const x = idx * stepX;
        const y = height - (p.days / maxDays) * (height - 8) - 4;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return { height, maxDays, path, points, stepX, width };
  }, [logs]);

  if (logs.length === 0 || !stats) {
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
          评分轨迹
        </p>
        <div className="flex flex-wrap gap-1">
          {logs.map((log, idx) => {
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

      <p className="mt-4 text-[11px] text-[var(--color-ink-soft)] opacity-60">
        最近一次：{formatDate(stats.lastReviewed)} · {RATING_LABELS[stats.lastRating.toLowerCase()] ?? stats.lastRating}
      </p>
    </div>
  );
}
