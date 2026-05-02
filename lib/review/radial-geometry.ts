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

/** Every action the menu can dispatch. 4 ratings + 2 utilities. */
export type RadialActionId =
  | RatingKey
  | "history"
  | "speak";

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
 * Default 4+2 layout. Rating positions (left=Again, right=Good, up=Easy,
 * down=Hard) mirror v1 onPan exactly so users who had muscle memory from
 * the direct-swipe era keep it; utilities go on the two upper diagonals
 * where mis-commits have the lowest cost (History is a drawer, Speak is
 * audio — both non-destructive).
 */
export const DEFAULT_LAYOUT: readonly RadialSegment[] = [
  { id: "good",    centerAngle: 0,                   spread: Math.PI / 3, label: "Good" },
  { id: "speak",   centerAngle: Math.PI / 4,         spread: Math.PI / 6, label: "朗读",   shortLabel: "🔊" },
  { id: "easy",    centerAngle: Math.PI / 2,         spread: Math.PI / 3, label: "Easy" },
  { id: "history", centerAngle: (3 * Math.PI) / 4,   spread: Math.PI / 6, label: "历史",   shortLabel: "📜" },
  { id: "again",   centerAngle: Math.PI,             spread: Math.PI / 3, label: "Again" },
  { id: "hard",    centerAngle: -Math.PI / 2,        spread: Math.PI / 3, label: "Hard" },
] as const;

// Layout invariant: the total angular span must ≤ 2π. We keep it exactly
// 4·(π/3) + 2·(π/6) = 4π/3 + π/3 = 5π/3, leaving π/3 (60°) of gap
// distributed at the two bottom-diagonal seams. Those gaps act as
// dead-zones that prevent accidental commits when a user aims between
// adjacent sectors — important for the Hard↔Again and Hard↔Good borders
// where mis-rating has high cost.

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
