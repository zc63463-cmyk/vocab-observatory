// Pure geometry helpers for the Zen review radial action menu (v2).
//
// We keep DOM-awareness out of this module so:
//   (1) hit-testing can be exhaustively unit-tested without mocking pointer
//       events or framer-motion motion values.
//   (2) the ring's SVG path and the pointer-to-segment mapping share one
//       source of truth for angle math (otherwise edge cases around the
//       ±π wrap diverge between render and hit-test).
//
// Coordinate conventions
// ----------------------
// The caller passes (dx, dy) *relative to the ring center*, in DOM pixels.
// DOM's y-axis points DOWN, but all the menu math is easier if we treat
// "up" as positive (like classical trigonometry). We flip internally via
// `angle()`. Callers never see that flip.
//
//                 90° (up)
//                    │
//    180° (left) ────┼──── 0° (right)
//                    │
//               -90°/270° (down)

import type { RatingKey } from "@/components/review/zen/types";

/** Every action the menu can dispatch. 4 ratings + 3 utilities. */
export type RadialActionId =
  | RatingKey
  | "history"
  | "speak"
  | "detail";

export interface RadialSegment {
  id: RadialActionId;
  /** Angle of segment center, radians. See module-level coord convention. */
  centerAngle: number;
  /** Angular width of this segment, radians. */
  spread: number;
  label: string;
  /** Single-glyph fallback for very narrow viewports (≤ 320px). */
  shortLabel?: string;
}

/**
 * Default 4 + 3 layout, designed for a thumb-anchored FAB at the
 * bottom of the screen. The ring is an open-bottom (3/4) annulus:
 *
 *   • Right half (135°): the four rating actions stacked top-to-bottom
 *     in confidence-order — Easy at the top, Again at the bottom.
 *     Each segment spans 135/4 = 33.75°.
 *   • Left half (135°): three utility actions stacked top-to-bottom —
 *     Detail (open word page), History (drawer), Speak (TTS). Each
 *     segment spans 135/3 = 45°, so utilities have a noticeably wider
 *     target than ratings; that's intentional, since utility commits
 *     are less common but should feel forgiving.
 *   • Bottom 90° is an empty arc — the "open mouth" of the ring,
 *     centered on the FAB so the press point is always inside the
 *     dead-zone and the four rating segments fan up to the user's
 *     thumb at natural reach angles.
 *
 * Why the asymmetric split? In a session, the user lifts on a rating
 * 99% of the time. Pinning all four ratings to the dominant-thumb
 * (right) side keeps every commit a tight upward slide; the off-hand
 * side is reserved for the rarer utility actions.
 */
const RATING_SPREAD = (3 * Math.PI) / 16; // 33.75°
const UTILITY_SPREAD = Math.PI / 4;        // 45°

export const DEFAULT_LAYOUT: readonly RadialSegment[] = [
  // Right half — ratings, top → bottom (math angle decreases).
  // Centers chosen so segments tile (-π/4, π/2] with no gaps and the
  // top edge of Easy lands exactly at +π/2 (straight up).
  { id: "easy",    centerAngle:  (13 * Math.PI) / 32, spread: RATING_SPREAD, label: "Easy" },
  { id: "good",    centerAngle:   (7 * Math.PI) / 32, spread: RATING_SPREAD, label: "Good" },
  { id: "hard",    centerAngle:        Math.PI / 32,  spread: RATING_SPREAD, label: "Hard" },
  { id: "again",   centerAngle:  (-5 * Math.PI) / 32, spread: RATING_SPREAD, label: "Again" },
  // Left half — utilities, top → bottom (math angle wraps past +π).
  // Detail at the top so the most "information-rich" action is furthest
  // from the FAB (deliberate — high-value, less-frequent); Speak at the
  // bottom-left so it's closest to the thumb on the left side.
  { id: "detail",  centerAngle:   (5 * Math.PI) /  8, spread: UTILITY_SPREAD, label: "详情",   shortLabel: "�" },
  { id: "history", centerAngle:   (7 * Math.PI) /  8, spread: UTILITY_SPREAD, label: "历史",   shortLabel: "📜" },
  { id: "speak",   centerAngle:  (-7 * Math.PI) /  8, spread: UTILITY_SPREAD, label: "朗读",   shortLabel: "🔊" },
] as const;

// Layout invariant: total coverage = 4·(3π/16) + 3·(π/4) = 3π/4 + 3π/4 =
// 3π/2 (270°), leaving the bottom π/2 (90°) as a single contiguous gap
// from -3π/4 to -π/4. That gap doubles as: (a) a clear visual cue that
// the FAB sits at the ring's center; (b) a generous dead-zone that
// rejects accidental downward swipes.
//
// At the two top seams (±π/2 and π/2 specifically) adjacent segments
// share a knife-edge boundary. hitTest's first-match rule combined with
// the array order above resolves these deterministically: a perfectly
// vertical pull lands in Easy (right half wins).

/** Euclidean distance from the ring center. */
export function radius(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

/**
 * Screen-delta → math-convention angle in (-π, π].
 * Returns 0 when both deltas are zero (not NaN); callers should usually
 * reject via a radius check before consulting the angle.
 */
export function angle(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  // DOM y is down-positive; flip so "up on screen" maps to "+π/2" as
  // classical math expects.
  return Math.atan2(-dy, dx);
}

/** Normalize any real angle into the canonical (-π, π] range. */
export function normalize(a: number): number {
  const tau = 2 * Math.PI;
  // Map into [0, 2π) first, accounting for JS `%` being remainder not
  // modulo (so negative inputs don't land in the wrong basin).
  let r = ((a % tau) + tau) % tau;
  // Now fold the upper half into negative, keeping +π as the canonical
  // representative (so `normalize(π) === π`, not -π — matters for the
  // "again" sector whose centerAngle is exactly π).
  if (r > Math.PI) r -= tau;
  return r;
}

export interface HitTestOptions {
  innerRadius: number;
  outerRadius: number;
  layout?: readonly RadialSegment[];
}

/**
 * Given a pointer offset from the ring center, return the hovered segment
 * or null (dead zone / out-of-ring / angular gap between segments).
 */
export function hitTest(
  dx: number,
  dy: number,
  options: HitTestOptions,
): RadialSegment | null {
  const r = radius(dx, dy);
  if (r < options.innerRadius) return null;
  if (r > options.outerRadius) return null;

  const a = angle(dx, dy);
  const layout = options.layout ?? DEFAULT_LAYOUT;

  for (const seg of layout) {
    const delta = Math.abs(normalize(a - seg.centerAngle));
    if (delta <= seg.spread / 2) return seg;
  }
  return null;
}

/**
 * SVG path for one annulus sector. Uses DOM-native axes (y-down) so the
 * returned string can be dropped straight into a <path d={…}>. Note that
 * `centerAngle` / `spread` are in the math convention, same as hitTest,
 * so there is no discrepancy between render and hit-test.
 *
 * The arc is drawn as two arcs + two radial lines:
 *   M outer(a0) → A outer arc (sweep=0, math-positive winding)
 *   → L inner(a1) → A inner arc back (sweep=1) → Z
 *
 * sweep flags are chosen so the path is always filled on the "inside" of
 * the annulus regardless of which quadrant the center lies in.
 */
export function arcPath(
  centerAngle: number,
  spread: number,
  innerR: number,
  outerR: number,
): string {
  const a0 = centerAngle - spread / 2;
  const a1 = centerAngle + spread / 2;
  // `a1 > a0` always. Going from a0 → a1 means increasing math-angle,
  // which in DOM coords is counter-clockwise; SVG arc `sweep=0` means
  // "counter-clockwise" so that matches.
  const outerStart = polar(outerR, a0);
  const outerEnd   = polar(outerR, a1);
  const innerStart = polar(innerR, a1);
  const innerEnd   = polar(innerR, a0);
  const largeArc = spread > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

/** Math-convention polar → DOM-convention cartesian (y down). */
export function polar(r: number, theta: number): { x: number; y: number } {
  return { x: r * Math.cos(theta), y: -r * Math.sin(theta) };
}
