"use client";

import { motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";

// Closed-state entry point for the radial action menu. Anchored at the
// bottom-center of the viewport so it's equally reachable for left- and
// right-handed thumbs. The ring expands upward from this anchor when
// pressed, keeping all six segments inside comfortable reach.
//
// Always mounted on touch devices once the review session is alive —
// availability flips visibility (opacity / pointer-events) rather than
// mounting state, eliminating an unmount-remount race that previously
// caused the FAB to vanish on subsequent cards.
//
// Desktop hidden via Tailwind `md:hidden` (no JS media query). Desktop
// users continue to rely on the keyboard shortcut row.

export interface RadialFabProps {
  /** True when the current card phase + animation state allow rating.
   *  When false the FAB stays in the DOM but becomes inert (faded out,
   *  pointer-events disabled). */
  isAvailable: boolean;
  /** True while pointer is held down on the button but the ring hasn't
   *  opened yet. Used for the subtle press-down visual. */
  isPressing: boolean;
  /** True when the full ring is currently live. Used to dim the FAB so
   *  it visually subordinates to the ring. */
  isOpen: boolean;
  /** Pointerdown handler wired from useRadialGesture.beginPress. */
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function RadialFab({ isAvailable, isPressing, isOpen, onPointerDown }: RadialFabProps) {
  // Visible target opacity:
  //  • fully gone when the card is on the front face / animation lock
  //  • dimmed when the ring itself is open (subordinates the button)
  //  • full strength while ready to receive input
  const targetOpacity = !isAvailable ? 0 : isOpen ? 0.35 : 1;

  return (
    <motion.button
      type="button"
      aria-label="打开评分菜单"
      aria-expanded={isOpen}
      aria-hidden={!isAvailable}
      tabIndex={isAvailable ? 0 : -1}
      onPointerDown={onPointerDown}
      // Keep onClick empty so screen-reader activation still works
      // (VoiceOver / TalkBack synthesise pointer events that include a
      // click, which we shouldn't blindly open the ring for — real
      // pointerdown is the primary driver).
      className="
        fixed z-[60] md:hidden
        left-1/2 -translate-x-1/2
        flex items-center justify-center
        h-14 w-14 rounded-full
        border border-[var(--color-border-strong)]
        bg-[var(--color-panel-strong)]
        shadow-[var(--shadow-panel-strong)]
        text-[var(--color-ink)]
        touch-none select-none
      "
      style={{
        bottom: "max(20px, env(safe-area-inset-bottom))",
        pointerEvents: isAvailable ? "auto" : "none",
      }}
      animate={{
        scale: isPressing ? 0.92 : 1,
        opacity: targetOpacity,
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
