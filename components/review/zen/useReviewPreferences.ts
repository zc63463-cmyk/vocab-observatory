"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REVIEW_PREFERENCES,
  type UserReviewPreferences,
} from "@/lib/review/settings";

interface UseReviewPreferencesReturn {
  preferences: UserReviewPreferences;
  loading: boolean;
  error: string | null;
  /** Refetches preferences from the server. Useful after a settings save. */
  refresh: () => Promise<void>;
  /** Optimistically replaces local state. Server stays untouched. */
  setLocal: (next: UserReviewPreferences) => void;
}

/**
 * Client-side fetcher for review-experience preferences. Returns defaults
 * during the loading window so consumers can render immediately — the
 * worst case while preferences haven't arrived is "user sees forward mode
 * without a prediction slider", which is the same as the pre-feature
 * behaviour. We do NOT block render on this fetch.
 *
 * Errors are captured but never thrown — preferences are non-critical to
 * the review flow, so a server hiccup must not break the session.
 */
export function useReviewPreferences(): UseReviewPreferencesReturn {
  const [preferences, setPreferences] =
    useState<UserReviewPreferences>(DEFAULT_REVIEW_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/review/preferences", { method: "GET" });
      if (!res.ok) throw new Error("无法读取偏好设置");
      const payload = (await res.json()) as UserReviewPreferences;
      setPreferences(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/review/preferences", { method: "GET" });
        if (!res.ok) throw new Error("无法读取偏好设置");
        const payload = (await res.json()) as UserReviewPreferences;
        if (!cancelled) setPreferences(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "未知错误");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    preferences,
    loading,
    error,
    refresh,
    setLocal: setPreferences,
  };
}
