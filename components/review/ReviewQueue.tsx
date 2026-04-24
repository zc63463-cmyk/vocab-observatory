"use client";

import { startTransition, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingButtons } from "@/components/review/RatingButtons";
import { ReviewCard } from "@/components/review/ReviewCard";
import type { ReviewQueueItem } from "@/lib/review/types";

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  async function fetchQueue() {
    const response = await fetch("/api/review/queue");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "加载复习队列失败");
    }

    return payload.items ?? [];
  }

  async function loadQueue(showLoader = true) {
    if (showLoader) {
      setLoading(true);
    }
    try {
      setItems(await fetchQueue());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载复习队列失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextItems = await fetchQueue();
        if (!cancelled) {
          setItems(nextItems);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "加载复习队列失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleRate(rating: "again" | "hard" | "good" | "easy") {
    const current = items[0];
    if (!current) {
      return;
    }

    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/answer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            progressId: current.progress_id,
            rating,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "提交评分失败");
        }
        const nextItems = items.slice(1);
        setItems(nextItems);
        setMessage(`已记录 ${rating.toUpperCase()}。`);
        if (nextItems.length === 0) {
          await loadQueue();
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "提交评分失败");
      } finally {
        setPending(false);
      }
    });
  }

  if (loading) {
    return <EmptyState title="正在加载" description="正在获取当前到期的词条。" />;
  }

  if (!items[0]) {
    return (
      <EmptyState
        title="当前没有到期词条"
        description="继续从词条详情页把新单词加入复习，或者等待下一批到期。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <ReviewCard item={items[0]} />
      <div className="panel rounded-[1.75rem] p-6">
        <p className="text-sm text-[var(--color-ink-soft)]">
          还剩 {items.length} 个待复习词条。根据回忆质量选择评分，系统会更新下一次复习时间。
        </p>
        <div className="mt-5">
          <RatingButtons disabled={pending} onRate={handleRate} />
        </div>
      </div>
      {message ? <p className="text-sm text-[var(--color-ink-soft)]">{message}</p> : null}
    </div>
  );
}
