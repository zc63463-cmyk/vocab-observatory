"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./MotionWrapper";

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  className?: string;
}

/**
 * Shows the target value immediately for SSR / no-JS correctness,
 * then animates only when the target changes dynamically.
 */
export function AnimatedCounter({
  target,
  duration = 1600,
  className,
}: AnimatedCounterProps) {
  // Initialize with target so SSR / no-JS shows the real value.
  const [display, setDisplay] = useState(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const prefersReducedMotion = useReducedMotion();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    // Skip the mount animation to avoid a flash from target → 0 → target
    // and to keep SSR / hydration markup consistent.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    startRef.current = null;

    function step(timestamp: number) {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }

      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [duration, prefersReducedMotion, target]);

  // Pin locale so SSR (whose Node default may be `en-US`) and CSR (browser
  // locale, often `zh-CN`) emit identical thousand-separator strings. The
  // separator is a comma in both today, but ICU updates have shifted these
  // before — making this a latent hydration risk we'd rather close now.
  if (prefersReducedMotion) {
    return <span className={className}>{target.toLocaleString("zh-CN")}</span>;
  }

  return <span className={className}>{display.toLocaleString("zh-CN")}</span>;
}
