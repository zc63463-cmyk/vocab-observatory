"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useZenReview } from "./useZenReview";
import { useZenShortcuts } from "./useZenShortcuts";
import { useOmniStore } from "@/components/omni/useOmniStore";
import type { ReviewQueueItem } from "@/lib/review/types";
import type { ZenState, ZenAction, RatingKey, ZenReviewedItem, ZenUiState } from "./types";
import { RATING_CONFIG } from "./types";

interface ZenContextValue extends ZenState {
  // Actions
  reveal: () => void;
  rate: (rating: RatingKey) => void;
  exit: () => void;
  retry: () => void;
  toggleHistory: () => void;
  undo: (reviewLogId: string) => void;
  // Meta
  totalCount: number;
  completedCount: number;
  progress: number;
  isAnimating: boolean;
  uiState: ZenUiState;
}

const initialState: ZenState = {
  phase: "loading",
  item: null,
  items: [],
  session: null,
  stats: null,
  message: "",
  pending: false,
  lastRating: null,
};

function zenReducer(state: ZenState, action: ZenAction): ZenState {
  switch (action.type) {
    case "INIT":
      if (action.items.length === 0) {
        return {
          ...state,
          phase: "done",
          items: [],
          item: null,
          session: action.session,
          stats: action.stats,
        };
      }
      return {
        ...state,
        phase: "front",
        items: action.items,
        item: action.items[0],
        session: action.session,
        stats: action.stats,
        message: "",
      };

    case "REVEAL":
      if (state.phase === "front" && state.item) {
        return { ...state, phase: "back" };
      }
      return state;

    case "RATE":
      if (state.phase === "back" && state.item) {
        return { ...state, phase: "rating", pending: true, lastRating: action.rating };
      }
      return state;

    case "NEXT_CARD":
      if (action.item) {
        return {
          ...state,
          phase: "front",
          item: action.item,
          items: state.items.slice(1),
          pending: false,
          lastRating: null,
        };
      }
      // Queue exhausted, need to fetch more or done
      return { ...state, phase: "loading", pending: false, lastRating: null };

    case "REFRESH_QUEUE":
      if (action.items.length === 0) {
        return {
          ...state,
          phase: "done",
          items: [],
          item: null,
          session: action.session,
          stats: action.stats,
          pending: false,
        };
      }
      return {
        ...state,
        phase: "front",
        items: action.items,
        item: action.items[0],
        session: action.session,
        stats: action.stats,
        pending: false,
      };

    case "SET_MESSAGE":
      return { ...state, message: action.message };

    case "SET_ERROR":
      return { ...state, phase: "error", message: action.message, pending: false };

    case "SET_PENDING":
      return { ...state, pending: action.pending };

    case "RESTORE_BACK":
      return { ...state, phase: "back", pending: false, lastRating: null };

    case "RESTORE_CARD": {
      // Fix-6: Remove duplicate from items before inserting restored card at front
      const dedupedItems = state.items.filter(
        (i) => i.progress_id !== action.item.progress_id
      );
      return {
        ...state,
        phase: "back",
        item: action.item,
        items: [action.item, ...dedupedItems],
        pending: false,
        lastRating: null,
      };
    }

    default:
      return state;
  }
}

const ZenContext = createContext<ZenContextValue | null>(null);

interface ZenProviderProps {
  children: ReactNode;
}

export function ZenReviewProvider({ children }: ZenProviderProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const omni = useOmniStore();
  const [animationLock, setAnimationLock] = useState(false);
  const mountedRef = useRef(true);
  const undoInFlightRef = useRef(false); // Synchronous guard for rapid-fire clicks (Fix-5)
  const cardShownAtRef = useRef<number | null>(null); // Per-card shown timestamp for durationMs
  
  // UI state for history drawer (separate from core review state machine)
  const [uiState, setUiState] = useState<ZenUiState>({
    isHistoryOpen: false,
    isUndoing: false,
    sessionHistory: [],
  });
  
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  const {
    items,
    setItems,
    session,
    setSession,
    stats,
    setStats,
    fetchQueue,
    submitRating,
    submitUndo,
  } = useZenReview();

  const [state, dispatch] = useReducer(zenReducer, initialState);

  // Track when each card becomes visible so we can record durationMs on rating
  const currentProgressId = state.item?.progress_id ?? null;
  useEffect(() => {
    if (currentProgressId && (state.phase === "front" || state.phase === "back")) {
      cardShownAtRef.current = Date.now();
    }
    if (state.phase === "done" || state.phase === "error" || state.phase === "loading") {
      cardShownAtRef.current = null;
    }
  }, [currentProgressId, state.phase]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    
    const load = async () => {
      try {
        const data = await fetchQueue();
        if (!mounted) return;
        
        setItems(data.items);
        setSession(data.session);
        setStats(data.stats);
        dispatch({ type: "INIT", items: data.items, session: data.session, stats: data.stats });
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "加载复习队列失败";
        dispatch({ type: "SET_ERROR", message });
      }
    };

    void load();
    
    return () => { mounted = false; };
  }, [fetchQueue, setItems, setSession, setStats]);

  // Update stats helper
  const updateStatsAfterRemoval = useCallback((item: ReviewQueueItem, increment: boolean) => {
    setStats((current) => {
      if (!current) return current;
      return {
        ...current,
        completed: current.completed + (increment ? 1 : 0),
        dueToday: Math.max(current.dueToday - 1, 0),
        newCards: Math.max(current.newCards - (item.is_new ? 1 : 0), 0),
        remaining: Math.max(current.remaining - 1, 0),
      };
    });

    if (increment) {
      setSession((current) => {
        if (!current) return current;
        return { ...current, cards_seen: current.cards_seen + 1 };
      });
    }
  }, [setStats, setSession]);

  // Reveal action
  const reveal = useCallback(() => {
    dispatch({ type: "REVEAL" });
  }, []);

  // Rate action with API call
  const rate = useCallback(
    async (rating: RatingKey) => {
      if (!state.item || !session || state.pending || animationLock || uiState.isUndoing) return;

      dispatch({ type: "RATE", rating });
      setAnimationLock(true);

      let ratingTimeout: ReturnType<typeof setTimeout> | null = null;

      try {
        // Run API call and animation delay in PARALLEL.
        // Total wait = max(API, 350ms) instead of API + 350ms.
        const animationPromise = new Promise<void>((resolve) => {
          ratingTimeout = setTimeout(() => resolve(), 350);
        });
        const [reviewLogId] = await Promise.all([
          submitRating(state.item, rating),
          animationPromise,
        ]);

        if (!mountedRef.current) return;

        updateStatsAfterRemoval(state.item, true);

        // Add to session history (only on API success)
        const shownAt = cardShownAtRef.current;
        const durationMs = shownAt !== null ? Date.now() - shownAt : undefined;
        const historyItem: ZenReviewedItem = {
          id: reviewLogId,
          cardId: state.item.progress_id,
          wordId: state.item.word_id,
          word: state.item.lemma,
          definition: state.item.short_definition,
          rating,
          ratingLabel: RATING_CONFIG[rating].label,
          answeredAt: new Date().toISOString(),
          durationMs,
          canUndo: true,
        };
        setUiState((prev) => ({
          ...prev,
          sessionHistory: [
            { ...historyItem, canUndo: true },
            ...prev.sessionHistory.map((h) => ({ ...h, canUndo: false })),
          ],
        }));

        const nextItems = state.items.slice(1);

        if (nextItems.length > 0) {
          dispatch({ type: "NEXT_CARD", item: nextItems[0] });
        } else {
          // Need to fetch more
          try {
            const data = await fetchQueue();
            if (!mountedRef.current) return;
            setItems(data.items);
            setSession(data.session);
            setStats(data.stats);
            dispatch({ 
              type: "REFRESH_QUEUE", 
              items: data.items, 
              session: data.session, 
              stats: data.stats 
            });
          } catch (err) {
            if (!mountedRef.current) return;
            const message = err instanceof Error ? err.message : "刷新队列失败";
            dispatch({ type: "SET_ERROR", message });
          }
        }
        
        addToast(`已记录 ${rating.toUpperCase()}`, "success");
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : "提交评分失败";
        // Restore phase to "back" so user can retry
        dispatch({ type: "RESTORE_BACK" });
        dispatch({ type: "SET_MESSAGE", message });
        addToast(message, "error");
      } finally {
        if (ratingTimeout) clearTimeout(ratingTimeout);
        if (mountedRef.current) {
          setAnimationLock(false);
        }
      }
    },
    [state.item, state.items, state.pending, session, animationLock, uiState.isUndoing, submitRating, updateStatsAfterRemoval, fetchQueue, setItems, setSession, setStats, addToast]
  );

  // Exit action
  const exit = useCallback(() => {
    router.push("/review");
  }, [router]);

  // Open word page in new tab
  const openWordPage = useCallback(() => {
    if (!state.item) return;
    window.open(`/words/${state.item.slug}`, "_blank", "noopener,noreferrer");
  }, [state.item]);

  // Retry action
  const retry = useCallback(() => {
    window.location.reload();
  }, []);

  // Toggle history drawer (UI-only state, separate from review phase)
  const toggleHistory = useCallback(() => {
    setUiState((prev) => ({ ...prev, isHistoryOpen: !prev.isHistoryOpen }));
  }, []);

  // Undo the most recent rating (Fix-5: added undoInFlightRef sync guard)
  const undo = useCallback(
    async (reviewLogId: string) => {
      // Synchronous ref check prevents race conditions from rapid-fire clicks
      if (undoInFlightRef.current || uiState.isUndoing) return;
      undoInFlightRef.current = true;
      setUiState((prev) => ({ ...prev, isUndoing: true }));

      try {
        const restoredItem = await submitUndo(reviewLogId);

        // Mark history item as undone; no item gets canUndo after undo
        setUiState((prev) => ({
          ...prev,
          isUndoing: false,
          sessionHistory: prev.sessionHistory.map((h) =>
            h.id === reviewLogId
              ? { ...h, undone: true, canUndo: false }
              : h
          ),
        }));

        if (restoredItem) {
          dispatch({ type: "RESTORE_CARD", item: restoredItem });
        }

        // Roll back stats
        setStats((current) => {
          if (!current) return current;
          return {
            ...current,
            completed: Math.max(current.completed - 1, 0),
            remaining: current.remaining + 1,
          };
        });
        setSession((current) => {
          if (!current) return current;
          return { ...current, cards_seen: Math.max(current.cards_seen - 1, 0) };
        });

        addToast("已撤销评分，可重新评分", "success");
      } catch (err) {
        if (!mountedRef.current) return;
        setUiState((prev) => ({ ...prev, isUndoing: false }));
        const message = err instanceof Error ? err.message : "撤销失败";
        addToast(message, "error");
      } finally {
        undoInFlightRef.current = false; // Reset sync guard
      }
    },
    [uiState.isUndoing, submitUndo, setStats, setSession, addToast]
  );

  // Keyboard shortcuts
  useZenShortcuts({
    phase: state.phase,
    onReveal: reveal,
    onRate: rate,
    onExit: exit,
    onToggleHistory: toggleHistory,
    onOpenWordPage: openWordPage,
    isOmniOpen: omni.isOpen,
    isAnimating: animationLock,
    isHistoryOpen: uiState.isHistoryOpen,
  });

  // Calculate progress
  const totalCount = (stats?.completed ?? 0) + (stats?.remaining ?? items.length);
  const completedCount = stats?.completed ?? 0;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const value = useMemo<ZenContextValue>(
    () => ({
      ...state,
      reveal,
      rate,
      exit,
      retry,
      toggleHistory,
      undo,
      totalCount,
      completedCount,
      progress,
      isAnimating: animationLock,
      uiState,
    }),
    [state, reveal, rate, exit, retry, toggleHistory, undo, totalCount, completedCount, progress, animationLock, uiState]
  );

  return <ZenContext.Provider value={value}>{children}</ZenContext.Provider>;
}

export function useZenReviewContext(): ZenContextValue {
  const ctx = useContext(ZenContext);
  if (!ctx) {
    throw new Error("useZenReviewContext must be used within ZenReviewProvider");
  }
  return ctx;
}
