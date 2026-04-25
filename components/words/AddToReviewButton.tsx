"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import type { OwnerWordProgressSummary } from "@/lib/words";

export function AddToReviewButton({
  initialProgress,
  wordId,
}: {
  initialProgress: OwnerWordProgressSummary | null;
  wordId: string;
}) {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(initialProgress);
  const { addToast } = useToast();
  const dueNow = progress?.is_due ?? false;
  const isSuspended = progress?.state === "suspended";

  function handleAdd() {
    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ wordId }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "添加失败");
        }
        setProgress(payload.progress ?? null);
        addToast("已加入复习队列", "success");
      } catch (error) {
        addToast(error instanceof Error ? error.message : "添加失败", "error");
      } finally {
        setPending(false);
      }
    });
  }

  function handleRejoin() {
    if (!progress) {
      return;
    }

    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/rejoin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ progressId: progress.id }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "恢复失败");
        }
        setProgress(payload.progress ?? null);
        addToast("该词条已恢复复习", "success");
      } catch (error) {
        addToast(error instanceof Error ? error.message : "恢复失败", "error");
      } finally {
        setPending(false);
      }
    });
  }

  if (progress) {
    return (
      <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              复习状态
            </p>
            <h3 className="section-title mt-2 text-2xl font-semibold">
              {isSuspended ? "已暂停" : dueNow ? "今天到期" : "已加入复习"}
            </h3>
          </div>
          <Badge tone={isSuspended || dueNow ? "warm" : "default"}>
            {isSuspended
              ? "已暂停"
              : progress.review_count > 0
                ? `${progress.review_count} 次回顾`
                : "新卡片"}
          </Badge>
        </div>

        <div className="mt-5 space-y-2 text-sm text-[var(--color-ink-soft)]">
          <p>当前状态：{progress.state}</p>
          <p>下次复习：{formatDateTime(progress.due_at)}</p>
          <p>上次复习：{formatDateTime(progress.last_reviewed_at)}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {isSuspended ? (
            <Button
              type="button"
              disabled={pending}
              onClick={handleRejoin}
              size="sm"
            >
              {pending ? "恢复中..." : "恢复复习"}
            </Button>
          ) : (
            <Link
              href="/review"
              className="inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
            >
              {dueNow ? "进入今日复习" : "查看复习队列"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
      <Button
        type="button"
        disabled={pending}
        onClick={handleAdd}
        fullWidth
      >
        {pending ? "处理中..." : "加入复习"}
      </Button>
    </div>
  );
}
