"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

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

        <span
          className={cn(
            "mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] transition",
            open && "rotate-180",
          )}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      <div
        className={cn(
          "grid overflow-hidden transition-all duration-300 ease-out",
          open ? "mt-5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
