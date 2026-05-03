"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

/**
 * Reusable controlled modal for the dashboard-lab pattern-lock flow.
 *
 * Architecture mirror of `@/components/ui/Modal.tsx` (which is wired to
 * Next.js parallel-route interception via `router.back()`). This variant
 * is **state-driven** instead — `isOpen` + `onClose` props — because the
 * gesture-pattern lock opens modals client-side without changing the URL.
 *
 * Critical patterns retained from the route-based modal:
 *   1. `createPortal` to `document.body` — bypasses every ancestor that
 *      could become a containing block (transform, backdrop-filter, etc.).
 *      See `D:\Notes\app\新建文件夹\NotesDev\Next.js+React-词条详情页内
 *      Modal-平行路由拦截与Containing-Block陷阱.md` for the full backstory.
 *   2. `useSyncExternalStore` for SSR-safe portal-target detection (avoids
 *      `react-hooks/set-state-in-effect` lint rule).
 *   3. Body scroll lock on mount, restore on unmount.
 *   4. Triple dismiss (X / ESC / backdrop click).
 *
 * Visual language matches the existing `Modal.tsx`:
 *   - rounded-[2.5rem] panel, `bg-[var(--color-surface)]`
 *   - `bg-black/40 backdrop-blur-sm` overlay
 *   - spring motion (damping 25, stiffness 300)
 *   - top inset 5rem so the SiteHeader stays visible (desktop)
 *   - on mobile, becomes near-full-screen via the same insets
 */
export interface SectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Eyebrow text rendered in small caps above the title. */
  eyebrow?: string;
  /** Modal title. */
  title?: string;
  /** Optional one-line description under the title. */
  subtitle?: string;
  /** Optional badge / chip rendered to the right of the title. */
  badge?: React.ReactNode;
  /** Body content (typically a `*Body` component). */
  children: React.ReactNode;
}

export function SectionModal({
  isOpen,
  onClose,
  eyebrow,
  title,
  subtitle,
  badge,
  children,
}: SectionModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  /* ── Portal target only exists on the client (SSR-safe) ── */
  const portalReady = useSyncExternalStore(
    subscribeToMount,
    getClientMounted,
    getServerMounted,
  );

  /* ── Backdrop / wrapper click → dismiss ── */
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current || e.target === wrapperRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  /* ── ESC + body scroll lock + focus management (only when open) ───
   * Trap pattern mirrored from `MasteryHeatmap.tsx:114-173` so the two
   * dialog implementations behave identically:
   *   1. Capture the previously-focused element so we can restore on close
   *   2. Move focus into the dialog after a `requestAnimationFrame` (lets
   *      the panel mount + animate-in finish before focusing)
   *   3. Hijack Tab / Shift-Tab to cycle within the dialog only
   *   4. ESC dismisses
   *   5. Body scroll lock
   */
  useEffect(() => {
    if (!isOpen) return;

    const FOCUSABLE =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const getDialog = () => dialogRef.current;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = getDialog();
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // If focus has somehow escaped the dialog (e.g. user clicked
      // outside, then tabbed), pull it back to the first element.
      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* Move focus into the dialog after the open animation has had a
       chance to mount the panel into the DOM. We focus the first
       focusable child (typically the close button) rather than the
       dialog itself, which gives keyboard users an immediate, useful
       target without leaning on `tabindex="-1"`. */
    const af = requestAnimationFrame(() => {
      const dialog = getDialog();
      dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    return () => {
      cancelAnimationFrame(af);
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.body.contains(prev)) {
        prev.focus();
      }
      previousFocusRef.current = null;
    };
  }, [isOpen, onClose]);

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-x-0 bottom-0 top-[5rem] z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-6 md:p-8"
          onClick={onClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <div ref={wrapperRef} className="absolute inset-0 z-0" />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            /* Prefer `aria-labelledby` (points at the visible heading
               inside the dialog) when there's a title, fall back to a
               plain `aria-label` so the dialog always has an accessible
               name even when no header band is rendered. */
            aria-labelledby={title ? "section-modal-title" : undefined}
            aria-label={title ? undefined : "详情"}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative z-10 flex max-h-[calc(100dvh-7rem)] w-full max-w-3xl flex-col rounded-[2rem] sm:rounded-[2.5rem] border border-[var(--color-border)] bg-[var(--color-panel-strong)] backdrop-blur-xl shadow-2xl"
          >
            {/* Close button — pinned, visually layered above content */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] border border-[var(--color-border)] transition-all hover:text-[var(--color-ink)] hover:bg-[var(--color-border)] active:scale-95"
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              aria-label="关闭"
              type="button"
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            {/* Header band — eyebrow + title + subtitle + optional badge */}
            {(eyebrow || title || subtitle) && (
              <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5 sm:px-8 sm:py-6">
                <div className="min-w-0 flex-1 pr-10">
                  {eyebrow && (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                      {eyebrow}
                    </p>
                  )}
                  {title && (
                    <h2
                      id="section-modal-title"
                      className="section-title mt-1.5 text-xl sm:text-2xl font-semibold text-[var(--color-ink)] truncate"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-soft)]">
                      {subtitle}
                    </p>
                  )}
                </div>
                {badge && (
                  <div className="flex-shrink-0 mr-12">{badge}</div>
                )}
              </header>
            )}

            {/* Scrollable body */}
            <div className="overflow-y-auto p-5 sm:p-7 md:p-8">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── SSR-safe mount detection ──────────────────────────────────────────
 * Mirrored from `@/components/layout/MobileNav.tsx` and `@/components/ui/Modal.tsx`.
 * Subscribes to no events; `getServerMounted` returns false → null on SSR;
 * `getClientMounted` returns true once the component runs on the client. */
function subscribeToMount() {
  return () => {};
}
function getClientMounted() {
  return true;
}
function getServerMounted() {
  return false;
}
