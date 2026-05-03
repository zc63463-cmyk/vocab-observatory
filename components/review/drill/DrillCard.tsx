"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { springs } from "@/components/motion";
import type { DrillCard as DrillCardType } from "@/lib/review/drill";

/**
 * Feedback shown after a submit. When set, the card enters a "locked"
 * state: the input is disabled and Enter advances to the next card
 * instead of re-submitting. The parent owns the transition timing —
 * this component doesn't auto-advance on its own.
 */
export interface DrillCardFeedback {
  correct: boolean;
  /** The expected lemma, surfaced on both wrong AND correct answers. */
  correctAnswer: string;
  /** What the user typed, preserved so they can see their mistake. */
  submittedAnswer: string;
}

interface DrillCardProps {
  card: DrillCardType;
  /** Serial number of cards presented (including retries) for HUD. */
  sessionIndex: number;
  /** Wrong-attempt count for this specific card. Shown as a faint chip. */
  attempts: number;
  feedback: DrillCardFeedback | null;
  onSubmit: (answer: string) => void;
  onAdvance: () => void;
  onDefer: () => void;
  canDefer: boolean;
}

/**
 * Renders a single cloze card. States:
 *   - "answering": input visible, Enter submits.
 *   - "feedback":  input locked, Enter advances (via onAdvance).
 *
 * Focus discipline: the input auto-focuses when the card first mounts
 * AND whenever it transitions back to "answering" (i.e., the next card
 * begins). This keeps keyboard-only usage fluid without trapping focus.
 */
export function DrillCard({
  card,
  sessionIndex,
  attempts,
  feedback,
  onSubmit,
  onAdvance,
  onDefer,
  canDefer,
}: DrillCardProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset input + focus on new card. Keyed off progressId so that retries
  // (same progressId, different sessionIndex) don't wipe the input prematurely.
  // The feedback=null transition is the canonical "next card" signal.
  useEffect(() => {
    if (!feedback) {
      setValue("");
      inputRef.current?.focus();
    }
  }, [card.progressId, feedback]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (feedback) {
      onAdvance();
      return;
    }
    onSubmit(value);
  }

  return (
    <motion.div
      key={`${card.progressId}-${sessionIndex}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ type: "spring", ...springs.smooth }}
      className="panel-strong rounded-[2rem] p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-ink-soft)]">
        <span className="font-semibold uppercase tracking-[0.18em]">
          Cloze Drill · #{sessionIndex + 1}
        </span>
        {attempts > 0 && (
          <span className="rounded-full bg-[var(--color-surface-muted-warm)] px-2.5 py-0.5 text-[var(--color-accent-2)]">
            已错 {attempts} 次
          </span>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 sm:p-7">
        <p
          className="text-xl leading-[1.8] text-[var(--color-ink)] sm:text-2xl"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          {card.clozeText}
        </p>
        <p className="mt-3 text-xs text-[var(--color-ink-soft)] opacity-70">
          空格长度：{card.clozeLength} 字母
          {card.shortDefinition ? ` · ${card.shortDefinition}` : ""}
        </p>
      </div>

      <form className="mt-5" onSubmit={handleSubmit}>
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
          你的答案
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* readOnly (not disabled) so the input keeps form-submit
              semantics during feedback: pressing Enter while the feedback
              panel is showing advances to the next card, matching the
              submit-button's "下一张 ⏎" label. Disabled inputs don't
              participate in form submission, which would silently break
              Enter-to-advance keyboard flow. */}
          <input
            ref={inputRef}
            type="text"
            className={`flex-1 min-w-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-base text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] ${
              feedback ? "opacity-80" : ""
            }`}
            value={feedback ? feedback.submittedAnswer : value}
            onChange={(e) => setValue(e.currentTarget.value)}
            readOnly={feedback !== null}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="输入词……然后回车"
            aria-label="Drill answer input"
          />
          <Button
            type="submit"
            size="md"
            disabled={!feedback && value.trim().length === 0}
          >
            {feedback ? "下一张 ⏎" : "提交 ⏎"}
          </Button>
          {!feedback && canDefer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDefer}
            >
              晚点再看
            </Button>
          )}
        </div>
      </form>

      <AnimatePresence>
        {feedback && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", ...springs.smooth }}
            className={`mt-5 rounded-2xl border p-4 text-sm ${
              feedback.correct
                ? "border-[rgba(15,111,98,0.3)] bg-[rgba(15,111,98,0.08)]"
                : "border-[rgba(178,87,47,0.3)] bg-[var(--color-surface-muted-warm)]"
            }`}
            role="status"
          >
            <div className="flex items-center gap-2 font-semibold">
              {feedback.correct ? (
                <>
                  <Check className="h-4 w-4 text-[var(--color-accent)]" />
                  <span className="text-[var(--color-accent)]">答对了</span>
                </>
              ) : (
                <>
                  <X className="h-4 w-4 text-[var(--color-accent-2)]" />
                  <span className="text-[var(--color-accent-2)]">这张留下来重测</span>
                </>
              )}
            </div>
            <div className="mt-2 space-y-1 text-[var(--color-ink)]">
              <p>
                <span className="text-[var(--color-ink-soft)]">正确答案：</span>
                <span className="font-semibold">{feedback.correctAnswer}</span>
              </p>
              <p className="text-[var(--color-ink-soft)]">
                原句：<span className="text-[var(--color-ink)]">{card.clozeSource}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
