"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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
      case "detail":
        ctx.openWordPage();
        return;
    }
  };

  // The FAB is interactive whenever a card is on screen and we're not
  // mid-rating-animation. We deliberately allow it on the front face
  // too: Speak (朗读) and History are useful before the user has
  // committed to seeing the answer; the four rating segments stay
  // visible but grayed out and uncommittable until the card is flipped.
  const isAvailable =
    (ctx.phase === "front" || ctx.phase === "back") && !ctx.isAnimating;

  // Per-action gate. Rating segments only commit on the back face;
  // utility actions are committable any time the FAB is available.
  const canRate = ctx.phase === "back" && !ctx.isAnimating;
  const isActionEnabled = (id: RadialActionId): boolean => {
    if (id === "speak" || id === "history" || id === "detail") return true;
    return canRate;
  };

  // Memoize so the Set identity stays stable across renders that don't
  // change canRate — RadialRing's segment loop checks .has() per render
  // and we'd rather not allocate a new Set every frame.
  const disabledIds = useMemo<ReadonlySet<RadialActionId>>(
    () => (canRate ? new Set() : new Set(["again", "hard", "good", "easy"])),
    [canRate],
  );

  const gesture = useRadialGesture({
    innerRadius: INNER_RADIUS,
    outerRadius: OUTER_RADIUS,
    layout: DEFAULT_LAYOUT,
    onCommit: handleCommit,
    isEnabled: () => isAvailable,
    isActionEnabled,
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
            disabledIds={disabledIds}
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
