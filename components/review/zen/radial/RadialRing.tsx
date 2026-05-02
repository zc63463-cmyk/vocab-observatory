"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { RATING_CONFIG, type RatingKey } from "../types";
import {
  arcPath,
  polar,
  type RadialActionId,
  type RadialSegment,
} from "@/lib/review/radial-geometry";

// Open-state visual: an annulus of 7 labeled sectors centered on the
// pointerdown origin. The ring is rendered into a portal by the parent
// (ZenRadialMenu) so its fixed-layer positioning isn't affected by the
// 3D rotateY transform sitting around the flip card.
//
// All segment geometry comes from lib/review/radial-geometry so this
// component carries no angle math of its own — changing the layout in
// one place propagates correctly to hit-testing and rendering.
//
// Visual treatment
// ----------------
// Each segment is built from three stacked SVG paths sharing the same
// `d`:
//   1. base fill      — panel tone (or tint flash on commit)
//   2. hover gradient — per-segment radial gradient in the action's
//      accent colour, faded in when hovered
//   3. rim light      — a global top-lit linear gradient overlay that
//      gives the whole ring a "caught light from above" feel
// A thin stroke is then drawn on top. Around the ring we add tick
// marks at every segment boundary (hairlines) and a center pivot dot
// inside the dead-zone. The backdrop is a radial spotlight centered on
// the ring origin rather than a flat scrim — it reads as "stage lit".

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
  /** Live pointer offset from `center`. When provided we draw a thin
   *  radial guideline from origin to (a slightly outward-clamped)
   *  pointer position, giving fine-grained directional feedback to the
   *  user. Null while the pointer hasn't moved since press. */
  pointer?: { dx: number; dy: number } | null;
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
  pointer,
}: RadialRingProps) {
  // SVG viewport large enough to contain the outermost geometry plus
  // a little padding for the commit shockwave, which can overshoot the
  // ring radius briefly. `2 * (R + pad)` → square; we anchor at center.
  const pad = 16;
  const viewSize = 2 * (outerRadius + pad);
  const half = viewSize / 2;

  // Collect every segment-edge angle so we can draw hairline tick
  // marks at each seam. Rounding + Set de-dupes the shared boundaries
  // between adjacent segments so we don't double-stroke.
  const boundaryAngles = useMemo(() => {
    const s = new Set<string>();
    for (const seg of layout) {
      s.add((seg.centerAngle - seg.spread / 2).toFixed(5));
      s.add((seg.centerAngle + seg.spread / 2).toFixed(5));
    }
    return Array.from(s).map(Number);
  }, [layout]);

  // Build a CSS radial-gradient that places a soft pool of light at
  // the ring origin and darkens as it fans outward to the viewport
  // edges. The result reads as a spotlight on the ring.
  const spotlight = `radial-gradient(circle at ${center.x}px ${center.y}px, rgba(10, 10, 12, 0) 0%, rgba(10, 10, 12, 0.28) 45%, rgba(10, 10, 12, 0.44) 100%)`;

  return (
    <>
      {/* Backdrop — spotlight radial instead of flat scrim. Absorbs
          taps outside the ring (if user lifts here, the gesture's
          pointerup handler fires with `hovered === null` and cancels,
          so no additional handler is needed here). */}
      <motion.div
        className="fixed inset-0 z-[70] md:hidden"
        style={{
          background: spotlight,
          backdropFilter: "blur(4px) saturate(1.08)",
          WebkitBackdropFilter: "blur(4px) saturate(1.08)",
          pointerEvents: "none",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "active" ? 1 : 0 }}
        transition={{ duration: 0.14 }}
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
          // Global, ring-wide drop-shadow. Applying it here instead of
          // per-segment lets the browser composite a single shadow
          // layer and keeps the ring feeling like one elevated object
          // rather than seven separate tiles.
          filter:
            "drop-shadow(0 12px 28px rgba(35, 26, 18, 0.22)) drop-shadow(0 2px 6px rgba(35, 26, 18, 0.12))",
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
        <defs>
          {/* Top-lit rim highlight shared across every segment. In
              userSpaceOnUse it's a single vertical ramp across the
              whole ring, so segments at the top pick up the bright
              stops and segments at the bottom pick up the transparent
              ones — a cohesive "light from above" impression. */}
          <linearGradient
            id="ring-rim"
            x1="0"
            y1={-outerRadius}
            x2="0"
            y2={outerRadius}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.28)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.06)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>

          {/* Per-segment hover gradient — centered on the segment's
              mid-radius point so the tint glows from "inside" the
              segment outward. Colour comes from RATING_CONFIG for
              ratings and neutral-ink for utility actions. */}
          {layout.map((seg) => {
            const mid = polar((innerRadius + outerRadius) / 2, seg.centerAngle);
            const r = (outerRadius - innerRadius) * 0.95;
            const color = colorFor(seg.id);
            return (
              <radialGradient
                key={`grad-${seg.id}`}
                id={`radial-grad-${seg.id}`}
                cx={mid.x}
                cy={mid.y}
                r={r}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={color} stopOpacity="0.42" />
                <stop offset="65%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0.06" />
              </radialGradient>
            );
          })}
        </defs>

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

        {/* Center pivot marker — a small filled dot inside the dead-
            zone. Confirms where the ring is anchored and gives the
            drag guideline a visible origin to emanate from. */}
        <circle
          cx={0}
          cy={0}
          r={3}
          fill="var(--color-ink-soft)"
          opacity={0.72}
        />
        <circle
          cx={0}
          cy={0}
          r={6}
          fill="none"
          stroke="var(--color-ink-soft)"
          strokeWidth={1}
          opacity={0.22}
        />

        {layout.map((seg) => {
          const isHovered = hoveredId === seg.id;
          const isCommitted = committedId === seg.id;
          const isDisabled = disabledIds?.has(seg.id) ?? false;
          const isActiveVisual =
            (isHovered && !isDisabled) ||
            (isCommitted && phase === "committing");
          const tint = colorFor(seg.id);
          const d = arcPath(seg.centerAngle, seg.spread, innerRadius, outerRadius);
          // Mid-radius point along the segment's center axis. Used as
          // the anchor for the commit ripple.
          const mid = polar((innerRadius + outerRadius) / 2, seg.centerAngle);

          return (
            <g key={seg.id} opacity={isDisabled ? 0.38 : 1}>
              {/* 1. Base fill — panel tone, or a tint flash during
                  commit. Flat fills read well against the drop-shadow
                  applied at the <svg> level. */}
              <motion.path
                d={d}
                fill={
                  isCommitted && phase === "committing"
                    ? tint
                    : "var(--color-panel-strong)"
                }
                animate={{
                  fillOpacity:
                    isCommitted && phase === "committing"
                      ? [0.3, 0.8, 0]
                      : 0.94,
                }}
                transition={
                  isCommitted && phase === "committing"
                    ? { duration: 0.22, ease: "easeOut" }
                    : { duration: 0.08 }
                }
              />

              {/* 2. Hover gradient — fades in for the currently
                  targeted segment. Uses the per-segment radial
                  gradient defined in <defs>. */}
              {isHovered && !isDisabled && (
                <motion.path
                  d={d}
                  fill={`url(#radial-grad-${seg.id})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                />
              )}

              {/* 3. Rim-light overlay — shared top-lit gradient. Kept
                  at a modest opacity so it lifts the material without
                  washing out the hover/commit colour beneath. */}
              <path
                d={d}
                fill="url(#ring-rim)"
                opacity={0.55}
                pointerEvents="none"
              />

              {/* 4. Stroke — crisp outline on top of the fills. Gets
                  the tint colour when the segment is "alive" (hovered
                  or committing) to emphasise the selection. */}
              <motion.path
                d={d}
                fill="none"
                stroke={
                  isActiveVisual ? tint : "var(--color-border-strong)"
                }
                strokeWidth={isActiveVisual ? 1.6 : 0.9}
                animate={{ strokeOpacity: isActiveVisual ? 0.95 : 0.62 }}
                transition={{ duration: 0.1 }}
              />

              {isCommitted && phase === "committing" && (
                <>
                  {/* Primary ripple — filled disc at the segment's
                      mid-radius point. Reads as "the tap landed here". */}
                  <motion.circle
                    cx={mid.x}
                    cy={mid.y}
                    r={0}
                    fill={tint}
                    initial={{ r: 0, opacity: 0.6 }}
                    animate={{ r: (outerRadius - innerRadius) * 0.9, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  />
                  {/* Secondary shockwave — expanding stroke ring
                      anchored at the ring origin, radiates past the
                      outer edge. Adds a touch of drama to the commit
                      without blocking the next card. */}
                  <motion.circle
                    cx={0}
                    cy={0}
                    r={innerRadius}
                    fill="none"
                    stroke={tint}
                    strokeWidth={2.5}
                    initial={{ r: innerRadius, opacity: 0.55 }}
                    animate={{ r: outerRadius + 10, opacity: 0, strokeWidth: 0 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                  />
                </>
              )}

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

        {/* Segment-boundary tick marks — thin hairlines at each seam,
            extending just inside the inner radius. Their very low
            opacity keeps them from fighting the segments; they read
            as precision detailing rather than visual noise. */}
        {boundaryAngles.map((a, i) => {
          const p1 = polar(innerRadius - 4, a);
          const p2 = polar(innerRadius + 1, a);
          return (
            <line
              key={`tick-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="var(--color-border-strong)"
              strokeWidth={0.8}
              strokeLinecap="round"
              opacity={0.5}
            />
          );
        })}

        <DragGuideline
          pointer={pointer}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          phase={phase}
        />
      </motion.svg>
    </>
  );
}

interface DragGuidelineProps {
  pointer: { dx: number; dy: number } | null | undefined;
  innerRadius: number;
  outerRadius: number;
  phase: "active" | "committing" | "cancelling";
}

/** Thin radial line drawn from the ring center toward the pointer.
 *  Helps the user visually align their drag with a target segment,
 *  especially in the dead-zone where no segment is highlighted. The
 *  endpoint is clamped just past `outerRadius` so the line never
 *  visually escapes the SVG viewport. */
function DragGuideline({
  pointer,
  innerRadius,
  outerRadius,
  phase,
}: DragGuidelineProps) {
  if (phase !== "active" || !pointer) return null;
  // Pointer below the inner-radius dead zone means the user hasn't
  // committed to a direction yet — hide the line to avoid a tiny
  // wobbly stub right under the FAB.
  const dist = Math.hypot(pointer.dx, pointer.dy);
  if (dist < innerRadius * 0.45) return null;

  // Clamp the line tip to (outerRadius + 6px) along the same heading.
  // Going slightly past the ring outer edge gives the line a "shoots-
  // through" feel that subtly emphasises the targeted segment.
  const cap = outerRadius + 6;
  const scale = Math.min(1, cap / dist);
  const tipX = pointer.dx * scale;
  const tipY = pointer.dy * scale;

  return (
    <g pointerEvents="none">
      <line
        x1={0}
        y1={0}
        x2={tipX}
        y2={tipY}
        stroke="var(--color-ink-soft)"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeDasharray="2 3"
        opacity={0.55}
      />
      {/* Terminal dot at the pointer tip — reinforces "this is where
          you are right now". Kept small so it doesn't obscure the
          underlying segment stroke. */}
      <circle
        cx={tipX}
        cy={tipY}
        r={2.5}
        fill="var(--color-ink-soft)"
        opacity={0.72}
      />
    </g>
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
      fontSize={isHovered ? 15 : 13}
      fontWeight={isHovered ? 700 : 550}
      style={{
        pointerEvents: "none",
        userSelect: "none",
        // Subtle letter-spacing reads as "typographic intent" rather
        // than default web rendering. Slightly negative on idle for a
        // more compact feel, zeroed on hover so the tracking-out effect
        // helps the active label pop.
        letterSpacing: isHovered ? "0.02em" : "0",
      }}
      animate={{
        scale: isHovered ? 1.08 : 1,
        fill: isHovered ? color : "var(--color-ink)",
      }}
      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      {label}
    </motion.text>
  );
}
