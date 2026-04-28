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
import { isInternalHref } from "./omni-utils";

/* ─── Inner component (consumes context) ─── */

function OmniPaletteInner() {
  const { isOpen, query, selectedIndex, close, setQuery, setSelectedIndex } =
    useOmniStore();
  const { sections, flatItems, isLoading } = useOmniSearch(query);
  const router = useRouter();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Register global hotkeys
  useOmniHotkeys();

  // Simple focus trap: prevent Tab from escaping the dialog
  useEffect(() => {
    if (!isOpen) return;

    function handleTabTrap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      const active = document.activeElement;

      // If focus is outside the panel, redirect to first focusable element
      if (!active || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleTabTrap);
    return () => window.removeEventListener("keydown", handleTabTrap);
  }, [isOpen]);

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
    async (index: number) => {
      const item = flatItems[index];
      if (!item) return;
      try {
        if (item.action) {
          await item.action();
        }
        if (item.href && isInternalHref(item.href)) {
          router.push(item.href as Parameters<typeof router.push>[0]);
        }
      } catch {
        // Silently catch action errors to avoid panel crash
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
            ref={panelRef}
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
              activeDescendant={
                selectedIndex >= 0 ? `omni-option-${selectedIndex}` : undefined
              }
            />

            {/* Divider */}
            <div className="h-px bg-[var(--color-border)]" />

            {/* Results */}
            <div
              ref={listRef}
              id="omni-results"
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
