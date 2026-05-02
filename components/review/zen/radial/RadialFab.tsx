"use client";

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
  const targetScale = isPressing ? 0.92 : 1;

  return (
    // Plain <button> on purpose. We previously used motion.button with
    // animate={{ scale, opacity }} but framer-motion writes its own
    // `transform` inline style for scale, which clobbers Tailwind's
    // `-translate-x-1/2`-based centering (both target `transform`).
    // The result was a FAB that ended up at left:50% with no centering
    // offset — visible on first card by accident of layout, hidden on
    // subsequent cards as soon as the transform was rewritten. Plain CSS
    // transitions on `transform` and `opacity` give us full control and
    // never collide with classnames.
    <button
      type="button"
      aria-label="打开评分菜单"
      aria-expanded={isOpen}
      // React 19 supports `inert` natively as a boolean. inert is the
      // recommended replacement for aria-hidden+tabIndex on focused
      // ancestors (Chrome's "Blocked aria-hidden" warning) and also
      // automatically removes focus from the element when applied.
      inert={!isAvailable}
      onPointerDown={onPointerDown}
      className="
        fixed z-[60] md:hidden
        flex items-center justify-center
        h-14 w-14 rounded-full
        border border-[var(--color-border-strong)]
        bg-[var(--color-panel-strong)]
        shadow-[var(--shadow-panel-strong)]
        text-[var(--color-ink)]
        touch-none select-none
      "
      style={{
        // Centering via `left` (not transform) so the press-scale
        // transform below doesn't cancel out our centering offset.
        // 28px = half of h-14 / w-14 (3.5rem * 16 / 2).
        left: "calc(50% - 28px)",
        bottom: "max(20px, env(safe-area-inset-bottom))",
        transform: `scale(${targetScale})`,
        opacity: targetOpacity,
        transition:
          "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "opacity, transform",
      }}
    >
      {/* Three dots — communicates "more actions" without committing to a
          specific iconography. Using pure SVG circles (not an imported
          icon component) keeps the bundle cost minimal. */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="10" r="1.75" />
        <circle cx="10" cy="10" r="1.75" />
        <circle cx="16" cy="10" r="1.75" />
      </svg>
    </button>
  );
}
