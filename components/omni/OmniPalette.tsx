"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { OmniProvider, useOmniStore } from "./useOmniStore";
import { useOmniHotkeys } from "./useOmniHotkeys";
import { useOmniSearch } from "./useOmniSearch";
import { OmniSearchInput } from "./OmniSearchInput";
import { OmniResultItem } from "./OmniResultItem";
import { OmniSection } from "./OmniSection";
import { OmniFooter } from "./OmniFooter";
import { springs } from "@/components/motion";

/* ─── Inner component (consumes context) ─── */

function OmniPaletteInner() {
  const { isOpen, query, selectedIndex, close, setQuery, setSelectedIndex } =
    useOmniStore();
  const { sections, flatItems, isLoading } = useOmniSearch(query);
  const router = useRouter();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Register global hotkeys
  useOmniHotkeys();

  // Auto-focus input on open, restore focus on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus input after animation frame
      requestAnimationFrame(() => {
        const input = listRef.current
          ?.closest("[role='dialog']")
          ?.querySelector("input");
        input?.focus();
      });
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Clamp selectedIndex when results change
  useEffect(() => {
    if (flatItems.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex >= flatItems.length) {
      setSelectedIndex(flatItems.length - 1);
    } else if (selectedIndex < 0) {
      setSelectedIndex(0);
    }
  }, [flatItems.length, selectedIndex, setSelectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const selectedEl = listRef.current.querySelector(
      `[data-omni-index="${selectedIndex}"]`,
    );
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleArrowDown = useCallback(() => {
    if (flatItems.length === 0) return;
    setSelectedIndex(
      selectedIndex >= flatItems.length - 1 ? 0 : selectedIndex + 1,
    );
  }, [flatItems.length, selectedIndex, setSelectedIndex]);

  const handleArrowUp = useCallback(() => {
    if (flatItems.length === 0) return;
    setSelectedIndex(
      selectedIndex <= 0 ? flatItems.length - 1 : selectedIndex - 1,
    );
  }, [flatItems.length, selectedIndex, setSelectedIndex]);

  const executeItem = useCallback(
    (index: number) => {
      const item = flatItems[index];
      if (!item) return;
      if (item.action) {
        item.action();
      }
      if (item.href) {
        router.push(item.href as Parameters<typeof router.push>[0]);
      }
      close();
    },
    [flatItems, router, close],
  );

  const handleEnter = useCallback(() => {
    if (selectedIndex >= 0) {
      executeItem(selectedIndex);
    }
  }, [selectedIndex, executeItem]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) close();
    },
    [close],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="omni-overlay"
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleOverlayClick}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          <motion.div
            key="omni-panel"
            role="dialog"
            aria-modal="true"
            aria-label="全局搜索和命令面板"
            className="
              relative w-[calc(100vw-24px)] max-w-[720px]
              overflow-hidden rounded-2xl
              border border-[var(--color-border-strong)]
              bg-[var(--color-panel-strong)]
              shadow-[var(--shadow-panel-strong)]
            "
            style={{ backdropFilter: "blur(18px)" }}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{
              type: "spring",
              ...springs.smooth,
              opacity: { duration: 0.15 },
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <OmniSearchInput
              query={query}
              onQueryChange={setQuery}
              onArrowDown={handleArrowDown}
              onArrowUp={handleArrowUp}
              onEnter={handleEnter}
            />

            {/* Divider */}
            <div className="h-px bg-[var(--color-border)]" />

            {/* Results */}
            <div
              ref={listRef}
              role="listbox"
              aria-label="搜索结果"
              className="max-h-[60vh] overflow-y-auto px-2 py-1"
            >
              {sections.length === 0 && !isLoading && query.trim() && (
                <div className="flex flex-col items-center justify-center py-10 text-sm text-[var(--color-ink-soft)]">
                  未找到匹配结果
                </div>
              )}

              {isLoading && sections.length === 0 && (
                <div className="flex items-center justify-center py-10 text-sm text-[var(--color-ink-soft)]">
                  搜索中...
                </div>
              )}

              {sections.map((section) => (
                <div key={section.id}>
                  <OmniSection title={section.title} />
                  {section.items.map((item) => {
                    const globalIndex = flatItems.indexOf(item);
                    return (
                      <OmniResultItem
                        key={item.id}
                        item={item}
                        index={globalIndex}
                        selected={globalIndex === selectedIndex}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        onClick={() => executeItem(globalIndex)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Loading indicator below existing results */}
              {isLoading && sections.length > 0 && (
                <div className="flex items-center justify-center py-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                </div>
              )}
            </div>

            {/* Footer */}
            <OmniFooter />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Exported wrapper with provider ─── */

export function OmniPalette() {
  return (
    <OmniProvider>
      <OmniPaletteInner />
    </OmniProvider>
  );
}
