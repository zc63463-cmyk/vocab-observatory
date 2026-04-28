"use client";

import type { ReactNode } from "react";

interface ZenSessionMetricProps {
  label: string;
  value: ReactNode;
  /** Optional muted hint shown beneath the value (e.g. "of 12") */
  hint?: ReactNode;
  /** Visual emphasis: 'primary' uses accent color, 'default' uses ink */
  tone?: "primary" | "default" | "muted";
}

/**
 * A single metric tile in the Zen Session Summary panel.
 * Visual rule: numeric value uses monospace; label uses serif heading font.
 */
export function ZenSessionMetric({
  label,
  value,
  hint,
  tone = "default",
}: ZenSessionMetricProps) {
  const valueColor =
    tone === "primary"
      ? "var(--color-accent)"
      : tone === "muted"
        ? "var(--color-ink-soft)"
        : "var(--color-ink)";

  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-soft)] opacity-60"
        style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[11px] text-[var(--color-ink-soft)] opacity-50">
          {hint}
        </span>
      )}
    </div>
  );
}
