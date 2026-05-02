"use client";

import { motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";

// Closed-state entry point for the radial action menu. Lives at the
// bottom-right of the viewport so a one-handed thumb can reach it on
// phones held in either hand (right-handers reach left-to-right, left-
// handers can still curl to the bottom-right). We don't mirror it for
// left-handers because adding a preference would complicate the design
// far more than the ~10% population benefit justifies at this stage.
//
// Desktop hides this button via a media query in ZenRadialMenu; the
// desktop flow continues to rely on keyboard shortcuts + the existing
// ZenRatingButtons row on the done/rating phase.

export interface RadialFabProps {
  /** True while pointer is held down on the button but the ring hasn't
   *  opened yet. Used for the subtle press-down visual. */
  isPressing: boolean;
  /** True when the full ring is currently live. Used to dim the FAB so
   *  it visually subordinates to the ring. */
  isOpen: boolean;
  /** Pointerdown handler wired from useRadialGesture.beginPress. */
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function RadialFab({ isPressing, isOpen, onPointerDown }: RadialFabProps) {
  return (
    <motion.button
      type="button"
      aria-label="打开评分菜单"
      aria-expanded={isOpen}
      onPointerDown={onPointerDown}
      // Keep onClick empty so screen-reader activation still works
      // (VoiceOver / TalkBack synthesise pointer events that include a
      // click, which we shouldn't blindly open the ring for — real
      // pointerdown is the primary driver).
      className="
        fixed z-[60]
        flex items-center justify-center
        h-14 w-14 rounded-full
        border border-[var(--color-border-strong)]
        bg-[var(--color-panel-strong)]
        shadow-[var(--shadow-panel-strong)]
        text-[var(--color-ink)]
        touch-none select-none
      "
      style={{
        right: "max(24px, env(safe-area-inset-right))",
        bottom: "max(24px, env(safe-area-inset-bottom))",
      }}
      animate={{
        scale: isPressing ? 0.92 : 1,
        opacity: isOpen ? 0.35 : 1,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
    >
      {/* Three dots — communicates "more actions" without committing to a
          specific iconography. Using pure SVG circles (not an imported
          icon component) keeps the bundle cost minimal. */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="10" r="1.75" />
        <circle cx="10" cy="10" r="1.75" />
        <circle cx="16" cy="10" r="1.75" />
      </svg>
    </motion.button>
  );
}
