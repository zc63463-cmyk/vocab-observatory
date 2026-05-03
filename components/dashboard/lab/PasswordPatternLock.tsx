"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PATTERN_KEY_TO_SECTION, type SectionId } from "./sections";

/**
 * 9-dot gesture password lock.
 *
 * Inspired by Android's screen-unlock pattern. Different gestures unlock
 * different dashboard sections — the registry in `sections.ts` defines
 * which canonical pattern key (e.g., "1-4-7-8-9" for an L) maps to which
 * `SectionId`.
 *
 *   1 — 2 — 3
 *   |   |   |
 *   4 — 5 — 6
 *   |   |   |
 *   7 — 8 — 9
 *
 * Recogniser features:
 *   - Pointer Events (unified mouse + touch + pen)
 *   - Auto-include intermediate dots when crossing diagonals or through
 *     the centre, matching Android's behaviour. (Drag 1→9 → canonical
 *     key "1-5-9", not "1-9".)
 *   - Lenient hit radius so finger imprecision is forgiven.
 *   - Pointer capture so the pointer can leave the SVG and still report.
 *
 * Visual states:
 *   - idle: muted dots, no line
 *   - drawing: visited dots filled with accent, line follows finger
 *   - matched: brief green glow → opens modal via `onUnlock`
 *   - rejected: red flash + horizontal shake → reset
 *
 * Accessibility:
 *   - SVG has role="application" with aria-label
 *   - PatternLegend (sibling component) provides keyboard / screen-reader
 *     access to the same actions via plain buttons
 *   - prefers-reduced-motion suppresses shake / glow animations
 *
 * Layout: square 280×280 SVG centred in its container. Padding around
 * dots is generous so finger drags don't fly off the edge.
 */
export interface PasswordPatternLockProps {
  /** Called with the section id when a registered pattern is recognised. */
  onUnlock: (sectionId: SectionId) => void;
  /** Optional brief feedback line shown below the lock (e.g., "未识别"). */
  className?: string;
}

/* ── Geometry constants ───────────────────────────────────────────────── */
const SVG_SIZE = 280; // viewBox is square; CSS scales responsively
const PAD = 40; // distance from edge to outermost dots
const STEP = (SVG_SIZE - 2 * PAD) / 2; // distance between dots in a row/col
const DOT_RADIUS = 8;
const DOT_RADIUS_ACTIVE = 11;
const HIT_RADIUS = 30; // generous touch target

/** Pre-computed (col, row) and (x, y) for each dot index 1..9. */
interface DotGeom {
  index: number;
  col: number;
  row: number;
  x: number;
  y: number;
}
const DOTS: readonly DotGeom[] = (() => {
  const out: DotGeom[] = [];
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    out.push({
      index: i + 1,
      col,
      row,
      x: PAD + col * STEP,
      y: PAD + row * STEP,
    });
  }
  return out;
})();

/* ── Auto-include rule ────────────────────────────────────────────────── */
/**
 * When jumping from `from` to `to` over a third dot lying on the
 * straight segment between them, return that intermediate index. Else 0.
 *
 * Match Android: only the 8 obvious "skip-over-centre" or "skip-over-edge"
 * pairs trigger auto-include.
 */
const BETWEEN: Record<number, Record<number, number>> = {
  1: { 3: 2, 7: 4, 9: 5 },
  2: { 8: 5 },
  3: { 1: 2, 7: 5, 9: 6 },
  4: { 6: 5 },
  6: { 4: 5 },
  7: { 1: 4, 3: 5, 9: 8 },
  8: { 2: 5 },
  9: { 1: 5, 3: 6, 7: 8 },
};

function intermediate(from: number, to: number): number | null {
  return BETWEEN[from]?.[to] ?? null;
}

/* ── State machine ────────────────────────────────────────────────────── */
type Phase = "idle" | "drawing" | "matched" | "rejected";

interface State {
  phase: Phase;
  path: number[]; // visited dot indices in order
}

type Action =
  | { type: "begin"; dotIndex: number }
  | { type: "extend"; dotIndex: number }
  | { type: "match" }
  | { type: "reject" }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "begin":
      return { phase: "drawing", path: [action.dotIndex] };
    case "extend":
      if (state.phase !== "drawing") return state;
      if (state.path.includes(action.dotIndex)) return state;
      return { ...state, path: [...state.path, action.dotIndex] };
    case "match":
      return { ...state, phase: "matched" };
    case "reject":
      return { ...state, phase: "rejected" };
    case "reset":
      return { phase: "idle", path: [] };
    default:
      return state;
  }
}

/* ── Main component ───────────────────────────────────────────────────── */
export function PasswordPatternLock({ onUnlock, className }: PasswordPatternLockProps) {
  const [state, dispatch] = useReducer(reducer, { phase: "idle", path: [] });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /* Three timers can be in flight simultaneously across phases:
       - rejectTimerRef:  reject-shake → reset (~700 ms)
       - matchOpenTimerRef:  matched glow → onUnlock (220 ms)
       - matchResetTimerRef: onUnlock → reset (160 ms after open)
     All three are cleared on unmount so timers can't fire setState /
     onUnlock on a torn-down component (which would log a warning and
     potentially mutate the parent's modal state after the user has
     navigated away). */
  const rejectTimerRef = useRef<number | null>(null);
  const matchOpenTimerRef = useRef<number | null>(null);
  const matchResetTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  /* Cleanup all in-flight timers on unmount. */
  useEffect(() => {
    return () => {
      if (rejectTimerRef.current !== null) window.clearTimeout(rejectTimerRef.current);
      if (matchOpenTimerRef.current !== null) window.clearTimeout(matchOpenTimerRef.current);
      if (matchResetTimerRef.current !== null) window.clearTimeout(matchResetTimerRef.current);
    };
  }, []);

  /** Convert a screen coordinate (clientX/clientY) to SVG viewBox coords. */
  const toSvgCoord = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = SVG_SIZE / rect.width;
    const scaleY = SVG_SIZE / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  /** Hit-test pointer position against all dots, return matched dot index or null. */
  const hitTest = useCallback((x: number, y: number): number | null => {
    for (const dot of DOTS) {
      const dx = dot.x - x;
      const dy = dot.y - y;
      if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
        return dot.index;
      }
    }
    return null;
  }, []);

  /** Append a dot to the path, with auto-include of intermediate dots. */
  const tryAppend = useCallback(
    (newDot: number, currentPath: number[]) => {
      if (currentPath.includes(newDot)) return;
      const last = currentPath[currentPath.length - 1];
      if (last) {
        const between = intermediate(last, newDot);
        if (between && !currentPath.includes(between)) {
          dispatch({ type: "extend", dotIndex: between });
        }
      }
      dispatch({ type: "extend", dotIndex: newDot });
    },
    [],
  );

  /* ── Pointer handlers ─────────────────────────────────────────────── */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Block if we're animating success / failure
      if (state.phase === "matched" || state.phase === "rejected") return;

      // Cancel any pending reset (e.g. user starts a new gesture before the
      // reject-shake animation finishes)
      if (rejectTimerRef.current !== null) {
        window.clearTimeout(rejectTimerRef.current);
        rejectTimerRef.current = null;
      }

      const { x, y } = toSvgCoord(e.clientX, e.clientY);
      const hit = hitTest(x, y);
      setPointer({ x, y });
      setFeedback(null);

      if (hit !== null) {
        dispatch({ type: "begin", dotIndex: hit });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [state.phase, toSvgCoord, hitTest],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (state.phase !== "drawing") return;
      const { x, y } = toSvgCoord(e.clientX, e.clientY);
      setPointer({ x, y });

      const hit = hitTest(x, y);
      if (hit !== null && !state.path.includes(hit)) {
        tryAppend(hit, state.path);
      }
    },
    [state.phase, state.path, toSvgCoord, hitTest, tryAppend],
  );

  const finishGesture = useCallback(() => {
    if (state.phase !== "drawing") return;
    setPointer(null);

    // Single-dot release = silent reset (likely an accidental tap)
    if (state.path.length < 2) {
      dispatch({ type: "reset" });
      return;
    }

    const key = state.path.join("-");
    const sectionId = PATTERN_KEY_TO_SECTION.get(key);

    if (sectionId) {
      dispatch({ type: "match" });
      // Brief glow then open modal. Both timers are stored in refs so
      // unmount can cancel them — otherwise a torn-down component would
      // try to dispatch reset / call onUnlock and log warnings.
      matchOpenTimerRef.current = window.setTimeout(() => {
        matchOpenTimerRef.current = null;
        onUnlock(sectionId);
        // Reset shortly after the modal opens so the lock is fresh
        // when the user closes the modal.
        matchResetTimerRef.current = window.setTimeout(() => {
          matchResetTimerRef.current = null;
          dispatch({ type: "reset" });
        }, 160);
      }, 220);

      // Optional haptic
      try {
        navigator.vibrate?.(12);
      } catch {
        /* no-op */
      }
    } else {
      dispatch({ type: "reject" });
      setFeedback("未识别图案 — 试试 ┗ 正 L、对角 ╲、或展开图例");
      try {
        navigator.vibrate?.([30, 60, 30]);
      } catch {
        /* no-op */
      }
      // Auto-reset after the shake animation
      rejectTimerRef.current = window.setTimeout(() => {
        dispatch({ type: "reset" });
        rejectTimerRef.current = null;
      }, 700);
    }
  }, [state.phase, state.path, onUnlock]);

  const handlePointerUp = useCallback(() => {
    finishGesture();
  }, [finishGesture]);

  const handlePointerCancel = useCallback(() => {
    setPointer(null);
    if (state.phase === "drawing") {
      dispatch({ type: "reset" });
    }
  }, [state.phase]);

  /* ── Render helpers ───────────────────────────────────────────────── */

  /** Path segments between consecutive visited dots. */
  const linePath = useMemo(() => {
    if (state.path.length === 0) return null;
    const points = state.path.map((idx) => DOTS[idx - 1]);
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    // Live segment from last visited dot to current pointer (only while drawing)
    if (state.phase === "drawing" && pointer) {
      d += ` L ${pointer.x} ${pointer.y}`;
    }
    return d;
  }, [state.path, state.phase, pointer]);

  const lineColor =
    state.phase === "matched"
      ? "#22c55e"
      : state.phase === "rejected"
        ? "#ef4444"
        : "var(--color-accent)";

  const lineOpacity = state.phase === "idle" ? 0 : state.phase === "rejected" ? 0.85 : 0.7;

  /* ── JSX ──────────────────────────────────────────────────────────── */
  return (
    <div className={className}>
      <motion.div
        className="relative mx-auto flex w-full max-w-[320px] items-center justify-center"
        animate={
          state.phase === "rejected" && !reduceMotion
            ? { x: [0, -6, 6, -4, 4, -2, 2, 0] }
            : { x: 0 }
        }
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className="block w-full select-none"
          style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
          role="application"
          aria-label="图案密码锁。拖动连接 dot 解锁不同视图。"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Subtle background grid (hairlines connecting dots — helps users
              visualise the geometry of valid paths) */}
          <g opacity="0.06" stroke="var(--color-ink)" strokeWidth="0.6">
            {/* horizontal lines */}
            {[0, 1, 2].map((row) => (
              <line
                key={`h${row}`}
                x1={PAD}
                y1={PAD + row * STEP}
                x2={PAD + 2 * STEP}
                y2={PAD + row * STEP}
              />
            ))}
            {/* vertical lines */}
            {[0, 1, 2].map((col) => (
              <line
                key={`v${col}`}
                x1={PAD + col * STEP}
                y1={PAD}
                x2={PAD + col * STEP}
                y2={PAD + 2 * STEP}
              />
            ))}
          </g>

          {/* Connection line */}
          {linePath && (
            <motion.path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={lineOpacity}
              animate={{ opacity: lineOpacity }}
              transition={{ duration: 0.15 }}
            />
          )}

          {/* Dots */}
          {DOTS.map((dot) => {
            const visited = state.path.includes(dot.index);
            const fill = visited
              ? state.phase === "matched"
                ? "#22c55e"
                : state.phase === "rejected"
                  ? "#ef4444"
                  : "var(--color-accent)"
              : "var(--color-ink-soft)";
            const halo =
              visited && state.phase !== "rejected" ? (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={DOT_RADIUS_ACTIVE + 8}
                  fill={fill}
                  opacity="0.18"
                />
              ) : null;
            return (
              <g key={dot.index}>
                {halo}
                <motion.circle
                  cx={dot.x}
                  cy={dot.y}
                  r={visited ? DOT_RADIUS_ACTIVE : DOT_RADIUS}
                  fill={fill}
                  opacity={visited ? 1 : 0.4}
                  initial={false}
                  animate={{
                    r: visited ? DOT_RADIUS_ACTIVE : DOT_RADIUS,
                    opacity: visited ? 1 : 0.4,
                  }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                />
              </g>
            );
          })}
        </svg>
      </motion.div>

      {/* Feedback line — shown after a rejection */}
      <p
        className={`mt-3 min-h-[1.25rem] text-center text-xs leading-5 transition-colors ${
          state.phase === "rejected"
            ? "text-amber-600 dark:text-amber-400"
            : state.phase === "matched"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-[var(--color-ink-soft)] opacity-70"
        }`}
        aria-live="polite"
      >
        {state.phase === "matched"
          ? "✓ 已识别"
          : state.phase === "rejected"
            ? feedback
            : "拖动连接 dot · 不同图案打开不同模块"}
      </p>
    </div>
  );
}
