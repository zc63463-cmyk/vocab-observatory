"use client";

import { AnimatedCounter } from "@/components/motion/AnimatedCounter";

interface AnimatedMetricCardProps {
  label: string;
  tone?: "cool" | "warm";
  value: number | string;
}

/**
 * A MetricCard with animated number counting for numeric values.
 * Wraps the same visual structure as MetricCard but uses AnimatedCounter
 * for the value display when the value is a number.
 * Respects prefers-reduced-motion (AnimatedCounter handles it internally).
 */
export function AnimatedMetricCard({ label, tone = "cool", value }: AnimatedMetricCardProps) {
  return (
    <div
      className={`panel rounded-[1.5rem] p-5 ${
        tone === "cool"
          ? "border-[rgba(15,111,98,0.18)]"
          : "border-[rgba(178,87,47,0.18)]"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-3 section-title text-4xl font-semibold">
        {typeof value === "number" ? (
          <AnimatedCounter target={value} />
        ) : (
          value
        )}
      </p>
    </div>
  );
}
