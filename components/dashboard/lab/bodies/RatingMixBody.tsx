"use client";

import { StackedRatingBar } from "@/components/ui/StackedRatingBar";
import type { DashboardSummary } from "../types";

interface RatingMixBodyProps {
  summary: Pick<DashboardSummary, "ratingDistribution" | "metrics">;
}

/**
 * Pure body for the rating-mix section.
 * Reuses the existing `StackedRatingBar` component from `@/components/ui`.
 */
export function RatingMixBody({ summary }: RatingMixBodyProps) {
  const { again, hard, good, easy } = summary.ratingDistribution;
  const total = again + hard + good + easy;

  const segments = [
    { label: "Again", value: again, color: "#ef4444" },
    { label: "Hard", value: hard, color: "#f59e0b" },
    { label: "Good", value: good, color: "#22c55e" },
    { label: "Easy", value: easy, color: "#3b82f6" },
  ];

  if (total === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        暂无评分数据。完成几次复习后即可看到分布。
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <StackedRatingBar segments={segments} />
      <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
        近 30 天共 {total} 次评分。Again 比例越高代表当前 retention 目标偏激进；
        Easy 比例过高则可能是过度复习，可以考虑提升 retention 目标节省时间。
      </p>
    </div>
  );
}
