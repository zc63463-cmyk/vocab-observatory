"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AnimatedCounter } from "@/components/motion/AnimatedCounter";

/**
 * CircularGauge — 270° analog-style instrument primitive.
 *
 * Visual model (centred on a square viewBox):
 *   - Arc starts at -135° (≈ 7:30 clock position, bottom-left)
 *   - Sweeps through 0° (12 o'clock) clockwise
 *   - Ends at +135° (≈ 4:30 clock position, bottom-right)
 *   - Total sweep: 270°, leaving 90° open at the bottom for label space.
 *
 * Three rendering modes:
 *   - **Linear (default)**: fills from start (left endpoint) clockwise
 *     proportional to `(value - min) / (max - min)`. Use for cumulative
 *     metrics like streak days, due cards.
 *   - **Bidirectional**: zero is at the top (12 o'clock); positive values
 *     fill clockwise toward the right side, negative values fill
 *     counter-clockwise toward the left. `max` is the maximum absolute
 *     deviation. Use for signed deltas like FSRS calibration gap.
 *   - **Marker**: optional tick line on the arc at a "target" reading.
 *
 * Animation: arc draws on mount via framer-motion `pathLength`, central
 * value ticks up via `AnimatedCounter`. Both respect reduced-motion.
 *
 * Accessibility: rendered with `role="img"` and an aria-label that
 * spells out the reading + label. Screen readers don't get the visual
 * arc but do hear the relevant facts.
 */

const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;
const RADIUS = 76;
const STROKE_WIDTH = 9;
const ARC_START_DEG = -135;
const ARC_SWEEP_DEG = 270;
const ARC_END_DEG = ARC_START_DEG + ARC_SWEEP_DEG;
const ARC_MID_DEG = ARC_START_DEG + ARC_SWEEP_DEG / 2; // 0° = top

export interface CircularGaugeProps {
  /** Current reading. May be `NaN` / `Infinity`; coerced to 0 if so. */
  value: number;
  /** Max scale (in linear mode); max absolute deviation (in bidirectional). */
  max: number;
  /** Min scale (linear mode only). Defaults to 0. */
  min?: number;
  /** Eyebrow label rendered above the gauge in small caps. */
  label: string;
  /** Optional Chinese subtitle rendered below the gauge. */
  sublabel?: string;
  /** Optional formatter for the central numeric display. Receives raw value. */
  formatValue?: (v: number) => string;
  /** Optional unit caption shown beneath the central number (e.g., "days"). */
  suffix?: string;
  /** Visual tone — drives the arc fill colour. */
  tone?: "default" | "cool" | "warm" | "danger";
  /** Bidirectional mode: 0 in middle, fills left/right by sign. */
  bidirectional?: boolean;
  /** Optional target tick rendered on the arc. */
  marker?: { value: number; label?: string };
  /**
   * If provided, the entire gauge becomes an interactive button that
   * triggers this callback on click — used in the Console layout to
   * deep-link from a reading into its source section/modal.
   */
  onClick?: () => void;
  /**
   * Optional drill-down hint shown on hover (e.g., "查看 →"). Only
   * rendered when `onClick` is also provided.
   */
  hoverHint?: string;
  /**
   * Optional 7-ish-point trend series rendered as a miniature polyline
   * beneath the central readout. Purely contextual — the arc already
   * communicates the "now" value; the sparkline provides "trend".
   *
   * Values are auto-normalized to their own min/max, so the sparkline
   * describes **shape** rather than magnitude. Pass semantically-aligned
   * values (e.g., per-day counts for the last 7 days); ≥ 2 points
   * required to render, otherwise skipped silently.
   *
   * Non-finite values are filtered out defensively.
   */
  sparkline?: readonly number[];
  /**
   * Optional text surfaced as a native browser tooltip (SVG `<title>`)
   * when hovering the sparkline. Conventionally describes the time
   * window + date range, e.g., `"7d · Jul 15–21"`. Also wired to
   * `aria-label` for screen-reader accessibility.
   *
   * Only applied when a sparkline actually renders.
   */
  sparklineLabel?: string;
}

const TONE_COLOR: Record<NonNullable<CircularGaugeProps["tone"]>, string> = {
  default: "var(--color-accent)",
  cool: "var(--color-accent)",
  warm: "var(--color-accent-2)",
  danger: "#ef4444",
};

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  // 0° at top, increasing clockwise
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Build an SVG arc path from `startDeg` to `endDeg` going clockwise on
 * the gauge convention (0° = top, increasing clockwise).
 *
 * For very small spans (< 0.5°) we return an empty string so consumers
 * can skip rendering rather than ship a degenerate path.
 */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const span = endDeg - startDeg;
  if (Math.abs(span) < 0.5) return "";
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = Math.abs(span) > 180 ? 1 : 0;
  const sweepFlag = span > 0 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export function CircularGauge({
  value,
  max,
  min = 0,
  label,
  sublabel,
  formatValue,
  suffix,
  tone = "default",
  bidirectional = false,
  marker,
  onClick,
  hoverHint = "查看 →",
  sparkline,
  sparklineLabel,
}: CircularGaugeProps) {
  const reduceMotion = useReducedMotion();

  /* ── Defensive coercion for non-finite numbers ────────────────────
   * A `NaN` or `Infinity` slipping into the SVG arc math turns into
   * an unparseable `M NaN NaN A 76 76 …` path that React still mounts
   * but the browser silently rejects, leaving an invisible gauge.
   * Coercing to 0 here keeps the gauge visible (full track, no fill)
   * even when upstream data is malformed.
   */
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMaxInput = Number.isFinite(max) ? max : 1;

  /* ── Compute arc geometry ──────────────────────────────────────── */
  const safeMax = safeMaxInput === 0 ? 1 : safeMaxInput;

  let valueArc = "";
  if (bidirectional) {
    // Zero anchored at top; ±value fans out in either direction.
    const half = ARC_SWEEP_DEG / 2;
    const fillDeg = (Math.min(Math.abs(safeValue), safeMax) / safeMax) * half;
    if (safeValue >= 0) {
      valueArc = describeArc(CENTER, CENTER, RADIUS, ARC_MID_DEG, ARC_MID_DEG + fillDeg);
    } else {
      valueArc = describeArc(CENTER, CENTER, RADIUS, ARC_MID_DEG - fillDeg, ARC_MID_DEG);
    }
  } else {
    const span = safeMax - min;
    const safeSpan = span === 0 ? 1 : span;
    const ratio = Math.max(0, Math.min(1, (safeValue - min) / safeSpan));
    valueArc = describeArc(
      CENTER,
      CENTER,
      RADIUS,
      ARC_START_DEG,
      ARC_START_DEG + ratio * ARC_SWEEP_DEG,
    );
  }

  const trackArc = describeArc(CENTER, CENTER, RADIUS, ARC_START_DEG, ARC_END_DEG);
  const fillColor = TONE_COLOR[tone];

  /* ── Marker tick ───────────────────────────────────────────────── */
  let markerLine: React.ReactNode = null;
  if (marker) {
    const span = safeMax - min;
    const safeSpan = span === 0 ? 1 : span;
    const ratio = bidirectional
      ? 0.5 + marker.value / (2 * safeMax) // map -max..max to 0..1
      : (marker.value - min) / safeSpan;
    const markerDeg = ARC_START_DEG + Math.max(0, Math.min(1, ratio)) * ARC_SWEEP_DEG;
    const inner = polarToCartesian(CENTER, CENTER, RADIUS - STROKE_WIDTH, markerDeg);
    const outer = polarToCartesian(CENTER, CENTER, RADIUS + STROKE_WIDTH, markerDeg);
    markerLine = (
      <line
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        stroke="var(--color-ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
    );
  }

  /* ── ARIA description ──────────────────────────────────────────── */
  const formatted = formatValue ? formatValue(safeValue) : `${safeValue}`;
  const ariaLabel = `${label}: ${formatted}${suffix ? ` ${suffix}` : ""}`;

  /* ── Render ────────────────────────────────────────────────────── */
  // Outer wrapper is a `<button>` when interactive, plain `<div>` otherwise.
  // Both share the same flex-column layout and a fixed-width gauge container
  // (`w-[140px] sm:w-[160px]`). We deliberately use a fixed width rather than
  // `w-full max-w-[160px]` because the parent is `flex-col items-center` —
  // children there don't stretch to the cross axis, so `w-full` collapses
  // to 0 and the SVG silently disappears. (This was the actual bug behind
  // the "Phase 3 doesn't render on desktop" report.)
  const interactive = !!onClick;
  const Wrapper = interactive ? "button" : "div";
  const wrapperProps = interactive
    ? {
        type: "button" as const,
        onClick,
        "aria-label": `${ariaLabel}. ${hoverHint}`,
      }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative flex flex-col items-center justify-start ${
        interactive
          ? "cursor-pointer rounded-2xl px-2 py-2 transition-all duration-200 hover:bg-[var(--color-surface-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          : ""
      }`}
    >
      {/* Eyebrow */}
      <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
        {label}
      </p>

      {/* Gauge */}
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative mt-2 aspect-square w-[140px] sm:w-[160px]"
      >
        <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="absolute inset-0 h-full w-full">
          {/* Track */}
          {trackArc && (
            <path
              d={trackArc}
              stroke="var(--color-border-strong)"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              fill="none"
              opacity={0.32}
            />
          )}

          {/* Inner soft glow ring (decorative, gives glass depth) */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS - STROKE_WIDTH * 1.5}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="0.6"
            opacity="0.5"
          />

          {/* Value arc — animated */}
          {valueArc && (
            <motion.path
              d={valueArc}
              stroke={fillColor}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              fill="none"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
              style={{
                filter: `drop-shadow(0 0 6px ${fillColor})`,
              }}
            />
          )}

          {/* Marker tick */}
          {markerLine}

          {/* Bidirectional centre tick (only in bidirectional mode) */}
          {bidirectional && (() => {
            const inner = polarToCartesian(CENTER, CENTER, RADIUS - STROKE_WIDTH * 0.7, ARC_MID_DEG);
            const outer = polarToCartesian(CENTER, CENTER, RADIUS + STROKE_WIDTH * 0.7, ARC_MID_DEG);
            return (
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="var(--color-ink-soft)"
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity="0.7"
              />
            );
          })()}
        </svg>

        {/* Central readout — absolute centred over SVG.
           Hoist `formatted` once so the AnimatePresence key and the
           rendered text stay in sync without invoking `formatValue`
           twice per render (cheap but unnecessary). */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="section-title text-2xl font-semibold tabular-nums leading-none text-[var(--color-ink)] sm:text-3xl">
            {formatValue ? (
              /* `AnimatePresence initial={false}` suppresses the entry
                 animation on the very first render (so hydration shows
                 the real value immediately, matching AnimatedCounter's
                 mount behavior), but still plays enter/exit on later
                 remounts when the `key` (formatted value string) flips
                 — giving a subtle "slot machine" roll on value change. */
              reduceMotion ? (
                formatted
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={formatted}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="inline-block"
                  >
                    {formatted}
                  </motion.span>
                </AnimatePresence>
              )
            ) : (
              /* AnimatedCounter already tweens internally on target
                 change — no additional wrapper needed. */
              <AnimatedCounter target={safeValue} />
            )}
          </p>
          {suffix && (
            <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              {suffix}
            </p>
          )}
          {/* 7d sparkline — describes *trend*, auto-normalized min→max.
              Gauges without history (e.g., Target) pass undefined and skip. */}
          {(() => {
            const points = (sparkline ?? []).filter((v) => Number.isFinite(v));
            if (points.length < 2) return null;
            const W = 48;
            const H = 12;
            const PAD = 2;
            const min = Math.min(...points);
            const max = Math.max(...points);
            const span = max - min;
            const safeSpan = span === 0 ? 1 : span;
            const coords = points.map((v, i) => {
              const x = (i / (points.length - 1)) * W;
              const y = PAD + (1 - (v - min) / safeSpan) * (H - 2 * PAD);
              return [x, y] as const;
            });
            const d = coords
              .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
              .join(" ");
            const last = coords[coords.length - 1];
            /* The wrapping `<div role="img" aria-label={ariaLabel}>`
               above already announces the gauge to screen readers. We
               keep this inner SVG `aria-hidden` so it doesn't *also*
               get announced — otherwise the reading would be
               double-stated ("Streak 7 days. Image: 7d Jul 15-21").
               When a `sparklineLabel` is present we still attach a
               `<title>` child, which gives sighted pointer users the
               native browser tooltip on hover without polluting the
               accessibility tree. */
            return (
              <svg
                aria-hidden
                viewBox={`0 0 ${W} ${H}`}
                className="mt-1.5 h-3 w-12 opacity-80"
              >
                {sparklineLabel && <title>{sparklineLabel}</title>}
                <path
                  d={d}
                  fill="none"
                  stroke={fillColor}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={last[0]} cy={last[1]} r="1.4" fill={fillColor} />
              </svg>
            );
          })()}
        </div>
      </div>

      {/* Sublabel */}
      {sublabel && (
        <p className="mt-2 text-[11px] text-[var(--color-ink-soft)] opacity-80">{sublabel}</p>
      )}

      {/* Hover hint — only when interactive */}
      {interactive && (
        <span
          aria-hidden
          className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-accent)] opacity-0 transition-opacity duration-200 group-hover:opacity-90 group-focus-visible:opacity-90"
        >
          {hoverHint}
        </span>
      )}
    </Wrapper>
  );
}
