"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useZenReviewContext } from "../ZenReviewProvider";
import {
  DEFAULT_LAYOUT,
  type RadialActionId,
} from "@/lib/review/radial-geometry";
import { useRadialGesture } from "./useRadialGesture";
import { RadialFab } from "./RadialFab";
import { RadialRing } from "./RadialRing";

// Composition layer for the radial action menu.
//
// Key architectural decisions:
//
// 1. ALWAYS mounted while the review session is alive. The previous
//    revision returned null when the card was on the front face, which
//    unmounted the gesture hook — and intermittently failed to remount
//    the FAB on the next back-face flip due to a race between matchMedia
//    initial-state propagation and React 19 effect ordering. Keeping
//    the component mounted and toggling FAB visibility via opacity +
//    pointer-events on a *prop* avoids that race entirely. The cost is
//    a few extra useEffect re-runs per card; negligible.
//
// 2. Renders via a portal to document.body. The ring MUST NOT live
//    inside the ZenFlashcard's 3D rotateY(180deg) parent, otherwise
//    SVG coordinates get mirrored and hit-tests break. body-level
//    rendering also keeps it above the history drawer predictably.
//
// 3. Desktop hiding is now CSS-driven (Tailwind `md:hidden` inside
//    RadialFab + RadialRing's backdrop). No JS media-query state, no
//    initial-render flash.

const INNER_RADIUS = 50;
const OUTER_RADIUS = 120;

export function ZenRadialMenu() {
  const ctx = useZenReviewContext();
  // Mounted-on-client gate. createPortal would otherwise be called with
  // undefined `document` during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleCommit = (actionId: RadialActionId) => {
    switch (actionId) {
      case "again":
      case "hard":
      case "good":
      case "easy":
        ctx.rate(actionId);
        return;
      case "history":
        ctx.toggleHistory();
        return;
      case "speak":
        ctx.speakWord();
        return;
    }
  };

  // The FAB is interactive only while the card has been flipped to its
  // back face and no rating animation is in flight. Note: we no longer
  // unmount when this is false — see decision (1) above.
  const isAvailable = ctx.phase === "back" && !ctx.isAnimating;

  const gesture = useRadialGesture({
    innerRadius: INNER_RADIUS,
    outerRadius: OUTER_RADIUS,
    layout: DEFAULT_LAYOUT,
    onCommit: handleCommit,
    isEnabled: () => isAvailable,
  });

  if (!mounted) return null;

  const isOpen =
    gesture.state.phase === "active" ||
    gesture.state.phase === "committing" ||
    gesture.state.phase === "cancelling";

  return createPortal(
    <>
      <RadialFab
        isAvailable={isAvailable}
        isPressing={gesture.state.phase === "pressing"}
        isOpen={isOpen}
        onPointerDown={gesture.beginPress}
      />
      <AnimatePresence>
        {isOpen && gesture.state.origin && (
          <RadialRing
            key="ring"
            center={gesture.state.origin}
            innerRadius={INNER_RADIUS}
            outerRadius={OUTER_RADIUS}
            layout={DEFAULT_LAYOUT}
            hoveredId={gesture.state.hovered?.id ?? null}
            committedId={gesture.state.committed?.id ?? null}
            phase={
              gesture.state.phase === "committing"
                ? "committing"
                : gesture.state.phase === "cancelling"
                  ? "cancelling"
                  : "active"
            }
          />
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
