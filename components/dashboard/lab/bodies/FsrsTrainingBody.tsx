"use client";

import { FsrsTrainingPanel } from "@/components/review/FsrsTrainingPanel";
import type { DashboardSummary } from "../types";

interface FsrsTrainingBodyProps {
  summary: Pick<DashboardSummary, "fsrsTrainingStatus">;
}

/**
 * Pure body for the FSRS training section.
 * Wraps the existing self-contained `FsrsTrainingPanel` (which manages
 * its own server-state via `/api/review/fsrs-train`).
 */
export function FsrsTrainingBody({ summary }: FsrsTrainingBodyProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
        FSRS 个性化权重训练。基于你的历史复习日志（≥ 200 条）训练专属于你的遗忘曲线参数，
        让间隔预测更贴合你的实际记忆模式。
      </p>
      <FsrsTrainingPanel initialStatus={summary.fsrsTrainingStatus} />
    </div>
  );
}
