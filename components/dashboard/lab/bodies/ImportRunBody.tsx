"use client";

import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import type { DashboardSummary } from "../types";

interface ImportRunBodyProps {
  summary: Pick<DashboardSummary, "importOverview">;
}

/**
 * Pure body for the import-run section.
 * Surfaces the latest vault sync run + any recent errors so vault
 * pipeline rot can't quietly stale the corpus.
 */
export function ImportRunBody({ summary }: ImportRunBodyProps) {
  const overview = summary.importOverview;

  if (!overview.available) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        Import 跟踪表尚未启用。运行 <code className="text-xs">0003_import_tracking.sql</code> 后即可看到运行历史。
      </p>
    );
  }

  if (!overview.latestRun) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        还没有 import 历史。下次 <code className="text-xs">/api/imports/github</code> 运行将创建首条记录。
      </p>
    );
  }

  const run = overview.latestRun;
  const isError = run.status === "completed_with_errors" || run.status === "failed";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-6 text-[var(--color-ink-soft)]">
          保持同步管线可见，避免源文件损坏或局部失败悄悄陈旧化语料。
        </p>
        <Badge tone={isError ? "warm" : "default"}>{run.status}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="新建" value={run.created_count} />
        <Stat label="更新" value={run.updated_count} />
        <Stat label="错误" value={run.error_count} tone={run.error_count > 0 ? "warm" : "default"} />
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm leading-7 text-[var(--color-ink-soft)]">
        <p>开始：{formatDateTime(run.started_at)}</p>
        <p>结束：{run.finished_at ? formatDateTime(run.finished_at) : "进行中"}</p>
        <p>已导入：{run.imported_count}</p>
        <p>未变化：{run.unchanged_count}</p>
        <p>软删除：{run.soft_deleted_count}</p>
      </div>

      {overview.recentErrors.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            近期错误
          </p>
          {overview.recentErrors.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-[rgba(178,87,47,0.25)] bg-[var(--color-surface-muted-warm)] p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                {entry.error_stage}
              </p>
              <p className="mt-1.5 text-sm font-semibold text-[var(--color-ink)]">
                {entry.source_path ?? "pipeline"}
              </p>
              <p className="mt-1.5 text-sm leading-6 text-[var(--color-ink-soft)]">
                {entry.error_message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warm";
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === "warm"
          ? "border-[rgba(178,87,47,0.25)] bg-[var(--color-surface-muted-warm)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-soft)]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
