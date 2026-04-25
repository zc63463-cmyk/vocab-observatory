/**
 * Shared animation presets for framer-motion.
 * Centralised here so all components use consistent timing, easing & springs.
 *
 * Every preset is intentionally designed for GPU-only properties
 * (transform, opacity, filter) to maintain 60fps.
 */

/* ─── Springs ─── */

export const springs = {
  /** Snappy UI transitions (buttons, toggles) */
  snappy: { damping: 30, stiffness: 300 },
  /** Smooth content reveals (cards, panels) */
  smooth: { damping: 20, stiffness: 150 },
  /** Bouncy micro-feedback (tap, success) */
  bouncy: { damping: 10, stiffness: 100 },
  /** Heavy/luxurious transitions (page, hero) */
  heavy: { damping: 20, stiffness: 60 },
} as const;

/* ─── Durations (seconds) ─── */

export const durations = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  page: 0.5,
} as const;

/* ─── Easings (cubic-bezier) ─── */

export const easings = {
  /** Smooth deceleration — most common for enter */
  smoothOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Smooth acceleration — common for exit */
  smoothIn: [0.7, 0, 0.84, 0] as [number, number, number, number],
  /** Elastic overshoot — sparingly */
  elastic: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

/* ─── Variant presets ─── */

/** Fade + slide up on enter; fade + slide down on exit */
export const fadeSlideUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
} as const;

/** Fade + slide from right (toast-style) */
export const fadeSlideRight = {
  hidden: { opacity: 0, x: 80, scale: 0.95 },
  visible: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 80, scale: 0.95 },
} as const;

/** Simple fade */
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

/** Scale pop (for button feedback) */
export const popIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
} as const;
