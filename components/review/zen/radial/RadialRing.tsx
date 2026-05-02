"use client";

import { motion } from "framer-motion";
import { RATING_CONFIG, type RatingKey } from "../types";
import {
  arcPath,
  polar,
  type RadialActionId,
  type RadialSegment,
} from "@/lib/review/radial-geometry";

// Open-state visual: an annulus of 6 labeled sectors centered on the
// pointerdown origin. The ring is rendered into a portal by the parent
// (ZenRadialMenu) so its fixed-layer positioning isn't affected by the
// 3D rotateY transform sitting around the flip card.
//
// All segment geometry comes from lib/review/radial-geometry so this
// component carries no angle math of its own — changing the layout in
// one place propagates correctly to hit-testing and rendering.

export interface RadialRingProps {
  /** Screen-space center the ring should appear around (pointerdown origin). */
  center: { x: number; y: number };
  innerRadius: number;
  outerRadius: number;
  layout: readonly RadialSegment[];
  /** Which segment is currently hovered; null if in dead zone / gap. */
  hoveredId: RadialActionId | null;
  /** Segment that was committed (during exit animation). Used to play
   *  the commit ripple; null for cancel-exit. */
  committedId: RadialActionId | null;
  /** "active" while pointer is tracking, "committing" or "cancelling"
   *  during the exit. */
  phase: "active" | "committing" | "cancelling";
  /** Segments that should render in a disabled visual state. Tapping
   *  them is treated as a cancel by useRadialGesture. */
  disabledIds?: ReadonlySet<RadialActionId>;
}

/** Map each segment id → its visual tint. Ratings use the existing
 *  RATING_CONFIG colours; utility sectors pick up the neutral ink so
 *  they're deliberately less loud than the primary rating quadrants. */
function colorFor(id: RadialActionId): string {
  if (id === "history" || id === "speak" || id === "detail") {
    return "var(--color-ink-soft)";
  }
  return RATING_CONFIG[id as RatingKey].color;
}

export function RadialRing({
  center,
  innerRadius,
  outerRadius,
  layout,
  hoveredId,
  committedId,
  phase,
  disabledIds,
}: RadialRingProps) {
  // SVG viewport large enough to contain the outermost geometry plus
  // a little padding for the commit-ripple, which can overshoot the
  // ring radius briefly. `2 * (R + pad)` → square; we anchor at center.
  const pad = 12;
  const viewSize = 2 * (outerRadius + pad);
  const half = viewSize / 2;

  return (
    <>
      {/* Backdrop — absorbs taps outside the ring (if user lifts here,
          the gesture's pointerup handler fires with `hovered === null`
          and cancels, so no additional handler is needed here). */}
      <motion.div
        className="fixed inset-0 z-[70] md:hidden"
        style={{
          background: "rgba(10, 10, 12, 0.28)",
          backdropFilter: "blur(2px)",
          pointerEvents: "none",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "active" ? 1 : 0 }}
        transition={{ duration: 0.12 }}
        aria-hidden="true"
      />

      <motion.svg
        className="fixed z-[80] md:hidden"
        width={viewSize}
        height={viewSize}
        viewBox={`${-half} ${-half} ${viewSize} ${viewSize}`}
        style={{
          // Anchor the SVG so its (0,0) coincides with the pointerdown
          // center. That way the arcPath output can use the ring center
          // directly.
          left: center.x - half,
          top: center.y - half,
          pointerEvents: "none",
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={
          phase === "committing"
            ? { opacity: 0, scale: 1.08 }
            : phase === "cancelling"
              ? { opacity: 0, scale: 0.6 }
              : { opacity: 1, scale: 1 }
        }
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        aria-hidden="true"
      >
        {/* Dead-zone ring stroke (subtle) — communicates "release here
            to cancel" without requiring an explicit label. */}
        <circle
          cx={0}
          cy={0}
          r={innerRadius - 4}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.4}
        />

        {layout.map((seg) => {
          const isHovered = hoveredId === seg.id;
          const isCommitted = committedId === seg.id;
          const isDisabled = disabledIds?.has(seg.id) ?? false;
          const tint = colorFor(seg.id);
          const d = arcPath(seg.centerAngle, seg.spread, innerRadius, outerRadius);

          return (
            <g key={seg.id} opacity={isDisabled ? 0.32 : 1}>
              <motion.path
                d={d}
                fill={isHovered && !isDisabled ? tint : "var(--color-panel)"}
                stroke={isHovered && !isDisabled ? tint : "var(--color-border)"}
                strokeWidth={isHovered && !isDisabled ? 1.5 : 1}
                animate={{
                  fillOpacity: isHovered && !isDisabled ? 0.22 : 0.95,
                  scale: isCommitted && phase === "committing" ? 1.08 : 1,
                }}
                transition={{ duration: 0.08 }}
                style={{ transformOrigin: "0 0" }}
              />
              <SegmentLabel
                centerAngle={seg.centerAngle}
                innerR={innerRadius}
                outerR={outerRadius}
                label={seg.label}
                color={isDisabled ? "var(--color-ink-soft)" : tint}
                isHovered={isHovered && !isDisabled}
              />
            </g>
          );
        })}
      </motion.svg>
    </>
  );
}

interface SegmentLabelProps {
  centerAngle: number;
  innerR: number;
  outerR: number;
  label: string;
  color: string;
  isHovered: boolean;
}

function SegmentLabel({
  centerAngle,
  innerR,
  outerR,
  label,
  color,
  isHovered,
}: SegmentLabelProps) {
  // Position the label at the segment's radial midpoint — splits the
  // difference between inner and outer, which reads most naturally.
  const r = (innerR + outerR) / 2;
  const { x, y } = polar(r, centerAngle);

  return (
    <motion.text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill={isHovered ? color : "var(--color-ink)"}
      fontSize={isHovered ? 15 : 13}
      fontWeight={isHovered ? 700 : 500}
      style={{ pointerEvents: "none", userSelect: "none" }}
      animate={{ scale: isHovered ? 1.08 : 1 }}
      transition={{ duration: 0.08 }}
    >
      {label}
    </motion.text>
  );
}
