"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springs } from "@/components/motion";
import { Flame, TrendingUp, AlertTriangle } from "lucide-react";

interface DayStat {
  date: string;
  total: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

interface ReviewStats {
  streakDays: number;
  last7Days: DayStat[];
  totalReviewed: number;
  againRate: number;
}

function formatDateLabel(dateStr: string): string {
  // Parse as UTC to avoid timezone shifts (e.g. UTC-5 showing previous day)
  const [y, m, day] = dateStr.split("-").map(Number);
  return `${m}/${day}`;
}

function maxBarValue(days: DayStat[]): number {
  const max = Math.max(...days.map((d) => d.total), 1);
  return Math.ceil(max * 1.2);
}

export function ReviewStatsPanel() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/review/stats");
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as ReviewStats;
        if (mounted) setStats(data);
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="panel rounded-[1.75rem] p-6">
        <div className="h-32 animate-pulse rounded-xl bg-[var(--color-surface-muted)]" />
      </div>
    );
  }

  if (error) {
    return null; // Gracefully hide on error; avoid broken UI
  }

  if (!stats || stats.totalReviewed === 0) {
    return null;
  }

  const maxTotal = maxBarValue(stats.last7Days);

  return (
    <motion.section
      className="panel rounded-[1.75rem] p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            最近 7 天
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
            复习趋势
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)]">
            <Flame size={16} className="text-orange-400" />
            <span className="font-mono font-semibold text-[var(--color-ink)]">
              {stats.streakDays}
            </span>
            <span>天连续</span>
          </div>
        </div>
      </div>

      {/* 7-day bar chart */}
      <div className="mt-6 flex items-end gap-2">
        {stats.last7Days.map((day) => {
          const heightPct = Math.round((day.total / maxTotal) * 100);
          const againPct = day.total > 0 ? Math.round((day.again / day.total) * 100) : 0;

          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="relative w-full rounded-md bg-[var(--color-surface-muted)]" style={{ height: 96 }}>
                {/* Filled portion */}
                {heightPct > 0 && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 rounded-md"
                    style={{
                      height: `${heightPct}%`,
                      background:
                        againPct > 40
                          ? "var(--color-accent-2)"
                          : "var(--color-accent)",
                      opacity: 0.8,
                      transformOrigin: "bottom",
                    }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ type: "spring", ...springs.smooth, delay: 0.1 }}
                  />
                )}
              </div>
              <span className="text-[10px] text-[var(--color-ink-soft)] opacity-60">
                {formatDateLabel(day.date)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-ink-soft)]">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={14} />
          <span>
            共复习{" "}
            <span className="font-mono font-semibold text-[var(--color-ink)]">
              {stats.totalReviewed}
            </span>{" "}
            次
          </span>
        </div>
        {stats.againRate > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-[var(--color-accent-2)]" />
            <span>
              Again 率{" "}
              <span className="font-mono font-semibold text-[var(--color-ink)]">
                {Math.round(stats.againRate * 100)}%
              </span>
            </span>
          </div>
        )}
      </div>
    </motion.section>
  );
}
