"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Settings2, X } from "lucide-react";
import { ReviewPreferencesForm } from "./ReviewPreferencesForm";

interface ReviewPreferencesGearButtonProps {
  /**
   * Visual variant.
   *  - `"page"` matches the chrome of static page-header buttons (subtle
   *    border, panel-soft fill). Used by `/review` section header.
   *  - `"zen"` is a tighter glass disc that sits next to the zen exit
   *    button, deliberately matching its `fixed top-4` style.
   */
  variant?: "page" | "zen";
  /**
   * Optional className appended to the trigger button. Lets host pages
   * align the gear without forking the component.
   */
  triggerClassName?: string;
}

/**
 * Floating-popover entry point for review-experience preferences. Used in
 * two places that want a single-tap settings affordance without leaving
 * the current view:
 *
 *   1. `/review` section header — top-right corner of the queue panel.
 *   2. Zen review session — top-right next to `ZenExitButton`.
 *
 * Why a portal-based popover rather than a Radix `<Popover>`?
 *   - The zen page wraps everything in a `motion.main` whose CSS
 *     `transform` makes it the **containing block** for any in-tree
 *     `position: fixed` descendants. Anchored UIs in that subtree get
 *     their fixed insets resolved against `motion.main`'s box, not the
 *     viewport. Same gotcha that bit `Modal.tsx`, `MobileNav.tsx`, and
 *     the parallel-route modal slots.
 *   - We render to `document.body` with a centered overlay (mobile
 *     friendly) instead of a true anchored popover. Easier on touch
 *     devices, no positioning math, and dismissive UX is identical.
 *
 * Behaviour:
 *   - Click outside (overlay) → close. Esc → close.
 *   - Body scroll locked while open. Restored on close / unmount.
 *   - The form auto-saves to context optimistically; closing the popover
 *     after a successful save is just polish — the context update has
 *     already propagated to the live zen session.
 */
export function ReviewPreferencesGearButton({
  variant = "page",
  triggerClassName,
}: ReviewPreferencesGearButtonProps) {
  const [open, setOpen] = useState(false);
  const portalReady = useSyncExternalStore(
    subscribeToMount,
    getClientMounted,
    getServerMounted,
  );

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="复习偏好设置"
        title="复习偏好设置"
        className={triggerClassNameFor(variant, triggerClassName, open)}
        style={{ touchAction: "manipulation" }}
      >
        <Settings2
          className={variant === "zen" ? "h-5 w-5 sm:h-6 sm:w-6" : "h-4 w-4"}
        />
      </button>
      {portalReady && (
        <ReviewPreferencesPortalOverlay open={open} onClose={handleClose} />
      )}
    </>
  );
}

function triggerClassNameFor(
  variant: "page" | "zen",
  extra: string | undefined,
  open: boolean,
): string {
  const base =
    variant === "zen"
      ? // Match ZenExitButton's chrome so the two top-right buttons read
        // as a pair. Sits LEFT of the exit button via `right-16`.
        "fixed right-16 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-glass)] text-[var(--color-ink-soft)] backdrop-blur-sm transition-colors hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)] sm:right-20 sm:top-6 sm:h-12 sm:w-12"
      : "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]";
  const stateMod = open
    ? " ring-2 ring-[var(--color-accent)]/40 text-[var(--color-ink)]"
    : "";
  return `${base}${stateMod}${extra ? ` ${extra}` : ""}`;
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
}

function ReviewPreferencesPortalOverlay({ open, onClose }: OverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Esc-to-close + body scroll lock are scoped to the open state so the
  // closed popover has zero global side-effects.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const onOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current || e.target === wrapperRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          key="review-prefs-overlay"
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 py-16 backdrop-blur-sm sm:items-center sm:py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-label="复习偏好设置"
        >
          <div ref={wrapperRef} className="absolute inset-0 z-0" />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative z-10 flex w-full max-w-md flex-col rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                  Review Experience
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--color-ink)]">
                  正面模式 · 翻面前自评
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <ReviewPreferencesForm density="popover" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── SSR-safe portal-mount detection ───────────────────────────────────
 * Mirrors the pattern already used by `components/ui/Modal.tsx` and
 * `components/layout/MobileNav.tsx` — guarantees `document.body` exists
 * before we hand it to `createPortal`, without tripping React's
 * hydration-mismatch rules. */
function subscribeToMount() {
  return () => {};
}
function getClientMounted() {
  return true;
}
function getServerMounted() {
  return false;
}
