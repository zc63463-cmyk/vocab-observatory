"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Dismissible overlay used by the parallel-route modal slots:
 *   - `app/(app)/@modal/(...)words/[slug]/page.tsx` (intercept from anywhere
 *     inside the protected app group, e.g. dashboard / zen review)
 *   - `app/(public)/words/@modal/(.)[slug]/page.tsx` (intercept word→word
 *     navigation from within `/words/[slug]`)
 *
 * Rendered via `createPortal` directly to `document.body`. Reason: both
 * `(app)` and `(public)` layouts wrap their children in `<motion.main>`
 * (`components/motion/PageTransitionMain.tsx`), which applies a CSS
 * `transform` via framer-motion. Per CSS spec, any non-`none` transform
 * promotes the element to a **containing block for all `position: fixed`
 * descendants** — so an in-tree `<div className="fixed inset-x-0 ...">`
 * resolves its insets relative to motion.main's bounds (max-w-7xl, paddings)
 * instead of the viewport. Visible symptom on mobile: the intercepted modal
 * fails to overlay the underlying route — a hard navigation appears to have
 * happened (standalone /words/[slug] page), even though the route IS being
 * intercepted; the modal is simply rendered inside the page flow with
 * collapsed dimensions.
 *
 * Same fix-pattern is used by `components/layout/MobileNav.tsx` for its
 * drawer, which got bitten by `SiteHeader`'s `backdrop-blur-xl` — also a
 * containing-block trigger.
 */
export function Modal({
  activePathPrefix,
  children,
}: {
  activePathPrefix?: string;
  children: React.ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Portal target (`document.body`) only exists on the client.
  const portalReady = useSyncExternalStore(
    subscribeToMount,
    getClientMounted,
    getServerMounted,
  );

  const onDismiss = useCallback(() => {
    router.back();
  }, [router]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current || e.target === wrapperRef.current) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    // Prevent scrolling on body when modal is open
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);

  if (!portalReady) return null;
  if (activePathPrefix && pathname && !pathname.startsWith(activePathPrefix)) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-x-0 bottom-0 top-[5rem] z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8"
      onClick={onClick}
    >
      <div ref={wrapperRef} className="absolute inset-0 z-0" />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative z-10 flex max-h-[calc(100dvh-7rem)] w-full max-w-6xl flex-col rounded-[2.5rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="absolute top-6 right-6 z-50">
          <button
            onClick={onDismiss}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] border border-[var(--color-border)] hover:text-[var(--color-ink)] hover:bg-[var(--color-border)] transition-all shadow-sm"
            aria-label="关闭"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 md:p-10 lg:p-12 h-full">
          {children}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/* ── SSR-safe mount detection ──────────────────────────────────────────
 * Mirrored from `components/layout/MobileNav.tsx`. useSyncExternalStore
 * deliberately replaces a `useState + useEffect` pattern so we don't
 * trip the `react-hooks/set-state-in-effect` lint rule, and we get a
 * known-stable boolean across hydration. */
function subscribeToMount() {
  return () => {};
}
function getClientMounted() {
  return true;
}
function getServerMounted() {
  return false;
}
