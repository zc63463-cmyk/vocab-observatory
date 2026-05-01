"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import type { OwnerWordReviewLogEntry } from "@/lib/owner-word-sidebar";

const MAX_WEEK_GRID_COLUMNS = 52;

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
    try {
      const response = await fetch("/api/review/rejoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressId }),
      });
      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "立即复习失败");
      }
      if (!mountedRef.current) return;
      addToast("已加入今日复习队列", "success");
      startTransition(() => {
        router.push("/review/zen");
      });
      // Keep submitting=true: page navigation is in-flight; resetting would briefly
      // re-enable the button for double-clicks. Component unmounts on route change.
    } catch (error) {
      if (!mountedRef.current) return;
      addToast(error instanceof Error ? error.message : "立即复习失败", "error");
      setSubmitting(false);
    }
  }

  // Defensive: filter logs with invalid reviewed_at and re-sort ascending so the
  // component never relies on the API's ORDER BY being preserved across changes.
  const sortedLogs = useMemo(() => {
    return logs
      .filter((log) => {
        if (!log.reviewed_at) return false;
        const t = Date.parse(log.reviewed_at);
        return Number.isFinite(t);
      })
      .slice()
      .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
  }, [logs]);

  const stats = useMemo(() => {
    if (sortedLogs.length === 0) return null;
    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
    let knownTotal = 0;
    for (const log of sortedLogs) {
      const r = log.rating.toLowerCase();
      if (r in ratingCounts) {
        ratingCounts[r as keyof typeof ratingCounts] += 1;
        knownTotal += 1;
      }
    }
    const lastLog = sortedLogs[sortedLogs.length - 1];
    const scheduledDays = sortedLogs
      .map((l) => l.scheduled_days)
      .filter((d): d is number => d != null);
    const maxScheduled = scheduledDays.length > 0 ? Math.max(...scheduledDays) : 0;
    const successCount = ratingCounts.good + ratingCounts.easy;
    const successRate =
      knownTotal > 0 ? Math.round((successCount / knownTotal) * 100) : 0;
    return {
      ratingCounts,
      lastRating: lastLog.rating,
      lastReviewed: lastLog.reviewed_at,
      currentInterval: lastLog.scheduled_days,
      maxScheduled,
      successRate,
      total: sortedLogs.length,
    };
  }, [sortedLogs]);

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
  }, [sortedLogs]);

  const weekGrid = useMemo(() => {
    if (sortedLogs.length < 30) return null;
    const localDayKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dayMap = new Map<string, OwnerWordReviewLogEntry>();
    for (const log of sortedLogs) {
      const parsed = new Date(log.reviewed_at);
      if (Number.isNaN(parsed.getTime())) continue;
      dayMap.set(localDayKey(parsed), log);
    }
    const firstDate = new Date(sortedLogs[0].reviewed_at);
    if (Number.isNaN(firstDate.getTime())) return null;
    firstDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(firstDate);
    start.setDate(firstDate.getDate() - firstDate.getDay());
    const end = new Date(today);
    end.setDate(today.getDate() + (6 - today.getDay()));

    const weeks: Array<Array<{ date: Date; log: OwnerWordReviewLogEntry | null }>> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const week: Array<{ date: Date; log: OwnerWordReviewLogEntry | null }> = [];
      for (let i = 0; i < 7; i += 1) {
        week.push({ date: new Date(cursor), log: dayMap.get(localDayKey(cursor)) ?? null });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    // Cap at MAX_WEEK_GRID_COLUMNS most-recent weeks so cells stay readable.
    const truncated = weeks.length > MAX_WEEK_GRID_COLUMNS;
    if (truncated) {
      weeks.splice(0, weeks.length - MAX_WEEK_GRID_COLUMNS);
    }

    const cell = 5;
    const gap = 1;
    const stride = cell + gap;
    return {
      cell,
      gap,
      height: 7 * stride - gap,
      stride,
      truncated,
      weeks,
      width: weeks.length * stride - gap,
    };
  }, [sortedLogs]);

  // FSRS retrievability per review attempt: R = (1 + elapsed_days / (9 * prev_stability)) ^ -1
  // Uses previous log's stability so it represents memory probability *at the moment of recall*.
  // First review has no prior stability and is omitted.
  const retrievabilityChart = useMemo(() => {
    if (sortedLogs.length < 2) return null;
    const points: Array<{ idx: number; r: number; rating: string; reviewedAt: string }> = [];
    for (let i = 1; i < sortedLogs.length; i += 1) {
      const log = sortedLogs[i];
      const prev = sortedLogs[i - 1];
      const elapsed = log.elapsed_days;
      const prevStability = prev.stability;
      if (
        elapsed == null ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        prevStability == null ||
        !Number.isFinite(prevStability) ||
        prevStability <= 0
      ) {
        continue;
      }
      const r = 1 / (1 + elapsed / (9 * prevStability));
      if (!Number.isFinite(r)) continue;
      points.push({
        idx: i,
        r: Math.max(0, Math.min(1, r)),
        rating: log.rating.toLowerCase(),
        reviewedAt: log.reviewed_at,
      });
    }
    if (points.length === 0) return null;
    const width = 280;
    const height = 50;
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;
    const yOf = (r: number) => height - r * (height - 6) - 3;
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${yOf(p.r).toFixed(1)}`)
      .join(" ");
    const referenceY = yOf(0.9);
    const avgR = points.reduce((sum, p) => sum + p.r, 0) / points.length;
    return { avgR, height, path, points, referenceY, stepX, width, yOf };
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
                const dateLabel = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;
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
