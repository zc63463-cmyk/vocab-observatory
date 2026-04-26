"use client";

import { motion } from "framer-motion";

interface RatingSegment {
  color: string;
  label: string;
  value: number;
}

interface StackedRatingBarProps {
  className?: string;
  segments: RatingSegment[];
}

export function StackedRatingBar({ segments, className }: StackedRatingBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return (
      <p className={`text-sm text-[var(--color-ink-soft)] ${className ?? ""}`}>
        No ratings yet.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map((segment, index) => {
          const pct = (segment.value / total) * 100;
          if (pct === 0) {
            return null;
          }

          return (
            <motion.div
              key={segment.label}
              className="first:rounded-l-full last:rounded-r-full"
              style={{ backgroundColor: segment.color }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                delay: index * 0.1,
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
              }}
              title={`${segment.label}: ${segment.value} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => {
          const pct = total > 0 ? ((segment.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={segment.label} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-[var(--color-ink-soft)]">{segment.label}</span>
              <span className="font-semibold text-[var(--color-ink)]">{segment.value}</span>
              <span className="text-xs text-[var(--color-ink-soft)]">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
