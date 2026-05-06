"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Volume2 } from "lucide-react";
import { useState } from "react";
import { springs } from "@/components/motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import type { ReviewQueueItem } from "@/lib/review/types";
import { speakLemma, canSpeak } from "@/lib/tts";
import { WordRelationLinks } from "./WordRelationLinks";
import { ZenDefinitionRenderer } from "./ZenDefinitionRenderer";

function FlashcardFront({
  item,
  onReveal,
}: {
  item: ReviewQueueItem;
  onReveal: () => void;
}) {
  return (
    <motion.div
      key="front"
      className="absolute inset-0 flex flex-col items-center justify-center backface-hidden cursor-pointer"
      style={{ backfaceVisibility: "hidden" }}
      onClick={onReveal}
      initial={{ rotateY: 0 }}
      animate={{ rotateY: 0 }}
      exit={{ rotateY: 180 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      <div className="flex w-full flex-1 items-center justify-center px-6 sm:px-10">
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
      </div>

      <div className="absolute bottom-3 left-0 right-0 text-center">
        <p className="text-sm text-[var(--color-ink-soft)] opacity-60">
          按 <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">Space</kbd> 或点击显示答案
          <span className="mx-2">·</span>
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">P</kbd> 朗读
        </p>
      </div>
    </motion.div>
  );
}

interface FlashcardBackProps {
  item: ReviewQueueItem;
}

function FlashcardBack({ item }: FlashcardBackProps) {
  const [examplesOpen, setExamplesOpen] = useState(false);

  const semanticField =
    typeof item.metadata === "object" &&
    item.metadata &&
    "semantic_field" in item.metadata
      ? String(item.metadata.semantic_field)
      : null;

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
    >
      {/*
        Scroll container. Takes remaining vertical space via flex-1.
        `min-h-0` is required so flex-1 can shrink past intrinsic size
        and overflow-y-auto actually kicks in.

        We use `items-start` at every breakpoint and delegate vertical
        centering to the card's own `my-auto`. This sidesteps the
        classic flexbox + overflow trap that `items-center` creates:
        when the card's content is taller than the scroll container
        (definition panel with framed sub-cards + examples + relations
        + review-count footer routinely overflows a 4:3 flashcard), a
        center-aligned flex item distributes the overflow *symmetrically*
        above and below the container. `overflow-y-auto` can only scroll
        the range [0, scrollHeight - clientHeight], which means the top
        half of the overflow sits above the viewport and the user
        literally cannot reach the word lemma / IPA / top tags no matter
        how hard they scroll. `my-auto` on the child collapses to 0
        whenever the child overflows, pinning it to the top and making
        the full height scrollable; when the child fits, auto margins
        expand to fill the cross axis, yielding the same visual centering.
      */}
      <div className="flex w-full min-h-0 flex-1 items-start justify-center overflow-y-auto">
      {/* Answer Card */}
      <div 
        className="my-auto w-full max-w-2xl rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-6 shadow-lg backdrop-blur-lg sm:p-10"
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

        {/*
          Definition panel. Wrapped in its own framed card (rounded
          border + subtle surface tint) so that the nested callout
          rows inside ZenDefinitionRenderer (原型义 / 延伸维度 /
          隐喻类型 small chips) read as children of a first-class
          section rather than floating freely on the flashcard.

          `definition_md` takes priority over `short_definition`
          because it's the structured markdown source — it's what
          carries the `> [!tip]` callouts and `` `V N` `` grammar
          markers we want to surface. `short_definition` is the
          one-line summary used only as a fallback when the word
          entry predates structured fields.
        */}
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
            核心释义
          </p>
          <div className="mt-4">
            <ZenDefinitionRenderer
              markdown={item.definition_md?.trim() || item.short_definition || ""}
            />
          </div>
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
            点击右下角 ••• 按钮开启评分菜单
          </span>
        </p>
      </div>
    </motion.div>
  );
}

export function ZenFlashcard() {
  const { item, phase, reveal } = useZenReviewContext();

  if (!item) return null;

  const showBack = phase === "back" || phase === "rating";

  return (
    <div
      className="relative mx-auto aspect-[4/3] w-full max-w-3xl cursor-pointer sm:aspect-[16/10]"
      style={{ perspective: "1200px" }}
      onClick={phase === "front" ? reveal : undefined}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: showBack ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 150, damping: 20 }}
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
          <FlashcardBack item={item} />
        </div>
      </motion.div>
    </div>
  );
}
