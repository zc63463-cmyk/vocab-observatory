"use client";

import Link from "next/link";
import { formatDateTime } from "@/lib/utils";
import type { DashboardSummary } from "../types";

interface RecentReviewsBodyProps {
  summary: Pick<DashboardSummary, "recentLogs">;
}

const RATING_TONES: Record<string, string> = {
  again: "text-red-500 dark:text-red-400",
  hard: "text-amber-600 dark:text-amber-400",
  good: "text-emerald-600 dark:text-emerald-400",
  easy: "text-blue-600 dark:text-blue-400",
};

const RATING_LABELS: Record<string, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

/**
 * Pure body for the recent-reviews section.
 * Each row links into the word detail page (which itself opens via the
 * existing parallel-route modal in `app/(app)/@modal/(...)words/[slug]`).
 */
export function RecentReviewsBody({ summary }: RecentReviewsBodyProps) {
  const logs = summary.recentLogs;

  if (logs.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">还没有复习记录。</p>;
  }

  return (
    <div className="space-y-2">
      {logs.map((log, index) => {
        const rating = log.rating.toLowerCase();
        const tone = RATING_TONES[rating] ?? "text-[var(--color-ink-soft)]";
        const label = RATING_LABELS[rating] ?? log.rating;

        return (
          <div
            key={`${log.reviewed_at}-${index}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              {log.words ? (
                <Link
                  href={`/words/${log.words.slug}`}
                  className="text-base font-semibold text-[var(--color-accent)] hover:underline"
                >
                  {log.words.lemma}
                </Link>
              ) : (
                <span className="text-base font-semibold text-[var(--color-ink-soft)]">已删除词条</span>
              )}
              <p className="mt-1 text-xs text-[var(--color-ink-soft)] opacity-70">
                {formatDateTime(log.reviewed_at)}
              </p>
            </div>
            <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
