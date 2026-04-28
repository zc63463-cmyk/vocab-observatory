"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ZenReviewProvider, useZenReviewContext } from "./ZenReviewProvider";
import { ZenFlashcard } from "./ZenFlashcard";
import { ZenProgress } from "./ZenProgress";
import { ZenRatingButtons } from "./ZenRatingButtons";
import { ZenExitButton } from "./ZenExitButton";
import { RatingFeedback } from "./RatingFeedback";
import { useAutoHideCursor } from "./useAutoHideCursor";
import { springs } from "@/components/motion";

function ZenModeEffect({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    
    // Add zen mode class to body
    document.body.classList.add("zen-mode");
    
    // Save original overflow
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    return () => {
      document.body.classList.remove("zen-mode");
      document.body.style.overflow = originalOverflow;
    };
  }, [enabled]);
  
  return null;
}

function ZenLoading() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center">
      <motion.div
        className="h-8 w-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      <p className="mt-4 text-sm text-[var(--color-ink-soft)] opacity-60">加载复习队列...</p>
    </div>
  );
}

function ZenEmpty() {
  const { retry, exit } = useZenReviewContext();
  
  return (
    <motion.div
      className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      <h2 
        className="text-3xl font-semibold text-[var(--color-ink)]"
        style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
      >
        今日复习已完成
      </h2>
      <p className="mt-4 max-w-md text-base text-[var(--color-ink-soft)] opacity-70">
        所有到期词条已复习完毕。新词条会在达到复习间隔后自动加入队列。
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={retry}
          className="rounded-full border border-[rgba(15,111,98,0.2)] bg-[var(--color-surface-muted)] px-6 py-3 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
        >
          刷新队列
        </button>
        <button
          type="button"
          onClick={exit}
          className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          返回复习页
        </button>
      </div>
    </motion.div>
  );
}

function ZenError() {
  const { message, retry, exit } = useZenReviewContext();
  
  return (
    <motion.div
      className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth }}
    >
      <p className="text-sm text-[var(--color-accent-2)]">{message || "发生错误"}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={retry}
          className="rounded-full border border-[rgba(15,111,98,0.2)] bg-[var(--color-surface-muted)] px-6 py-3 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
        >
          重试
        </button>
        <button
          type="button"
          onClick={exit}
          className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          返回复习页
        </button>
      </div>
    </motion.div>
  );
}

function ZenContent() {
  const { phase, item } = useZenReviewContext();

  return (
    <AnimatePresence mode="wait">
      {phase === "loading" && (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ZenLoading />
        </motion.div>
      )}
      
      {phase === "error" && (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ZenError />
        </motion.div>
      )}
      
      {(phase === "done") && (
        <motion.div
          key="done"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ZenEmpty />
        </motion.div>
      )}
      
      {(phase === "front" || phase === "back" || phase === "rating") && item && (
        <motion.div
          key={item.progress_id}
          className="flex min-h-[80vh] flex-col items-center justify-between py-8 px-4 sm:py-12"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, x: -100, scale: 0.9 }}
          transition={{ type: "spring", ...springs.smooth }}
        >
          <div className="flex-1 flex w-full max-w-5xl items-center justify-center">
            <ZenFlashcard />
          </div>
          
          <div className="mt-8 w-full max-w-md">
            <ZenProgress />
          </div>
          
          <div className="mt-6">
            <ZenRatingButtons />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ZenReviewInner() {
  const { phase } = useZenReviewContext();
  const isActive = phase === "front" || phase === "back" || phase === "rating";
  
  useAutoHideCursor({ enabled: isActive, delay: 2000 });

  return (
    <div className="zen-review-container relative min-h-screen w-full overflow-hidden bg-[var(--color-canvas)]">
      {/* Subtle ambient background */}
      <div className="zen-ambient-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      
      <ZenModeEffect enabled={true} />
      <RatingFeedback />
      <ZenExitButton />
      
      <main className="relative z-10">
        <ZenContent />
      </main>
    </div>
  );
}

export function ZenReviewPage() {
  return (
    <ZenReviewProvider>
      <ZenReviewInner />
    </ZenReviewProvider>
  );
}
