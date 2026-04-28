"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, History } from "lucide-react";
import type { ZenReviewedItem } from "./types";
import { ZenHistoryItem } from "./ZenHistoryItem";

interface ZenHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: ZenReviewedItem[];
  onUndo?: (id: string) => void;
  isUndoing?: boolean;
}

export function ZenHistoryDrawer({ isOpen, onClose, history, onUndo, isUndoing }: ZenHistoryDrawerProps) {
  // Close on Escape (handled by parent shortcuts, but also here for click-outside)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Lock body scroll when drawer is open (only on mobile)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOpen && window.innerWidth < 768) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px] md:hidden"
            onClick={handleBackdropClick}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 300,
              duration: 0.3,
            }}
            className="fixed right-0 top-[calc(var(--header-height,4rem))] z-[100] flex h-[calc(100%-var(--header-height,4rem))] w-full flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md md:w-[400px]"
            role="dialog"
            aria-modal="true"
            aria-label="复习历史"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--color-accent)]" />
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">本次复习记录</h2>
                {history.length > 0 && (
                  <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-ink-soft)]">
                    {history.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                aria-label="关闭历史记录"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="mb-3 h-8 w-8 text-[var(--color-ink-soft)] opacity-30" />
                  <p className="text-sm text-[var(--color-ink-soft)] opacity-60">
                    暂无复习记录
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)] opacity-40">
                    评分成功后会在这里显示
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map((item) => (
                    <ZenHistoryItem
                      key={item.id}
                      item={item}
                      onUndo={onUndo}
                      isUndoing={isUndoing}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="border-t border-[var(--color-border)] px-4 py-2.5">
              <p className="text-[10px] text-[var(--color-ink-soft)] opacity-50">
                按 <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1 py-0.5 font-mono text-[10px]">H</kbd> 关闭抽屉
                {history.some((h) => h.canUndo && !h.undone) && (
                  <span className="ml-2">· 撤销功能开发中</span>
                )}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
