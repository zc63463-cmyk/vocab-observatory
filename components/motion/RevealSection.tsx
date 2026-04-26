"use client";

import { motion, useReducedMotion } from "framer-motion";
import { springs } from "@/components/motion";
import type { ReactNode } from "react";

interface RevealSectionProps {
  children: ReactNode;
  className?: string;
  /** Delay before animation starts in seconds (default 0) */
  delay?: number;
}

/**
 * A client-side section wrapper that fades + slides up
 * when the section enters the viewport (whileInView).
 *
 * GPU-only (transform + opacity). Respects prefers-reduced-motion.
 * Uses `once: true` so the animation only plays on first viewport entry.
 */
export function RevealSection({ children, className, delay = 0 }: RevealSectionProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        type: "spring",
        ...springs.smooth,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}
