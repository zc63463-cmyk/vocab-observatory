"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { Sparkles, SpellCheck2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { springs } from "@/components/motion";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingButtons } from "@/components/review/RatingButtons";
import { ReviewCard } from "@/components/review/ReviewCard";
import { ReviewProgressBar } from "@/components/review/ReviewProgressBar";
import { CompletionCelebration } from "@/components/review/CompletionCelebration";
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

  const fetchQueue = useCallback(async (): Promise<QueueResponse> => {
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
  }, []);

  const loadQueue = useCallback(async (showLoader = true) => {
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
  }, [fetchQueue]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void loadQueue();
    }, 0);

    return () => {
      window.clearTimeout(initialLoadTimer);
    };
  }, [loadQueue]);

  function updateStatsAfterRemoval(item: ReviewQueueItem, incrementCompleted = false) {
    setStats((current) =>
      current
        ? {
            completed: current.completed + (incrementCompleted ? 1 : 0),
            deferredNewCards: current.deferredNewCards,
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

  const handleRate = useCallback((rating: "again" | "hard" | "good" | "easy") => {
    const current = items[0];
    if (!current || !session || pending) {
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
  }, [addToast, items, loadQueue, pending, session]);

  const handleSkip = useCallback(() => {
    const current = items[0];
    if (!current || !session || pending) {
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
  }, [addToast, items, pending, session]);

  const handleSuspend = useCallback(() => {
    const current = items[0];
    if (!current || !session || pending) {
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
  }, [addToast, items, loadQueue, pending, session]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Don't trigger if modifiers are held
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      switch (e.key) {
        case "1":
          handleRate("again");
          break;
        case "2":
          handleRate("hard");
          break;
        case "3":
          handleRate("good");
          break;
        case "4":
          handleRate("easy");
          break;
        case "s":
        case "S":
          handleSkip();
          break;
        case "p":
        case "P":
          handleSuspend();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRate, handleSkip, handleSuspend]);

  if (loading) {
    return <EmptyState title="正在加载" description="正在获取当前到期的词条。" />;
  }

  const completedCount = stats?.completed ?? 0;
  const remainingCount = stats?.remaining ?? items.length;
  const isQueueDone = items.length === 0 && completedCount > 0;

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <MetricCard label="今日到期" value={stats?.dueToday ?? 0} tone="warm" />
          <MetricCard label="新卡" value={stats?.newCards ?? 0} />
          <MetricCard label="已完成" value={completedCount} />
          <MetricCard label="剩余" value={remainingCount} tone="warm" />
        </div>

        {message ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-muted-warm)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
            {message}
          </div>
        ) : null}

        {isQueueDone ? (
          <CompletionCelebration
            completedCount={completedCount}
            sessionCardsSeen={session?.cards_seen ?? 0}
          />
        ) : (
          <EmptyState
            title="当前没有到期词条"
            description="继续从词条详情页把新单词加入复习，或者等待下一批到期。"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:flex-1 sm:gap-4 md:grid-cols-4">
          <MetricCard label="今日到期" value={stats?.dueToday ?? items.length} tone="warm" />
          <MetricCard label="新卡" value={stats?.newCards ?? 0} />
          <MetricCard label="已完成" value={completedCount} />
          <MetricCard label="剩余" value={remainingCount} tone="warm" />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/review/zen"
            className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-glass-hover)] sm:px-5"
          >
            <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
            <span>禅意模式</span>
          </a>
          {/* Drill is a separate self-test flow — intentionally does NOT
              affect FSRS scheduling. Placed alongside zen entry so users see
              both routes from the same queue page, but visually lighter to
              signal "utility tool" rather than "core review". */}
          <a
            href="/review/drill"
            className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)] sm:px-5"
          >
            <SpellCheck2 className="h-4 w-4 text-[var(--color-accent-2)]" />
            <span>完形自测</span>
          </a>
        </div>
      </div>

      <ReviewProgressBar completed={completedCount} remaining={remainingCount} />

      {stats?.deferredNewCards ? (
        <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          This batch is holding back {stats.deferredNewCards} new cards until the active review load clears.
        </div>
      ) : null}

      {session ? (
        <div className="panel rounded-[1.75rem] p-5 text-sm text-[var(--color-ink-soft)]">
          当前会话开始于 {formatDateTime(session.started_at)}，已完成 {session.cards_seen} 张卡片。
        </div>
      ) : null}

      {message ? (
        <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-muted-warm)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {message}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={items[0].progress_id}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={{ type: "spring", ...springs.smooth }}
        >
          <ReviewCard item={items[0]} />
        </motion.div>
      </AnimatePresence>
      <div className="panel rounded-[1.75rem] p-6">
        <p className="text-sm text-[var(--color-ink-soft)]">
          还剩 {items.length} 个待复习词条。你可以评分、跳过到队尾，或长期暂停某张卡，之后再手动恢复。
        </p>
        <div className="mt-2 text-xs text-[var(--color-ink-soft)] opacity-70">
          键盘快捷键：1=Again / 2=Hard / 3=Good / 4=Easy / S=跳过 / P=暂停
        </div>
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
