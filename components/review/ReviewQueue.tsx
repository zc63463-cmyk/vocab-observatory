"use client";

import { startTransition, useEffect, useState } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingButtons } from "@/components/review/RatingButtons";
import { ReviewCard } from "@/components/review/ReviewCard";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import type {
  ReviewQueueItem,
  ReviewQueueStats,
  ReviewSessionSummary,
} from "@/lib/review/types";

interface QueueResponse {
  items: ReviewQueueItem[];
  session: ReviewSessionSummary | null;
  stats: ReviewQueueStats | null;
}

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [session, setSession] = useState<ReviewSessionSummary | null>(null);
  const [stats, setStats] = useState<ReviewQueueStats | null>(null);
  const { addToast } = useToast();

  async function fetchQueue(): Promise<QueueResponse> {
    const response = await fetch("/api/review/queue");
    const payload = (await response.json()) as QueueResponse & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "加载复习队列失败");
    }

    return {
      items: payload.items ?? [],
      session: payload.session ?? null,
      stats: payload.stats ?? null,
    };
  }

  async function loadQueue(showLoader = true) {
    if (showLoader) {
      setLoading(true);
    }
    try {
      const queue = await fetchQueue();
      setItems(queue.items);
      setSession(queue.session);
      setStats(queue.stats);
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
        const queue = await fetchQueue();
        if (!cancelled) {
          setItems(queue.items);
          setSession(queue.session);
          setStats(queue.stats);
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

  function updateStatsAfterRemoval(item: ReviewQueueItem, incrementCompleted = false) {
    setStats((current) =>
      current
        ? {
            completed: current.completed + (incrementCompleted ? 1 : 0),
            dueToday: Math.max(current.dueToday - 1, 0),
            newCards: Math.max(current.newCards - (item.is_new ? 1 : 0), 0),
            remaining: Math.max(current.remaining - 1, 0),
          }
        : current,
    );

    if (incrementCompleted) {
      setSession((current) =>
        current
          ? {
              ...current,
              cards_seen: current.cards_seen + 1,
            }
          : current,
      );
    }
  }

  function handleRate(rating: "again" | "hard" | "good" | "easy") {
    const current = items[0];
    if (!current || !session) {
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
            sessionId: session.id,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "提交评分失败");
        }
        const nextItems = items.slice(1);
        setItems(nextItems);
        updateStatsAfterRemoval(current, true);
        addToast(`已记录 ${rating.toUpperCase()}`, "success");
        if (nextItems.length === 0) {
          await loadQueue(false);
        }
      } catch (error) {
        addToast(error instanceof Error ? error.message : "提交评分失败", "error");
      } finally {
        setPending(false);
      }
    });
  }

  function handleSkip() {
    const current = items[0];
    if (!current || !session) {
      return;
    }

    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/skip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            progressId: current.progress_id,
            sessionId: session.id,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "跳过失败");
        }

        setItems([...items.slice(1), current]);
        addToast("已跳过，当前卡片已移到队尾", "info");
      } catch (error) {
        addToast(error instanceof Error ? error.message : "跳过失败", "error");
      } finally {
        setPending(false);
      }
    });
  }

  function handleSuspend() {
    const current = items[0];
    if (!current || !session) {
      return;
    }

    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/suspend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            progressId: current.progress_id,
            sessionId: session.id,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "暂停失败");
        }

        const nextItems = items.slice(1);
        setItems(nextItems);
        updateStatsAfterRemoval(current, false);
        addToast("已暂停该词条，直到你手动恢复复习", "info");
        if (nextItems.length === 0) {
          await loadQueue(false);
        }
      } catch (error) {
        addToast(error instanceof Error ? error.message : "暂停失败", "error");
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
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="今日到期" value={stats?.dueToday ?? 0} tone="warm" />
          <MetricCard label="新卡" value={stats?.newCards ?? 0} />
          <MetricCard label="已完成" value={stats?.completed ?? 0} />
          <MetricCard label="剩余" value={stats?.remaining ?? 0} tone="warm" />
        </div>
        <EmptyState
          title="当前没有到期词条"
          description="继续从词条详情页把新单词加入复习，或者等待下一批到期。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="今日到期" value={stats?.dueToday ?? items.length} tone="warm" />
        <MetricCard label="新卡" value={stats?.newCards ?? 0} />
        <MetricCard label="已完成" value={stats?.completed ?? 0} />
        <MetricCard label="剩余" value={stats?.remaining ?? items.length} tone="warm" />
      </div>

      {session ? (
        <div className="panel rounded-[1.75rem] p-5 text-sm text-[var(--color-ink-soft)]">
          当前会话开始于 {formatDateTime(session.started_at)}，已完成 {session.cards_seen} 张卡片。
        </div>
      ) : null}

      <ReviewCard item={items[0]} />
      <div className="panel rounded-[1.75rem] p-6">
        <p className="text-sm text-[var(--color-ink-soft)]">
          还剩 {items.length} 个待复习词条。你可以评分、跳过到队尾，或长期暂停某张卡，之后再手动恢复。
        </p>
        <div className="mt-5">
          <RatingButtons disabled={pending} onRate={handleRate} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={handleSkip}
            variant="secondary"
            size="sm"
          >
            跳过到队尾
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={handleSuspend}
            variant="danger"
            size="sm"
          >
            暂停复习
          </Button>
        </div>
      </div>
    </div>
  );
}
