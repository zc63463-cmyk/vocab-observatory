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
// 1. The whole thing renders via a portal to document.body. The ring
//    MUST NOT live inside the ZenFlashcard's 3D rotateY(180deg) parent,
//    otherwise the SVG coordinate system gets mirrored and all hit-test
//    angles become wrong. Putting it at the body level also keeps it
//    above the history drawer's own z-layer predictably.
//
// 2. The FAB is only rendered when the card is in the `back` phase and
//    the flip animation isn't in progress. Front-phase cards haven't
//    been read yet, so it makes no sense to offer rating. We DO want
//    utility actions (Speak, History) accessible earlier, but those
//    are available via keyboard on desktop and via History drawer on
//    mobile; gating on `back` keeps the UX rule simple.
//
// 3. Desktop is detected via `(hover: none) and (pointer: coarse)` —
//    the classic "touch device" media query. Desktop users stay on
//    keyboard shortcuts + the existing rating buttons row.

const INNER_RADIUS = 50;
const OUTER_RADIUS = 120;

// We stop rendering the FAB unless this media query matches. Using state
// rather than CSS `@media` + display:none because the gesture hook
// allocates window listeners, which we'd like to avoid even provisioning
// on desktop where the FAB will never be tapped anyway.
function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    setIsTouch(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    // Safari < 14 used addListener; guard for compatibility.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      mq.addListener(listener);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return () => mq.removeListener(listener);
    }
  }, []);
  return isTouch;
}

export function ZenRadialMenu() {
  const ctx = useZenReviewContext();
  const isTouch = useIsTouchDevice();

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

  const isAvailable = ctx.phase === "back" && !ctx.isAnimating;

  const gesture = useRadialGesture({
    innerRadius: INNER_RADIUS,
    outerRadius: OUTER_RADIUS,
    layout: DEFAULT_LAYOUT,
    onCommit: handleCommit,
    isEnabled: () => isAvailable,
  });

  // If the card transitions out of `back` while the ring is still open
  // (e.g., user drags long enough for the rate() committed during commit
  // to advance the phase to `rating`), forcibly reset so we don't leak
  // a stale ring onto the next card.
  useEffect(() => {
    if (!isAvailable && gesture.state.phase !== "closed") {
      gesture.forceClose();
    }
  }, [isAvailable, gesture]);

  if (!isTouch) return null;
  if (!isAvailable && gesture.state.phase === "closed") return null;

  // Everything below lives in a body-level portal to escape the 3D
  // transform container. SSR-safe: createPortal returns null when
  // document is undefined; we guard via typeof check.
  if (typeof document === "undefined") return null;

  const isOpen =
    gesture.state.phase === "active" ||
    gesture.state.phase === "committing" ||
    gesture.state.phase === "cancelling";

  return createPortal(
    <>
      <RadialFab
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
