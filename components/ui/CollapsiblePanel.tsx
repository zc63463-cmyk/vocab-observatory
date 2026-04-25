"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { springs } from "@/components/motion";

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
  const [open, setOpen] = useState(defaultOpen);

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
