"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bento-style card that serves as a folded preview for a heavier
 * detail section. The card itself shows only a title + lightweight
 * preview (counts, badges); the actual `children` React tree is
 * conditionally rendered only when the card is opened, so the heavy
 * sub-components (markdown bodies, vocab topology graph, etc.) never
 * mount into the DOM until the user explicitly requests them.
 *
 * This is the core of the perf win for word-detail pages: the page
 * SSRs ~10 secondary sections, each previously paint-blocking; with
 * `{open ? children : null}` they become a single button worth of DOM
 * each at first paint.
 *
 * Usage:
 *   <BentoCard
 *     title="搭配与语料"
 *     icon={<MessageSquare />}
 *     preview="8 项搭配 / 5 条语料"
 *     gridSpan={2}
 *   >
 *     <WordCollocations ... />
 *     <WordCorpus ... />
 *   </BentoCard>
 */
export function BentoCard({
  badge,
  children,
  className,
  gridSpan = 1,
  icon,
  id,
  preview,
  subtitle,
  title,
  variant = "default",
}: {
  /** Optional badge (e.g. count chip) shown next to the title. */
  badge?: ReactNode;
  /** Heavy detail content, only rendered while the modal is open. */
  children: ReactNode;
  /**
   * Extra class names applied to the card button. Most callers only
   * need this to add a `scroll-mt-*` utility so anchored deep-links
   * (e.g. `/words/foo#word-collocations`) land flush below the
   * sticky chrome instead of underneath it.
   */
  className?: string;
  /** How many columns the card spans on the lg+ grid. 1 / 2 / 3. */
  gridSpan?: 1 | 2 | 3;
  /** Optional icon shown left of the title. */
  icon?: ReactNode;
  /**
   * Anchor id applied to the card button so the existing
   * `WordSectionTOC` chip bar can `scrollIntoView` to it. Each chip
   * lands on the collapsed card; users tap the card itself to expand
   * the modal — preserving the chip-as-navigation contract while
   * keeping the heavier section content out of the initial DOM.
   */
  id?: string;
  /**
   * One-line preview text (e.g. counts, summary). Shown on the
   * collapsed card only — the modal owns its own header.
   */
  preview?: ReactNode;
  /** Optional subtitle shown below the title on the card. */
  subtitle?: string;
  /** Section title; also becomes the modal header. */
  title: string;
  /**
   * `default` is the standard panel look; `accent` adds a subtle
   * tinted border for sections we want to nudge users toward (e.g.
   * vocab topology graph).
   */
  variant?: "default" | "accent";
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? `${titleId}-panel` : undefined}
        className={cn(
          "group relative flex w-full flex-col gap-3 rounded-[1.5rem] border bg-[var(--color-surface)] p-5 text-left transition-all",
          "hover:-translate-y-0.5 hover:border-[var(--color-accent)]/40 hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
          variant === "accent"
            ? "border-[var(--color-accent)]/30 bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-soft)]"
            : "border-[var(--color-border)]",
          gridSpan === 2 && "lg:col-span-2",
          gridSpan === 3 && "lg:col-span-3",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-accent)]">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight text-[var(--color-ink)]">
                {title}
              </h3>
              {subtitle ? (
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {badge}
            <ArrowUpRight
              className="h-4 w-4 text-[var(--color-ink-soft)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-accent)]"
              strokeWidth={2}
            />
          </div>
        </div>

        {preview ? (
          <p className="text-sm leading-6 text-[var(--color-ink-soft)] line-clamp-2">{preview}</p>
        ) : null}
      </button>

      <BentoModal
        id={`${titleId}-panel`}
        labelledBy={`${titleId}-title`}
        onClose={() => setOpen(false)}
        open={open}
        title={title}
        titleId={`${titleId}-title`}
      >
        {/*
          The crucial line: children only mount while the modal is open.
          Closing the modal unmounts the heavy sub-tree, releasing any
          client-side state (e.g. vocab graph simulation, autoplay
          timers) it had spun up.
        */}
        {open ? children : null}
      </BentoModal>
    </>
  );
}

/**
 * Inner modal used exclusively by BentoCard. Distinct from the
 * parallel-route `<Modal>` in this file's sibling — that one is
 * tied to `router.back()` for `(.)/[slug]` route interception, this
 * one is purely controlled by parent React state and stays on the
 * same URL.
 *
 * Both portal to `document.body` for the same reason: framer-motion
 * `<motion.main>` in the layout sets a CSS transform, which promotes
 * any in-tree `position:fixed` descendant's containing block to that
 * transformed element instead of the viewport, breaking full-screen
 * overlays.
 */
function BentoModal({
  children,
  id,
  labelledBy,
  onClose,
  open,
  title,
  titleId,
}: {
  children: ReactNode;
  id: string;
  labelledBy: string;
  onClose: () => void;
  open: boolean;
  title: string;
  titleId: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const portalReady = useSyncExternalStore(
    subscribeToMount,
    getClientMounted,
    getServerMounted,
  );

  const onOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      // Only close when the click lands directly on the overlay layer,
      // not on a descendant — otherwise interactive widgets inside the
      // modal (links, buttons in the graph island) would dismiss it.
      if (event.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Lock body scroll while the modal is open so the underlying page
    // doesn't drift around behind the dialog. We restore the original
    // overflow style instead of clearing it because the parallel-route
    // `<Modal>` may also have set it; nesting wouldn't normally happen
    // (only one BentoCard opens at a time) but this is defensive.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    // Move focus to the dialog so screen readers announce the heading
    // and keyboard users can tab through the modal contents instead
    // of the now-hidden page beneath.
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="overlay"
          ref={overlayRef}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onOverlayClick}
          role="presentation"
        >
          <motion.div
            ref={dialogRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative flex max-h-[min(90dvh,800px)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl focus:outline-none"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
              <h2
                id={labelledBy}
                className="text-xl font-semibold text-[var(--color-ink)]"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={`关闭${title}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] transition hover:border-[var(--color-accent)]/40 hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                <X size={18} strokeWidth={2.25} />
              </button>
            </header>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/* ── SSR-safe mount detection (mirrors Modal.tsx / MobileNav.tsx) ─── */
function subscribeToMount() {
  return () => {};
}
function getClientMounted() {
  return true;
}
function getServerMounted() {
  return false;
}

// Re-export the chevron icon used in the card's hover arrow so callers
// don't need to import lucide-react themselves just to provide a
// matching icon set.
export type { LucideIcon } from "lucide-react";
