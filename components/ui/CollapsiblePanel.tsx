"use client";

import { ChevronDown } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { springs } from "@/components/motion";

/**
 * When non-null, instructs descendant <CollapsiblePanel> instances to
 * skip their fold-and-toggle chrome and render children unconditionally.
 *
 * - `"flat"`:  Keep the outer panel + h2 heading, drop the chevron
 *              button and AnimatePresence. Used by the word-detail
 *              page's always-visible main strip (Morphology +
 *              Mnemonic) where forcing a second click defeats the
 *              point of promoting them out of the Bento grid.
 *
 * - `"naked"`: Drop everything — no panel wrapper, no heading, no
 *              subtitle. Returns the children directly. Used inside
 *              BentoCard's modal because the modal already provides
 *              panel chrome + heading; an inner CollapsiblePanel
 *              would force the user to click twice (card → chevron)
 *              just to see content.
 *
 * `null` (default outside any provider) preserves the legacy
 * collapsible behaviour for any consumer that hasn't opted in.
 */
type CollapsibleBypassMode = "flat" | "naked";
const CollapsibleBypassContext = createContext<CollapsibleBypassMode | null>(null);

/**
 * Provider that forces every descendant <CollapsiblePanel> into a
 * non-collapsible render mode. Lives in this file (rather than a
 * separate `BypassProvider.tsx`) so consumers only need a single
 * import and the context type stays private.
 *
 * RSC pattern: this is `"use client"` (the whole file is) but it
 * accepts server children — context propagates through the React
 * element tree, and intermediate server components just forward
 * `children` without reading the context themselves. So the
 * word-detail page (server) can wrap a server-rendered
 * <WordMorphology> in <CollapsibleBypass mode="flat">, and the
 * leaf <CollapsiblePanel> (client) will read the bypass mode
 * correctly.
 */
export function CollapsibleBypass({
  children,
  mode,
}: {
  children: ReactNode;
  mode: CollapsibleBypassMode;
}) {
  return (
    <CollapsibleBypassContext.Provider value={mode}>
      {children}
    </CollapsibleBypassContext.Provider>
  );
}

export function CollapsiblePanel({
  badge,
  children,
  defaultOpen = false,
  subtitle,
  summary,
  title,
}: {
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  subtitle?: string;
  summary?: string;
  title: string;
}) {
  const bypassMode = useContext(CollapsibleBypassContext);
  const [open, setOpen] = useState(defaultOpen);

  // Inside a BentoCard modal: parent already owns the panel + header,
  // so any chrome we add here is double-fold redundancy. Just render
  // the children directly.
  if (bypassMode === "naked") {
    return <>{children}</>;
  }

  // Always-visible main strip: keep the panel look so the section
  // still reads as a first-class block, but drop the chevron toggle
  // because the user is supposed to see this content immediately.
  if (bypassMode === "flat") {
    return (
      <section className="panel rounded-[1.75rem] p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title text-2xl font-semibold">{title}</h2>
          {badge}
        </div>
        {subtitle ? (
          <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{subtitle}</p>
        ) : null}
        <div className="mt-5">{children}</div>
      </section>
    );
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="section-title text-2xl font-semibold">{title}</h2>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{subtitle}</p>
          ) : null}
          {summary ? (
            <p className="mt-3 text-sm font-medium text-[var(--color-ink-soft)]">{summary}</p>
          ) : null}
        </div>

        <motion.span
          className={cn(
            "mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)]",
          )}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", ...springs.snappy }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              marginTop: 20,
              transition: { type: "spring", ...springs.smooth },
            }}
            exit={{
              height: 0,
              opacity: 0,
              marginTop: 0,
              transition: { duration: 0.2, ease: [0.7, 0, 0.84, 0] },
            }}
            className="overflow-hidden"
          >
            <div>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
