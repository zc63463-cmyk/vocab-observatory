"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronDown, Volume2 } from "lucide-react";
import { useState } from "react";
import { springs } from "@/components/motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import type { ReviewQueueItem } from "@/lib/review/types";
import { RATING_CONFIG, type RatingKey } from "./types";
import { speakLemma, canSpeak } from "@/lib/tts";
import {
  previewSwipeRating,
  resolveSwipeRating,
} from "@/lib/review/swipe-rating";
import { WordRelationLinks } from "./WordRelationLinks";

interface FlashcardFrontProps {
  item: ReviewQueueItem;
  onReveal: () => void;
}

function FlashcardFront({ item, onReveal }: FlashcardFrontProps) {
  return (
    <motion.div
      key="front"
      className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center backface-hidden"
      style={{ backfaceVisibility: "hidden" }}
      onClick={onReveal}
      initial={{ rotateY: 0 }}
      animate={{ rotateY: 0 }}
      exit={{ rotateY: 180 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      {/* Word Display */}
      <div className="text-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            speakLemma(item.lemma, item.lang_code);
          }}
          className="group relative cursor-pointer appearance-none border-none bg-transparent p-0"
          title="点击朗读"
        >
          <h1
            className="text-6xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-7xl md:text-8xl"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            {item.lemma}
          </h1>
          {canSpeak() && (
            <span className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-70 sm:-right-10">
              <Volume2 size={22} className="text-[var(--color-ink-soft)]" />
            </span>
          )}
        </button>

        {item.ipa && (
          <p className="mt-4 text-xl text-[var(--color-ink-soft)] sm:text-2xl">
            {item.ipa}
          </p>
        )}
      </div>

      {/* Hint */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-sm text-[var(--color-ink-soft)] opacity-60">
          按 <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">Space</kbd> 或点击显示释义
          <span className="mx-2">·</span>
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">P</kbd> 朗读
        </p>
      </div>
    </motion.div>
  );
}

interface FlashcardBackProps {
  /** Disable swipe gestures while a rating is in flight or the flip is animating. */
  canSwipe: boolean;
  item: ReviewQueueItem;
  onRate: (rating: RatingKey) => void;
}

// Direction → which edge of the card fades in the preview label during drag.
// Kept in a map so the JSX below stays declarative.
const SWIPE_OVERLAY_POSITION: Record<RatingKey, string> = {
  again: "left-6 top-1/2 -translate-y-1/2",
  good: "right-6 top-1/2 -translate-y-1/2",
  easy: "left-1/2 top-6 -translate-x-1/2",
  hard: "left-1/2 bottom-6 -translate-x-1/2",
};

function FlashcardBack({ canSwipe, item, onRate }: FlashcardBackProps) {
  const [examplesOpen, setExamplesOpen] = useState(false);
  // Live preview of which direction the drag currently aims at, or null when
  // idle. We use framer-motion's onPan so the card never physically moves —
  // that would fight the 3D-rotated flip frame this sits inside. Purely
  // informational: real commit happens on onPanEnd via resolveSwipeRating.
  const [dragPreview, setDragPreview] = useState<RatingKey | null>(null);

  const semanticField =
    typeof item.metadata === "object" &&
    item.metadata &&
    "semantic_field" in item.metadata
      ? String(item.metadata.semantic_field)
      : null;

  function handlePan(_: PointerEvent, info: PanInfo) {
    if (!canSwipe) return;
    setDragPreview(previewSwipeRating({ x: info.offset.x, y: info.offset.y }));
  }

  function handlePanEnd(_: PointerEvent, info: PanInfo) {
    setDragPreview(null);
    if (!canSwipe) return;
    const rating = resolveSwipeRating(
      { x: info.offset.x, y: info.offset.y },
      { x: info.velocity.x, y: info.velocity.y },
    );
    if (rating) {
      onRate(rating);
    }
  }

  return (
    <motion.div
      key="back"
      className="absolute inset-0 flex flex-col items-center overflow-hidden p-6 backface-hidden"
      style={{ 
        backfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
      }}
      initial={{ rotateY: -180 }}
      animate={{ rotateY: 0 }}
      exit={{ rotateY: -180 }}
      transition={{ type: "spring", ...springs.smooth }}
      onPan={handlePan}
      onPanEnd={handlePanEnd}
    >
      {/*
        Scroll container. Takes remaining vertical space via flex-1 and vertically
        centers the answer card when content is small. When the user expands
        examples / word relations and content exceeds the available height, this
        container scrolls instead of letting the card push into the rating hint
        below. `min-h-0` is required so flex-1 can shrink past intrinsic size
        and overflow-y-auto actually kicks in.
      */}
      <div className="flex w-full min-h-0 flex-1 items-center justify-center overflow-y-auto">
      {/* Answer Card */}
      <div 
        className="w-full max-w-2xl rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-6 shadow-lg backdrop-blur-lg sm:p-10"
        style={{ 
          background: "var(--color-panel)",
          backdropFilter: "blur(18px)",
        }}
      >
        {/* Tags */}
        <div className="mb-6 flex flex-wrap gap-2">
          {semanticField && (
            <span className="rounded-full border border-[var(--color-pill-border)] bg-[var(--color-pill-bg)] px-3 py-1 text-xs text-[var(--color-pill-text)]">
              {semanticField}
            </span>
          )}
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1 text-xs text-[var(--color-ink-soft)]">
            {item.queue_label}
          </span>
        </div>

        {/* Word */}
        <button
          type="button"
          onClick={() => speakLemma(item.lemma, item.lang_code)}
          className="group relative cursor-pointer appearance-none border-none bg-transparent p-0"
          title="点击朗读"
        >
          <h2
            className="text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            {item.lemma}
          </h2>
          {canSpeak() && (
            <span className="absolute -right-7 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-70 sm:-right-9">
              <Volume2 size={18} className="text-[var(--color-ink-soft)]" />
            </span>
          )}
        </button>

        {item.ipa && (
          <p className="mt-2 text-lg text-[var(--color-ink-soft)]">{item.ipa}</p>
        )}

        {/* Definition */}
        <div className="mt-6 border-t border-[var(--color-border)] pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
            释义
          </p>
          <p className="mt-3 text-lg leading-relaxed text-[var(--color-ink)]">
            {item.short_definition || item.definition_md || "暂无释义"}
          </p>
        </div>

        {/* Examples */}
        {item.previewExamples && item.previewExamples.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <button
              type="button"
              onClick={() => setExamplesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                例句 ({item.previewExamples.length} 条)
              </span>
              <motion.span animate={{ rotate: examplesOpen ? 180 : 0 }}>
                <ChevronDown className="h-4 w-4 text-[var(--color-ink-soft)]" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {examplesOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: "auto", opacity: 1, marginTop: 12 }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-2 text-[var(--color-ink-soft)]">
                    {item.previewExamples.map((ex, i) => (
                      <li key={i} className="text-sm leading-relaxed">
                        {ex.text}
                        {ex.label && (
                          <span className="ml-1 text-xs text-[var(--color-ink-muted)]">
                            ({ex.label})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Word relations from metadata */}
        <WordRelationLinks metadata={item.metadata} />

        {/* Review count hint */}
        <div className="mt-6 flex items-center justify-between text-xs text-[var(--color-ink-soft)] opacity-60">
          <span>已复习 {item.review_count} 次</span>
          {item.retrievability !== null && (
            <span>记忆留存度 {Math.round(item.retrievability * 100)}%</span>
          )}
        </div>
      </div>
      </div>

      {/* Swipe preview overlay — an unobtrusive label fading in at the edge
          the gesture currently aims at. Pointer-events-none so it never
          intercepts the active drag. AnimatePresence handles the swap when
          direction crosses the dominant-axis boundary mid-gesture. */}
      <AnimatePresence>
        {dragPreview && (
          <motion.div
            key={dragPreview}
            className={`pointer-events-none absolute ${SWIPE_OVERLAY_POSITION[dragPreview]} z-10 select-none rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 py-2 text-sm font-semibold shadow-md backdrop-blur`}
            style={{ color: RATING_CONFIG[dragPreview].color }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {RATING_CONFIG[dragPreview].label}
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Rating hint: static flex footer (no longer `absolute bottom-8`). Previously
        the hint sat on top of the card's flow, which let expanded content
        collide with it. Now it occupies its own row below the scrollable card
        area and `shrink-0` guarantees the card area — not the hint — absorbs
        any layout pressure.
      */}
      <div className="mt-3 w-full shrink-0 text-center">
        <p className="text-sm text-[var(--color-ink-soft)] opacity-60">
          <span className="hidden sm:inline">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">1</kbd> Again
            {" "}<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">2</kbd> Hard
            {" "}<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">3</kbd> Good
            {" "}<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">4</kbd> Easy
            <span className="mx-2">·</span>
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">D</kbd> 查看词条
            <span className="mx-2">·</span>
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">P</kbd> 朗读
          </span>
          <span className="sm:hidden">
            滑动卡片评分：← Again · → Good · ↑ Easy · ↓ Hard
          </span>
        </p>
      </div>
    </motion.div>
  );
}

export function ZenFlashcard() {
  const { item, phase, reveal, rate, isAnimating } = useZenReviewContext();

  if (!item) return null;

  const showBack = phase === "back" || phase === "rating";
  // Swipe only lives during the fully-revealed back phase. Disabling during
  // the flip animation prevents racing the rating state machine (pending +
  // animationLock).
  const canSwipe = phase === "back" && !isAnimating;

  return (
    <div 
      className="relative mx-auto aspect-[4/3] w-full max-w-3xl cursor-pointer sm:aspect-[16/10]"
      style={{ perspective: "1200px" }}
      onClick={phase === "front" ? reveal : undefined}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ 
          transformStyle: "preserve-3d",
        }}
        animate={{ 
          rotateY: showBack ? 180 : 0,
        }}
        transition={{ 
          type: "spring", 
          stiffness: 150, 
          damping: 20,
        }}
      >
        {/* Front Face */}
        <div 
          className="absolute inset-0 rounded-[2.5rem] border border-[var(--color-border-strong)] bg-[var(--color-panel-strong)] shadow-[var(--shadow-panel-strong)]"
          style={{ 
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <FlashcardFront item={item} onReveal={reveal} />
        </div>

        {/* Back Face */}
        <div 
          className="absolute inset-0 rounded-[2.5rem] border border-[var(--color-border-strong)] bg-[var(--color-panel-strong)] shadow-[var(--shadow-panel-strong)]"
          style={{ 
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <FlashcardBack item={item} canSwipe={canSwipe} onRate={rate} />
        </div>
      </motion.div>
    </div>
  );
}
