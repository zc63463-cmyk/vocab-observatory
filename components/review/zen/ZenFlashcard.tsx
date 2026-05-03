"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Volume2 } from "lucide-react";
import { Fragment, useState } from "react";
import { springs } from "@/components/motion";
import { useZenReviewContext } from "./ZenReviewProvider";
import type { ReviewQueueItem } from "@/lib/review/types";
import { speakLemma, canSpeak } from "@/lib/tts";
import { WordRelationLinks } from "./WordRelationLinks";
import { PredictionSlider } from "./PredictionSlider";
import { CLOZE_BLANK_TOKEN, type ResolvedPrompt } from "@/lib/review/prompt-mode";

interface FlashcardFrontProps {
  item: ReviewQueueItem;
  onReveal: () => void;
  resolvedPrompt: ResolvedPrompt;
  predictionEnabled: boolean;
  predictionCommitted: boolean;
}

function FlashcardFront({
  item,
  onReveal,
  resolvedPrompt,
  predictionEnabled,
  predictionCommitted,
}: FlashcardFrontProps) {
  const flipDisabled = predictionEnabled && !predictionCommitted;

  return (
    <motion.div
      key="front"
      className={`absolute inset-0 flex flex-col items-center justify-center backface-hidden ${
        flipDisabled ? "cursor-default" : "cursor-pointer"
      }`}
      style={{ backfaceVisibility: "hidden" }}
      onClick={flipDisabled ? undefined : onReveal}
      initial={{ rotateY: 0 }}
      animate={{ rotateY: 0 }}
      exit={{ rotateY: 180 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      {/* Front-face content varies by mode — see resolvePrompt() for the
          mode-selection algorithm. Prediction slider sits below the prompt
          content, never replacing it. */}
      <div className="flex w-full flex-1 items-center justify-center px-6 sm:px-10">
        <FrontPromptBody item={item} resolvedPrompt={resolvedPrompt} />
      </div>

      {predictionEnabled && (
        <div className="w-full px-6 pb-6 sm:px-10">
          <PredictionSlider />
        </div>
      )}

      {/* Hint */}
      <div className="absolute bottom-3 left-0 right-0 text-center">
        <p className="text-sm text-[var(--color-ink-soft)] opacity-60">
          {flipDisabled ? (
            <>先设定你的把握度再翻面</>
          ) : (
            <>
              按 <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">Space</kbd> 或点击显示答案
              <span className="mx-2">·</span>
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs">P</kbd> 朗读
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}

interface FrontPromptBodyProps {
  item: ReviewQueueItem;
  resolvedPrompt: ResolvedPrompt;
}

/**
 * Renders the actual prompt content that the user must respond to before
 * flipping. Three modes:
 *   - forward: the lemma + IPA, with click-to-speak. The classic flashcard
 *     front; what the user sees on every card today.
 *   - reverse: the gloss / definition only. Lemma and IPA hidden because
 *     they're the answer; we want the user to retrieve the word from the
 *     meaning. Click-to-speak is suppressed for the same reason.
 *   - cloze: a sample sentence with the lemma redacted to CLOZE_BLANK_TOKEN.
 *     Length hint shown faintly so the user has a coarse anchor without
 *     it doubling as a spell-checker.
 */
function FrontPromptBody({ item, resolvedPrompt }: FrontPromptBodyProps) {
  if (resolvedPrompt.mode === "reverse") {
    const definition = item.short_definition || item.definition_md || "暂无释义";
    return (
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          从释义回想
        </p>
        <p
          className="max-w-xl text-2xl leading-relaxed text-[var(--color-ink)] sm:text-3xl md:text-4xl"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          {definition}
        </p>
      </div>
    );
  }

  if (resolvedPrompt.mode === "cloze" && resolvedPrompt.clozeText) {
    return (
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          填空
        </p>
        <p
          className="max-w-2xl text-2xl leading-relaxed text-[var(--color-ink)] sm:text-3xl md:text-4xl"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          <ClozeRender text={resolvedPrompt.clozeText} />
        </p>
        {resolvedPrompt.clozeLength !== null && (
          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--color-ink-soft)] opacity-60">
            {resolvedPrompt.clozeLength} 个字符
          </p>
        )}
      </div>
    );
  }

  // Forward (default + fallback)
  return (
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
  );
}

/**
 * Splits the cloze sentence on CLOZE_BLANK_TOKEN and renders each blank as
 * a styled span. Visually distinguishes the gap from the surrounding text
 * via a contrasting background pill so the user can't miss what to fill in.
 */
function ClozeRender({ text }: { text: string }) {
  const parts = text.split(CLOZE_BLANK_TOKEN);
  return (
    <>
      {parts.map((part, idx) => (
        <Fragment key={idx}>
          {part}
          {idx < parts.length - 1 && (
            <span
              aria-label="需要填空的单词"
              className="mx-1 inline-flex items-center justify-center rounded-md border border-dashed border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 px-3 py-0.5 align-baseline text-[var(--color-accent)]"
            >
              ? ? ?
            </span>
          )}
        </Fragment>
      ))}
    </>
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
        On mobile (`items-start`) the answer card anchors to the top of the
        scroll region so the word lemma + IPA are always visible — without
        this anchor, `align-items: center` would push the top of the card
        above the visible scroll area whenever content (definition + examples
        + relations) overflows the cramped 4:3 mobile card. From `sm:` up the
        viewport is wide enough that content fits and we can afford the
        nicer-looking vertical centering. `min-h-0` is required so flex-1 can
        shrink past intrinsic size and overflow-y-auto actually kicks in.
      */}
      <div className="flex w-full min-h-0 flex-1 items-start justify-center overflow-y-auto sm:items-center">
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
  const { item, phase, reveal, resolvedPrompt, preferences, prediction } =
    useZenReviewContext();

  if (!item) return null;

  const showBack = phase === "back" || phase === "rating";
  const predictionCommitted = prediction !== null;
  // When prediction is enabled and not yet committed, the wrapping click
  // area must NOT trigger reveal: otherwise tapping the card body would
  // race the slider's stop-propagation guard. Component-level gate keeps
  // the slider as the only viable interaction until a value is committed.
  const wrapperClickEnabled =
    phase === "front" && (!preferences.predictionEnabled || predictionCommitted);

  return (
    <div 
      className={`relative mx-auto aspect-[4/3] w-full max-w-3xl sm:aspect-[16/10] ${
        wrapperClickEnabled ? "cursor-pointer" : "cursor-default"
      }`}
      style={{ perspective: "1200px" }}
      onClick={wrapperClickEnabled ? reveal : undefined}
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
          <FlashcardFront
            item={item}
            onReveal={reveal}
            resolvedPrompt={resolvedPrompt}
            predictionEnabled={preferences.predictionEnabled}
            predictionCommitted={predictionCommitted}
          />
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
