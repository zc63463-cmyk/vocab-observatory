"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useZenReview } from "./useZenReview";
import { useZenShortcuts } from "./useZenShortcuts";
import { useOmniStore } from "@/components/omni/useOmniStore";
import type { ReviewQueueItem, ReviewQueueStats, ReviewSessionSummary } from "@/lib/review/types";
import type { ZenState, ZenAction, RatingKey, ZenPhase } from "./types";

interface ZenContextValue extends ZenState {
  // Actions
  reveal: () => void;
  rate: (rating: RatingKey) => void;
  skip: () => void;
  exit: () => void;
  retry: () => void;
  // Meta
  totalCount: number;
  completedCount: number;
  progress: number;
  isAnimating: boolean;
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

    case "SKIP":
      if (state.item && state.items.length > 1) {
        const skipped = state.item;
        const remaining = state.items.slice(1);
        return {
          ...state,
          items: [...remaining, skipped],
          item: remaining[0],
          phase: "front",
        };
      }
      return state;

    case "SET_MESSAGE":
      return { ...state, message: action.message };

    case "SET_ERROR":
      return { ...state, phase: "error", message: action.message, pending: false };

    case "SET_PENDING":
      return { ...state, pending: action.pending };

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
  
  const {
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
    skipItem,
  } = useZenReview();

  const [state, dispatch] = useReducer(zenReducer, initialState);

  // Initial load
  useEffect(() => {
    let mounted = true;
    
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchQueue();
        if (!mounted) return;
        
        setItems(data.items);
        setSession(data.session);
        setStats(data.stats);
        dispatch({ type: "INIT", items: data.items, session: data.session, stats: data.stats });
        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "加载复习队列失败";
        setError(message);
        dispatch({ type: "SET_ERROR", message });
        setLoading(false);
      }
    };

    void load();
    
    return () => { mounted = false; };
  }, [fetchQueue, setItems, setSession, setStats, setLoading, setError]);

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
      if (!state.item || !session || state.pending || animationLock) return;

      dispatch({ type: "RATE", rating });
      setAnimationLock(true);

      try {
        await submitRating(state.item, rating);
        updateStatsAfterRemoval(state.item, true);

        // Trigger animation, then move to next
        const nextItems = state.items.slice(1);
        
        // Wait for card exit animation
        await new Promise((resolve) => setTimeout(resolve, 350));

        if (nextItems.length > 0) {
          dispatch({ type: "NEXT_CARD", item: nextItems[0] });
        } else {
          // Need to fetch more
          try {
            const data = await fetchQueue();
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
            const message = err instanceof Error ? err.message : "刷新队列失败";
            dispatch({ type: "SET_ERROR", message });
          }
        }
        
        addToast(`已记录 ${rating.toUpperCase()}`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "提交评分失败";
        dispatch({ type: "SET_MESSAGE", message });
        addToast(message, "error");
      } finally {
        setAnimationLock(false);
      }
    },
    [state.item, state.items, state.pending, session, animationLock, submitRating, updateStatsAfterRemoval, fetchQueue, setItems, setSession, setStats, addToast]
  );

  // Skip action
  const skip = useCallback(async () => {
    if (!state.item || !session || state.pending || animationLock) return;

    try {
      await skipItem(state.item);
      dispatch({ type: "SKIP" });
      addToast("已跳过，卡片已移到队尾", "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : "跳过失败";
      addToast(message, "error");
    }
  }, [state.item, session, state.pending, animationLock, skipItem, addToast]);

  // Exit action
  const exit = useCallback(() => {
    router.push("/review");
  }, [router]);

  // Retry action
  const retry = useCallback(() => {
    window.location.reload();
  }, []);

  // Keyboard shortcuts
  useZenShortcuts({
    phase: state.phase,
    onReveal: reveal,
    onRate: rate,
    onExit: exit,
    onSkip: skip,
    isOmniOpen: omni.isOpen,
    isAnimating: animationLock,
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
      skip,
      exit,
      retry,
      totalCount,
      completedCount,
      progress,
      isAnimating: animationLock,
    }),
    [state, reveal, rate, skip, exit, retry, totalCount, completedCount, progress, animationLock]
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
