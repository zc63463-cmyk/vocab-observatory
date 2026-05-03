"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_REVIEW_PREFERENCES,
  type UserReviewPreferences,
} from "@/lib/review/settings";

/**
 * App-wide context for review-experience preferences (prompt modes +
 * pre-flip prediction). Lives on the `(app)` layout so every protected
 * page below it shares one fetch + one source of truth — toggling a
 * preference inside the in-zen popover therefore updates the dashboard
 * panel state and (more importantly) the live zen review session in
 * the same React tree without a refetch.
 *
 * Design notes:
 *   - The provider deliberately does NOT block render on the initial
 *     fetch. We seed with `DEFAULT_REVIEW_PREFERENCES` and reconcile
 *     when the GET resolves. Worst case during the ~50–200 ms fetch
 *     window: the user briefly sees the pre-feature defaults (forward
 *     mode, no slider). Acceptable — never worse than the pre-feature
 *     baseline, and it keeps zen's hot path snappy.
 *
 *   - `save()` is the one mutating path: it does an optimistic local
 *     update, fires the POST, then reconciles with the server's
 *     authoritative reply. On error, we revert and surface the message
 *     so the caller (e.g. a popover) can toast it. The optimistic step
 *     is what makes the zen-mid-review toggle feel instantaneous.
 *
 *   - We expose `loading` for first-fetch UIs that want a "loading…"
 *     hint, but consumers reading just `preferences` are insulated from
 *     it.
 */

interface ReviewPreferencesContextValue {
  preferences: UserReviewPreferences;
  loading: boolean;
  /**
   * Persists a partial update to the server, optimistically applies it
   * locally, and resolves to the server-confirmed shape. Throws when
   * the server rejects the payload so callers can surface errors.
   */
  save: (
    partial: Partial<UserReviewPreferences>,
  ) => Promise<UserReviewPreferences>;
  /** Re-fetch from the server. Useful after an external mutation. */
  refresh: () => Promise<void>;
}

const ReviewPreferencesContext =
  createContext<ReviewPreferencesContextValue | null>(null);

export function ReviewPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserReviewPreferences>(
    DEFAULT_REVIEW_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/review/preferences", {
        method: "GET",
        // `no-store` ensures the cross-tab toggle scenario stays
        // honest: opening a second tab + flipping there + coming back
        // here and clicking refresh actually re-reads the server, not
        // a cached browser response.
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as UserReviewPreferences;
      if (mountedRef.current) setPreferences(payload);
    } catch {
      // Swallow — preferences are non-critical to review-flow correctness.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (partial: Partial<UserReviewPreferences>) => {
      // Optimistic merge — UI reflects the change immediately so the
      // zen card can re-resolve its prompt and the slider can appear /
      // disappear on the very next render.
      const previous = preferences;
      const optimistic: UserReviewPreferences = {
        predictionEnabled:
          partial.predictionEnabled ?? previous.predictionEnabled,
        promptModes: partial.promptModes
          ? [...partial.promptModes]
          : [...previous.promptModes],
      };
      setPreferences(optimistic);

      try {
        const res = await fetch("/api/review/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        const payload = (await res.json()) as UserReviewPreferences & {
          error?: unknown;
        };
        if (!res.ok) {
          throw new Error(
            typeof payload.error === "string" ? payload.error : "保存失败",
          );
        }
        if (mountedRef.current) setPreferences(payload);
        return payload;
      } catch (err) {
        // Revert the optimistic change so the UI stays honest about
        // server state.
        if (mountedRef.current) setPreferences(previous);
        throw err;
      }
    },
    [preferences],
  );

  const value = useMemo<ReviewPreferencesContextValue>(
    () => ({ preferences, loading, save, refresh }),
    [preferences, loading, save, refresh],
  );

  return (
    <ReviewPreferencesContext.Provider value={value}>
      {children}
    </ReviewPreferencesContext.Provider>
  );
}

/**
 * Read-only access to the shared preferences. Returns `null` when no
 * provider is mounted; callers who can tolerate that should branch on
 * the result (see the legacy `useReviewPreferences` hook for an example
 * of fallback-to-local-fetch behaviour).
 */
export function useReviewPreferencesContext():
  | ReviewPreferencesContextValue
  | null {
  return useContext(ReviewPreferencesContext);
}
