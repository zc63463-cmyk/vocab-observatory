"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  DEFAULT_LAYOUT,
  angle,
  hitTest,
  radius,
  type RadialActionId,
  type RadialSegment,
} from "@/lib/review/radial-geometry";
import { haptic } from "@/lib/haptics";

// State machine for the radial action menu (see the Mermaid diagram in
// docs/PlanDev/zen-review-radial-menu-plan.md §3.2).
//
// We deliberately keep a single `phase` field rather than e.g. a tagged
// union of state objects — React re-renders are cheaper than reasoning
// about sub-states, and the reducer branches fit on one screen.

export type RadialPhase =
  | "closed"      // FAB visible, nothing else
  | "pressing"    // pointerdown within debounce window
  | "active"      // ring open, following pointer
  | "committing"  // segment chosen, animating out
  | "cancelling"; // aborted, animating out

interface RadialState {
  phase: RadialPhase;
  /** Screen-space origin of the pointerdown; defines the ring's center. */
  origin: { x: number; y: number } | null;
  /** Last-known pointer delta from origin, for the ring to render a radial line. */
  pointer: { dx: number; dy: number } | null;
  /** The segment the user is currently pointing at, or null (dead zone / gap). */
  hovered: RadialSegment | null;
  /** The segment that was committed on pointerup; needed so RadialRing
   *  can play its commit-ripple during `committing`. */
  committed: RadialSegment | null;
}

const initial: RadialState = {
  phase: "closed",
  origin: null,
  pointer: null,
  hovered: null,
  committed: null,
};

type Action =
  | { type: "PRESS"; origin: { x: number; y: number } }
  | { type: "ACTIVATE" }
  | { type: "MOVE"; pointer: { dx: number; dy: number }; hovered: RadialSegment | null }
  | { type: "COMMIT" }
  | { type: "CANCEL" }
  | { type: "RESET" };

function reducer(state: RadialState, action: Action): RadialState {
  switch (action.type) {
    case "PRESS":
      return { ...initial, phase: "pressing", origin: action.origin };
    case "ACTIVATE":
      if (state.phase !== "pressing") return state;
      return { ...state, phase: "active" };
    case "MOVE":
      if (state.phase !== "active" && state.phase !== "pressing") return state;
      return { ...state, pointer: action.pointer, hovered: action.hovered };
    case "COMMIT":
      if (state.phase !== "active" || !state.hovered) return state;
      return { ...state, phase: "committing", committed: state.hovered };
    case "CANCEL":
      // Can cancel from pressing (too-quick release) or active (dead zone).
      return { ...state, phase: "cancelling", hovered: null };
    case "RESET":
      return initial;
    default:
      return state;
  }
}

// Timings (ms) — kept as constants so tests, if we ever add jsdom-based
// ones, don't have to reach into the module scope to override.
const PRESS_ACTIVATE_DELAY_MS = 50;
/** committing + cancelling exit animations share this duration */
const EXIT_ANIMATION_MS = 180;
/** Pointer-drift threshold (px) below which a pointermove no longer
 *  triggers a React state update. Coarse enough to halve re-renders
 *  during a fast drag, fine enough that the drag-trail line in
 *  RadialRing tracks the finger to within ±half a fingertip. */
const MOVE_DISPATCH_PX = 4;

export interface UseRadialGestureOptions {
  innerRadius: number;
  outerRadius: number;
  layout?: readonly RadialSegment[];
  onCommit: (actionId: RadialActionId) => void;
  /** Callable to suppress opening (e.g., while a card is mid-flip). */
  isEnabled?: () => boolean;
  /** Per-action enable gate. Returning false means the user can drag to
   *  this segment but releasing on it will be treated as a cancel rather
   *  than a commit — used to keep the FAB visible on the front face
   *  while rating segments stay non-committable. Defaults to always true. */
  isActionEnabled?: (id: RadialActionId) => boolean;
}

export interface RadialGestureApi {
  state: RadialState;
  /** Wire to the FAB's onPointerDown. */
  beginPress: (e: React.PointerEvent<HTMLElement>) => void;
  /** Force-close; called from ZenRadialMenu when phase/isAnimating flips away. */
  forceClose: () => void;
}

export function useRadialGesture({
  innerRadius,
  outerRadius,
  layout = DEFAULT_LAYOUT,
  onCommit,
  isEnabled,
  isActionEnabled,
}: UseRadialGestureOptions): RadialGestureApi {
  const [state, dispatch] = useReducer(reducer, initial);

  // Keep the latest callback in a ref so we don't need it in the effect
  // deps (which would tear down and re-install window listeners every
  // time the caller re-renders with a new closure).
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;
  const isActionEnabledRef = useRef(isActionEnabled);
  isActionEnabledRef.current = isActionEnabled;

  // PRESS → ACTIVATE transition (debounced). This has to live in an
  // effect so we can cancel it via clean-up if the user releases before
  // the activation fires.
  useEffect(() => {
    if (state.phase !== "pressing") return;
    const id = window.setTimeout(() => {
      dispatch({ type: "ACTIVATE" });
      haptic("engage");
    }, PRESS_ACTIVATE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [state.phase]);

  // Global pointer tracking. We attach listeners only while the gesture
  // is live to avoid paying the cost during normal review.
  useEffect(() => {
    if (state.phase !== "pressing" && state.phase !== "active") return;
    if (!state.origin) return;

    // Throttle MOVE dispatches: pointermove fires up to 120 Hz on modern
    // devices, but we only need a fresh React state when either (a) the
    // hovered segment id changes, or (b) the pointer drifts far enough
    // (≥ MOVE_DISPATCH_PX) that the drag-trail rendering would visibly
    // lag behind the finger. Skipping low-delta dispatches halves the
    // re-render cost on mid-tier Android during a drag.
    let lastHoveredId: RadialActionId | null = state.hovered?.id ?? null;
    let lastDispatchedDx = state.pointer?.dx ?? 0;
    let lastDispatchedDy = state.pointer?.dy ?? 0;

    const onMove = (e: PointerEvent) => {
      if (!state.origin) return;
      const dx = e.clientX - state.origin.x;
      const dy = e.clientY - state.origin.y;
      const seg = hitTest(dx, dy, {
        innerRadius,
        outerRadius,
        layout,
      });
      const nextId = seg?.id ?? null;
      const hoverChanged = nextId !== lastHoveredId;
      const driftPx = Math.hypot(dx - lastDispatchedDx, dy - lastDispatchedDy);

      if (hoverChanged || driftPx >= MOVE_DISPATCH_PX) {
        dispatch({ type: "MOVE", pointer: { dx, dy }, hovered: seg });
        lastDispatchedDx = dx;
        lastDispatchedDy = dy;
        if (hoverChanged) {
          if (seg) haptic("select");
          lastHoveredId = nextId;
        }
      }
      // Prevent page-level scroll while dragging inside the ring.
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!state.origin) return;
      const dx = e.clientX - state.origin.x;
      const dy = e.clientY - state.origin.y;
      const finalHit = hitTest(dx, dy, {
        innerRadius,
        outerRadius,
        layout,
      });
      // Action-level gate: a segment can be inside the ring geometry but
      // disabled in the current context (e.g., rating segments while
      // the card is on its front face). Treat those as cancel.
      const enabled =
        finalHit &&
        (!isActionEnabledRef.current ||
          isActionEnabledRef.current(finalHit.id));
      if (state.phase === "active" && finalHit && enabled) {
        dispatch({ type: "COMMIT" });
        haptic("commit");
        onCommitRef.current(finalHit.id);
      } else {
        dispatch({ type: "CANCEL" });
        haptic("cancel");
      }
    };

    const onCancelEvent = () => {
      dispatch({ type: "CANCEL" });
    };

    const onContextMenu = (e: Event) => {
      // Long-press on mobile opens iOS context menu by default. While
      // we're in the middle of a gesture the menu must not pop up.
      e.preventDefault();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onCancelEvent);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onCancelEvent);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [state.phase, state.origin, innerRadius, outerRadius, layout]);

  // Automatic RESET after the exit animation plays.
  useEffect(() => {
    if (state.phase !== "committing" && state.phase !== "cancelling") return;
    const id = window.setTimeout(() => dispatch({ type: "RESET" }), EXIT_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [state.phase]);

  const beginPress = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (isEnabledRef.current && !isEnabledRef.current()) return;
    // Only respond to primary pointer; secondary fingers / right-click
    // shouldn't invoke the ring.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dispatch({ type: "PRESS", origin: { x: e.clientX, y: e.clientY } });
  }, []);

  const forceClose = useCallback(() => dispatch({ type: "RESET" }), []);

  return { state, beginPress, forceClose };
}
