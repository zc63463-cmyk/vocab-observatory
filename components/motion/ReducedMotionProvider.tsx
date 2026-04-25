"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Reads `prefers-reduced-motion` from the browser and passes it to
 * framer-motion's global `MotionConfig`. When the user has reduced motion
 * enabled, all framer-motion animations are set to `transition: { duration: 0 }`
 * (instant) — no layout thrash, no jank.
 */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
