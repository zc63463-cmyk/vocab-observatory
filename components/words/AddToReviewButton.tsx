"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import type { OwnerWordProgressSummary } from "@/lib/words";

export function AddToReviewButton({
  initialProgress,
  wordId,
}: {
  initialProgress: OwnerWordProgressSummary | null;
  wordId: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(initialProgress);
  const dueNow = progress?.is_due ?? false;

  function handleClick() {
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
        setMessage("已加入复习队列。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "添加失败");
      } finally {
        setPending(false);
      }
    });
  }

  if (progress) {
    return (
      <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.48)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              复习状态
            </p>
            <h3 className="section-title mt-2 text-2xl font-semibold">
              {dueNow ? "今天到期" : "已加入复习"}
            </h3>
          </div>
          <Badge tone={dueNow ? "warm" : "default"}>
            {progress.review_count > 0 ? `${progress.review_count} 次回顾` : "新卡片"}
          </Badge>
        </div>

        <div className="mt-5 space-y-2 text-sm text-[var(--color-ink-soft)]">
          <p>当前状态：{progress.state}</p>
          <p>下次复习：{formatDateTime(progress.due_at)}</p>
          <p>上次复习：{formatDateTime(progress.last_reviewed_at)}</p>
        </div>

        <Link
          href="/review"
          className="mt-5 inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:border-[var(--color-border-strong)] hover:bg-[rgba(255,255,255,0.45)]"
        >
          {dueNow ? "进入今日复习" : "查看复习队列"}
        </Link>

        {message ? <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.48)] p-5">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="w-full rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "处理中..." : "加入复习"}
      </button>
      {message ? <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{message}</p> : null}
    </div>
  );
}
