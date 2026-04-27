"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { easings, springs } from "@/components/motion";
import {
  BACK_TO_TOP_SCROLL_OPTIONS,
  shouldShowBackToTop,
} from "@/lib/back-to-top";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frameId = 0;

    const updateVisibility = () => {
      const nextVisible = shouldShowBackToTop(window.scrollY);
      setVisible((currentVisible) =>
        currentVisible === nextVisible ? currentVisible : nextVisible,
      );
    };

    const handleScroll = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateVisibility();
      });
    };

    updateVisibility();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  function scrollToTop() {
    window.scrollTo(BACK_TO_TOP_SCROLL_OPTIONS);
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-4 z-40 sm:bottom-6 sm:right-6">
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.button
            key="back-to-top"
            type="button"
            onClick={scrollToTop}
            className="panel-strong pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)] shadow-xl shadow-black/[0.08] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", ...springs.smooth, ease: easings.smoothOut }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.94 }}
            aria-label="\u8fd4\u56de\u9876\u90e8"
            title="\u8fd4\u56de\u9876\u90e8"
          >
            <ArrowUp className="h-4 w-4" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
