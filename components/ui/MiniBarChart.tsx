"use client";

import { motion } from "framer-motion";
import { formatDate } from "@/lib/utils";

interface BarItem {
  count: number;
  date: string;
}

interface MiniBarChartProps {
  accentColor?: string;
  className?: string;
  data: BarItem[];
  maxCount: number;
}

export function MiniBarChart({
  data,
  maxCount,
  accentColor = "var(--color-accent)",
  className,
}: MiniBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">No data yet.</p>;
  }

  return (
    <div className={`flex items-end gap-2 ${className ?? ""}`}>
      {data.map((item, index) => {
        const heightPct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const label = formatDate(item.date);
        const shortLabel = label.slice(-5);

        return (
          <div key={item.date} className="group relative flex flex-1 flex-col items-center">
            <div className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--color-ink)] px-2.5 py-1 text-xs text-[var(--color-canvas)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {label}: {item.count}
            </div>

            <div className="relative h-32 w-full overflow-hidden rounded-t-lg bg-[var(--color-surface-muted)]">
              <motion.div
                className="absolute inset-x-0 bottom-0 rounded-t-lg"
                style={{
                  backgroundColor: accentColor,
                  height: `${Math.max(heightPct, 3)}%`,
                  originY: 1,
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  delay: index * 0.06,
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </div>

            <span className="mt-2 text-[10px] leading-tight text-[var(--color-ink-soft)]">
              {shortLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
