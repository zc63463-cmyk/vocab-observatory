import type { RatingKey } from "@/components/review/zen/types";

/**
 * Swipe → rating mapping for mobile touch gestures on the zen flashcard.
 *
 * Keeping this as a pure function (no framer-motion types, no DOM refs)
 * lets us unit-test every threshold/direction branch without spinning up
 * a React tree. The ZenFlashcard component calls `resolveSwipeRating`
 * from inside `onDragEnd` and dispatches the resulting rating.
 *
 * Direction map (user-facing contract — do NOT change without UX sign-off):
 *   left  → again
 *   right → good
 *   up    → easy
 *   down  → hard
 *
 * The commit policy is "either / or": a gesture fires when the absolute
 * displacement clears `distanceThreshold` OR when the release velocity
 * clears `velocityThreshold`. This mirrors how iOS / Android swipe
 * sheets behave — a quick flick works even if the finger didn't travel
 * far, and a slow deliberate drag works even if the flick velocity is
 * near zero.
 */

/** Minimum absolute offset (px) along the dominant axis to commit a rating. */
export const SWIPE_DISTANCE_THRESHOLD = 80;

/** Minimum absolute velocity (px/s) along the dominant axis to commit a rating. */
export const SWIPE_VELOCITY_THRESHOLD = 500;

export interface SwipeVector {
  x: number;
  y: number;
}

export interface ResolveSwipeOptions {
  /** Override the default 80px distance trigger. Useful for tests. */
  distanceThreshold?: number;
  /** Override the default 500 px/s velocity trigger. Useful for tests. */
  velocityThreshold?: number;
}

/**
 * Maps a finished drag gesture to a rating key, or `null` when the
 * gesture was too small to commit. The dominant axis is whichever of
 * `|offset.x|` / `|offset.y|` is larger — this avoids ambiguous diagonal
 * swipes firing the "wrong" direction near 45°.
 *
 * Tie-breaking: when `|offset.x| === |offset.y|`, horizontal wins. This
 * matches common mobile gesture libs (Hammer, React-Use-Gesture) and
 * keeps the most important ratings (Again / Good) accessible.
 */
export function resolveSwipeRating(
  offset: SwipeVector,
  velocity: SwipeVector,
  options: ResolveSwipeOptions = {},
): RatingKey | null {
  const distanceThreshold = options.distanceThreshold ?? SWIPE_DISTANCE_THRESHOLD;
  const velocityThreshold = options.velocityThreshold ?? SWIPE_VELOCITY_THRESHOLD;

  const absX = Math.abs(offset.x);
  const absY = Math.abs(offset.y);

  // A completely still release never commits.
  if (absX === 0 && absY === 0 && velocity.x === 0 && velocity.y === 0) {
    return null;
  }

  // Dominant axis decides direction. Horizontal wins on a tie so the most
  // frequent ratings (Again / Good) take priority over Hard / Easy.
  const horizontalDominant = absX >= absY;

  if (horizontalDominant) {
    const passes =
      absX >= distanceThreshold || Math.abs(velocity.x) >= velocityThreshold;
    if (!passes) return null;
    return offset.x < 0 ? "again" : "good";
  }

  const passes =
    absY >= distanceThreshold || Math.abs(velocity.y) >= velocityThreshold;
  if (!passes) return null;
  return offset.y < 0 ? "easy" : "hard";
}

/**
 * Describes which rating a *live* drag gesture is currently aimed at.
 * Used by the ZenFlashcard to fade in the matching rating label during
 * the drag — users see a preview of what will fire on release.
 *
 * Unlike `resolveSwipeRating` this never returns `null` once any
 * meaningful offset exists; even a 10px nudge surfaces the candidate
 * direction. That's intentional — live feedback should be eager, while
 * commit is conservative.
 */
export function previewSwipeRating(offset: SwipeVector): RatingKey | null {
  const absX = Math.abs(offset.x);
  const absY = Math.abs(offset.y);
  if (absX < 8 && absY < 8) return null;
  if (absX >= absY) {
    return offset.x < 0 ? "again" : "good";
  }
  return offset.y < 0 ? "easy" : "hard";
}
