"use client";

import { useCallback, useState } from "react";
import type { ReviewQueueItem, ReviewQueueStats, ReviewSessionSummary } from "@/lib/review/types";
import type { RatingKey } from "./types";

interface QueueResponse {
  items: ReviewQueueItem[];
  session: ReviewSessionSummary | null;
  stats: ReviewQueueStats | null;
}

interface UseZenReviewReturn {
  items: ReviewQueueItem[];
  setItems: React.Dispatch<React.SetStateAction<ReviewQueueItem[]>>;
  session: ReviewSessionSummary | null;
  setSession: React.Dispatch<React.SetStateAction<ReviewSessionSummary | null>>;
  stats: ReviewQueueStats | null;
  setStats: React.Dispatch<React.SetStateAction<ReviewQueueStats | null>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  fetchQueue: () => Promise<QueueResponse>;
  submitRating: (item: ReviewQueueItem, rating: RatingKey) => Promise<string>;
  submitUndo: (reviewLogId: string) => Promise<ReviewQueueItem | null>;
  skipItem: (item: ReviewQueueItem) => Promise<ReviewQueueItem | null>;
}

export function useZenReview(): UseZenReviewReturn {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [session, setSession] = useState<ReviewSessionSummary | null>(null);
  const [stats, setStats] = useState<ReviewQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const submitRating = useCallback(
    async (item: ReviewQueueItem, rating: RatingKey): Promise<string> => {
      if (!session) throw new Error("无活跃会话");

      const response = await fetch("/api/review/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressId: item.progress_id,
          rating,
          sessionId: session.id,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "提交评分失败");
      }
      return payload.reviewLogId as string;
    },
    [session],
  );

  const submitUndo = useCallback(async (reviewLogId: string): Promise<ReviewQueueItem | null> => {
    if (!session) throw new Error("无活跃会话");

    const response = await fetch("/api/review/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewLogId,
        sessionId: session.id,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "撤销失败");
    }
    return (payload.restoredItem as ReviewQueueItem) ?? null;
  }, [session]);

  const skipItem = useCallback(async (item: ReviewQueueItem): Promise<ReviewQueueItem | null> => {
    if (!session) return null;
    
    const response = await fetch("/api/review/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: item.progress_id,
        sessionId: session.id,
      }),
    });
    
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "跳过失败");
    }
    
    return item; // Returns the skipped item to be moved to back of queue
  }, [session]);

  return {
    items,
    setItems,
    session,
    setSession,
    stats,
    setStats,
    loading,
    setLoading,
    error,
    setError,
    fetchQueue,
    submitRating,
    submitUndo,
    skipItem,
  };
}
