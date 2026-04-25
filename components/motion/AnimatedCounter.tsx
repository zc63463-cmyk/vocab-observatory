"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./MotionWrapper";

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  className?: string;
}

/**
 * Counts from 0 to `target` using requestAnimationFrame,
 * with an ease-out-cubic curve for a premium feel.
 */
export function AnimatedCounter({
  target,
  duration = 1600,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
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

  if (prefersReducedMotion) {
    return <span className={className}>{target.toLocaleString()}</span>;
  }

  return <span className={className}>{display.toLocaleString()}</span>;
}
