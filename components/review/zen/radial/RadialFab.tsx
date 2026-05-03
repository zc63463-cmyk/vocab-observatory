"use client";

import { motion, useReducedMotion } from "framer-motion";
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
//
// Visual treatment
// ----------------
// Layered composition to achieve a premium, material feel without
// leaning on heavy imagery:
//  1. Outer halo  — tinted radial-gradient behind the button, blurred;
//     breathes slowly when the card is primed for rating, drawing the
//     thumb without being busy.
//  2. Body        — diagonal panel-tone gradient + layered shadows
//     (drop + inner rim highlight). Pressed state swaps the drop
//     shadow for an inset shadow to read as a physical push.
//  3. Specular    — a small top-left radial highlight overlay, gives
//     the impression of caught light on a satin surface.
//  4. Compass     — center dot + four cardinal tick marks + thin outer
//     hairline ring. Telegraphs "pick a direction" better than the
//     previous three horizontal dots.

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
  /** True when we want the idle halo to breathe (typically: card on
   *  back face, ring closed, not pressing). Breathing is suppressed
   *  automatically under `prefers-reduced-motion`. */
  isPrimed?: boolean;
  /** Pointerdown handler wired from useRadialGesture.beginPress. */
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

// Fixed diameter for the FAB body. We render into a slightly larger
// outer wrapper (DIAMETER + HALO_PAD * 2) so the halo has room to
// extend beyond the button without clipping.
const DIAMETER = 60;
const HALO_PAD = 14;

export function RadialFab({
  isAvailable,
  isPressing,
  isOpen,
  isPrimed,
  onPointerDown,
}: RadialFabProps) {
  // Visible target opacity:
  //  • fully gone when the card is on the front face / animation lock
  //  • dimmed when the ring itself is open (subordinates the button)
  //  • full strength while ready to receive input
  const targetOpacity = !isAvailable ? 0 : isOpen ? 0.35 : 1;
  const targetScale = isPressing ? 0.93 : 1;
  // Honor `prefers-reduced-motion`. The FAB body uses plain CSS
  // transitions rather than framer-motion (see the long comment below
  // about transform collisions), so the global <MotionConfig
  // reducedMotion="user"> in app/layout.tsx doesn't reach it — we
  // gate manually. The halo, which *does* use framer-motion, picks up
  // the global setting automatically, but we still short-circuit the
  // breathing loop to avoid an unnecessary keyframe list.
  const prefersReduced = useReducedMotion();
  const bodyTransition = prefersReduced
    ? "opacity 0ms, transform 0ms, box-shadow 0ms"
    : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1)";

  const shouldBreathe = !!isPrimed && !isOpen && !isPressing && !prefersReduced;

  const pressedShadow =
    "inset 0 2px 4px rgba(35, 26, 18, 0.22), 0 2px 6px rgba(35, 26, 18, 0.08)";
  const restingShadow =
    "0 10px 28px rgba(35, 26, 18, 0.18), 0 2px 6px rgba(35, 26, 18, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 rgba(35, 26, 18, 0.04)";

  return (
    <div
      className="fixed z-[60] md:hidden pointer-events-none"
      style={{
        // Outer wrapper is button + halo-pad on all sides. Centering
        // is done via `left` (not transform) so the body's scale
        // transform below doesn't cancel out centering — same rationale
        // as before the redesign.
        left: `calc(50% - ${DIAMETER / 2 + HALO_PAD}px)`,
        bottom: `max(${24 - HALO_PAD}px, calc(env(safe-area-inset-bottom) + ${28 - HALO_PAD}px))`,
        width: DIAMETER + HALO_PAD * 2,
        height: DIAMETER + HALO_PAD * 2,
        opacity: targetOpacity,
        transition: prefersReduced
          ? "opacity 0ms"
          : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "opacity",
      }}
    >
      {/* Outer halo — accent-tinted glow. Breathes when primed. */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 34%, transparent) 0%, color-mix(in srgb, var(--color-accent) 14%, transparent) 42%, transparent 72%)",
          filter: "blur(2px)",
        }}
        animate={
          shouldBreathe
            ? { opacity: [0.55, 0.9, 0.55], scale: [0.98, 1.04, 0.98] }
            : { opacity: isPressing ? 0.95 : 0.65, scale: isPressing ? 1.05 : 1 }
        }
        transition={
          shouldBreathe
            ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* Button body */}
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
          absolute rounded-full
          border border-[var(--color-border-strong)]
          text-[var(--color-ink)]
          touch-none select-none pointer-events-auto overflow-hidden
        "
        style={{
          // Body sits in the halo padding — centered relative to wrapper.
          left: HALO_PAD,
          top: HALO_PAD,
          width: DIAMETER,
          height: DIAMETER,
          // Diagonal panel-tone gradient gives the surface a subtle
          // "material" instead of a flat disc. Top-left lighter → bottom
          // -right slightly darker reads as light falling from above.
          background:
            "linear-gradient(152deg, color-mix(in srgb, white 28%, var(--color-panel-strong)) 0%, var(--color-panel-strong) 48%, var(--color-panel) 100%)",
          boxShadow: isPressing ? pressedShadow : restingShadow,
          // Plain CSS transform + transition over framer-motion here
          // because framer's scale writes to `transform` and would
          // clobber our centering if we ever re-introduced a translate.
          transform: `scale(${targetScale})`,
          transition: bodyTransition,
          willChange: "transform, box-shadow",
        }}
      >
        {/* Specular top-left highlight. mix-blend-screen makes it
            catch light on both light and dark themes. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 48%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Compass icon — signals "pick a direction" better than three
            horizontal dots. Rendered as inline SVG (no Lucide import)
            to keep the bundle tiny. */}
        <svg
          width="24"
          height="24"
          viewBox="-12 -12 24 24"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="0" cy="0" r="9" strokeWidth="0.9" opacity="0.32" />
          <circle cx="0" cy="0" r="1.9" fill="currentColor" stroke="none" />
          <line x1="0" y1="-7" x2="0" y2="-4.2" />
          <line x1="0" y1="4.2" x2="0" y2="7" />
          <line x1="-7" y1="0" x2="-4.2" y2="0" />
          <line x1="4.2" y1="0" x2="7" y2="0" />
        </svg>
      </button>
    </div>
  );
}
