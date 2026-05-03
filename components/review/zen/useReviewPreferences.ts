"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REVIEW_PREFERENCES,
  type UserReviewPreferences,
} from "@/lib/review/settings";
import { useReviewPreferencesContext } from "@/components/review/ReviewPreferencesProvider";

interface UseReviewPreferencesReturn {
  preferences: UserReviewPreferences;
  loading: boolean;
  error: string | null;
  /** Refetches preferences from the server. Useful after a settings save. */
  refresh: () => Promise<void>;
}

/**
 * Read-only zen-side accessor for review preferences.
 *
 * Prefers the app-wide `ReviewPreferencesProvider` (mounted in
 * `(app)/layout.tsx`) so an in-zen popover save propagates live to the
 * running review session. When the provider is missing — e.g. during
 * tests, or if a sibling page tree forgets to mount it — falls back to
 * a local fetch so legacy call sites keep working unchanged.
 *
 * Errors are captured but never thrown: preferences are non-critical to
 * the review flow, so a server hiccup must not break the session. Worst
 * case during a bad fetch: the user sees the pre-feature defaults
 * (forward mode, no slider) — same as if the feature were off.
 */
export function useReviewPreferences(): UseReviewPreferencesReturn {
  const ctx = useReviewPreferencesContext();
  const [localPrefs, setLocalPrefs] =
    useState<UserReviewPreferences>(DEFAULT_REVIEW_PREFERENCES);
  const [localLoading, setLocalLoading] = useState(ctx === null);
  const [error, setError] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/review/preferences", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("无法读取偏好设置");
      const payload = (await res.json()) as UserReviewPreferences;
      setLocalPrefs(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ctx !== null) return; // Provider is the source of truth, skip local fetch.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/review/preferences", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("无法读取偏好设置");
        const payload = (await res.json()) as UserReviewPreferences;
        if (!cancelled) setLocalPrefs(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "未知错误");
        }
      } finally {
        if (!cancelled) setLocalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  if (ctx) {
    return {
      preferences: ctx.preferences,
      loading: ctx.loading,
      error: null,
      refresh: ctx.refresh,
    };
  }

  return {
    preferences: localPrefs,
    loading: localLoading,
    error,
    refresh: refreshLocal,
  };
}
