"use client";

import { motion, useReducedMotion } from "framer-motion";
import { springs } from "@/components/motion";

interface SplitTextProps {
  /** The text to split and animate character-by-character */
  text: string;
  /** Additional class name for the wrapping span */
  className?: string;
  /** Delay between each character in seconds (default 0.03) */
  staggerDelay?: number;
  /** Initial delay before animation starts in seconds (default 0) */
  initialDelay?: number;
}

/**
 * Splits text into individual characters and animates them in sequentially
 * with a fade + slight y-offset. GPU-only (transform + opacity).
 *
 * Inspired by react-bits SplitText, adapted for our motion preset system
 * and reduced-motion support.
 */
export function SplitText({
  text,
  className,
  staggerDelay = 0.03,
  initialDelay = 0,
}: SplitTextProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className} aria-label={text}>
      {text.split("").map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            ...springs.smooth,
            delay: initialDelay + index * staggerDelay,
          }}
          aria-hidden="true"
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </span>
  );
}
