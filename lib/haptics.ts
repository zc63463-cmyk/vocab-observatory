// Minimal haptics wrapper for mobile feedback in the Zen review radial menu.
//
// Rationale for not pulling a dependency:
//   - iOS Safari exposes `navigator.vibrate` (since iOS 16) that mirrors
//     Android's Web Vibration API. Pattern-based vibrate is supported
//     cross-device.
//   - Apple's richer Haptic Engine is only reachable from native apps
//     or via `<input type="button">` with `hapticfeedback` attribute on
//     iOS 17.4+, not stable enough to rely on in a PWA context.
//   - Users may have silenced vibration; we never want to throw — every
//     method is fire-and-forget with a try/catch around the native call.
//
// Callers should treat these as hints, not guarantees; the review flow
// must function identically when haptics fail silently.

type HapticIntent =
  | "select"    // scrolling past a new radial segment
  | "engage"    // ring opens, strongest hint moment
  | "commit"    // action dispatched, triple-tap notification
  | "cancel"    // aborted without committing
  ;

/** Intent → vibrate pattern (ms). Keep all patterns < 50ms total so they
 *  feel like texture, not a buzzer. */
const PATTERNS: Record<HapticIntent, number | number[]> = {
  select: 5,
  engage: 10,
  commit: [8, 20, 8],
  cancel: 4,
};

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

/** Triggers a short haptic burst matching the given intent. No-op when
 *  the device cannot vibrate, when the user has set reduced-motion, or
 *  when the browser throws (e.g., user-activation requirement missed). */
export function haptic(intent: HapticIntent): void {
  if (!canVibrate()) return;
  if (typeof window !== "undefined" && window.matchMedia) {
    // Respect reduced-motion as a general "less stimulation" signal —
    // even though vibration isn't strictly motion, users who opt out
    // of animations generally want quieter UX across the board.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  }
  try {
    navigator.vibrate(PATTERNS[intent]);
  } catch {
    // Some browsers throw without user-gesture activation; swallow.
  }
}
