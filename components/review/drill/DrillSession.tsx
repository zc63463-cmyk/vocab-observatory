"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import {
  createDrillQueue,
  deferDrillCard,
  remainingInDrill,
  submitDrillAnswer,
  type DrillCard as DrillCardType,
  type DrillQueueState,
  type DrillMode,
} from "@/lib/review/drill";
import { DrillCard, type DrillCardFeedback } from "./DrillCard";

const FEEDBACK_DELAY_MS = 900;
const FEEDBACK_DELAY_WRONG_MS = 1400;

interface DrillSessionProps {
  /**
   * Initial deck. The session clones it internally; callers may mutate
   * the source array later without affecting the running session.
   */
  initialCards: ReadonlyArray<DrillCardType>;
  /**
   * Test mode governing how each card is rendered and what the user
   * is asked to recall.
   */
  mode: DrillMode;
  /**
   * Called once the queue has fully drained. The terminal state is
   * handed back so the summary screen can read passedByCard /
   * attemptsByCard without re-running the engine.
   */
  onDone: (finalState: DrillQueueState) => void;
  onExit: () => void;
}

/**
 * Plays through a drill session. Owns the DrillQueueState reducer. The
 * session advances when the user either
 *   - types a correct answer → short fixed delay → next card
 *   - types a wrong answer → longer delay + feedback → next (back of queue)
 *   - presses the Next button during feedback → skips the wait
 *
 * Auto-advance vs manual: auto-advance runs on a timer to keep flow state
 * alive, but pressing Enter during feedback advances immediately. Both
 * paths call the same `advance()` to ensure we never double-fire.
 */
export function DrillSession({ initialCards, mode, onDone, onExit }: DrillSessionProps) {
  const [state, setState] = useState<DrillQueueState>(() =>
    createDrillQueue(initialCards),
  );
  const [feedback, setFeedback] = useState<DrillCardFeedback | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirrors `state` so the advance timer callback always reads the
  // post-submit state even though React's state is async. Without this,
  // on a correct answer where next queue becomes empty we'd miss the
  // "done" transition.
  const pendingNextStateRef = useRef<DrillQueueState | null>(null);

  // If the caller re-enters with a different initial deck (e.g., user
  // navigates back to picker then resumes), reset cleanly. Keyed off
  // the reference identity of `initialCards`.
  useEffect(() => {
    const fresh = createDrillQueue(initialCards);
    setState(fresh);
    setFeedback(null);
    setSessionIndex(0);
    pendingNextStateRef.current = null;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, [initialCards]);

  // Cleanup any outstanding timer on unmount so a user who exits
  // mid-feedback doesn't get a stray setState on an unmounted tree.
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const advance = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    const nextState = pendingNextStateRef.current;
    pendingNextStateRef.current = null;
    if (!nextState) {
      setFeedback(null);
      return;
    }
    if (nextState.phase === "done") {
      // Keep `feedback` non-null until the summary mounts so the last
      // correct/wrong pulse isn't lost in a flash of blank screen.
      setFeedback(null);
      setState(nextState);
      onDone(nextState);
      return;
    }
    setFeedback(null);
    setState(nextState);
    setSessionIndex((i) => i + 1);
  }, [onDone]);

  const handleSubmit = useCallback(
    (raw: string) => {
      if (feedback) return;
      if (state.queue.length === 0) return;

      const result = submitDrillAnswer(state, raw);
      const submittedAnswer = raw.trim();
      pendingNextStateRef.current = result.next;
      setFeedback({
        correct: result.correct,
        correctAnswer: result.correctAnswer,
        submittedAnswer,
      });

      const delay = result.correct ? FEEDBACK_DELAY_MS : FEEDBACK_DELAY_WRONG_MS;
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        advance();
      }, delay);
    },
    [state, feedback, advance],
  );

  const handleDefer = useCallback(() => {
    if (feedback) return;
    const nextState = deferDrillCard(state);
    if (nextState === state) return;
    setState(nextState);
    setSessionIndex((i) => i + 1);
  }, [state, feedback]);

  const current = state.queue[0];
  const remaining = remainingInDrill(state);
  const unique = state.totalUnique;
  const passed = Object.keys(state.passedByCard).length;
  const passedPct = unique === 0 ? 0 : Math.round((passed / unique) * 100);

  // Session UI only renders when there's a live card. When the queue
  // drains to zero, the parent-level `onDone` hands off to the summary
  // screen and this component unmounts.
  if (!current) {
    return null;
  }

  const currentAttempts = state.attemptsByCard[current.progressId] ?? 0;

  const modeLabel = mode === "definition" ? "词汇填空" : "完形填空";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-2 text-xs text-[var(--color-ink-soft)]">
        <span>
          {modeLabel} · 剩 <strong className="text-[var(--color-ink)]">{remaining}</strong> 张 · 通过{" "}
          <strong className="text-[var(--color-accent)]">{passed}</strong>/{unique}{" "}
          ({passedPct}%)
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onExit}
        >
          退出自测
        </Button>
      </div>

      <AnimatePresence mode="wait">
        <DrillCard
          key={`${current.progressId}-${sessionIndex}`}
          card={current}
          mode={mode}
          sessionIndex={sessionIndex}
          attempts={currentAttempts}
          feedback={feedback}
          onSubmit={handleSubmit}
          onAdvance={advance}
          onDefer={handleDefer}
          canDefer={state.queue.length > 1}
        />
      </AnimatePresence>
    </div>
  );
}
