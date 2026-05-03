"use client";

import { useCallback, useEffect, useRef } from "react";
import { useZenReviewContext } from "./ZenReviewProvider";

/**
 * Pre-flip self-calibration slider. Renders only on the front face when
 * `preferences.predictionEnabled` is true. Capture surface is intentionally
 * narrow (the inline track + 5 quick-select chips) so an accidental tap
 * elsewhere on the card still flips. We stop propagation on the slider's
 * pointer events so dragging the thumb never bubbles up to the card click
 * handler.
 *
 * Design choices:
 *   - 5 % snap (`step={5}`) keeps the value space tractable for the user
 *     without losing meaningful resolution. The four-bucket FSRS rating
 *     scale only resolves to ~25-percentage-point granularity anyway.
 *   - Quick-select chips at 0/25/50/75/100 give a single-tap "I have a
 *     quick guess" path so users not in slider-mood can still commit a
 *     prediction in one gesture.
 *   - The displayed value reads as `XX%` rather than the raw integer
 *     because the user's mental model is percentage of recall, matching
 *     the framing of the calibration delta we show after rating.
 */
const QUICK_SELECT_VALUES = [0, 25, 50, 75, 100] as const;
const SLIDER_STEP = 5;

export function PredictionSlider() {
  const { prediction, setPrediction, phase } = useZenReviewContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const isLocked = phase !== "front";
  const displayValue = prediction ?? 50;

  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.currentTarget.value);
      if (Number.isFinite(next)) setPrediction(next);
    },
    [setPrediction],
  );

  const handleQuickSelect = useCallback(
    (value: number) => (e: React.MouseEvent) => {
      e.stopPropagation();
      setPrediction(value);
      inputRef.current?.focus();
    },
    [setPrediction],
  );

  // When transitioning back to the front face (e.g. via undo) the slider
  // remounts with prediction === null. We deliberately do NOT auto-set a
  // default value: leaving it null is what gates the REVEAL action, and
  // that gate is the whole point. The visual fallback (50 %) is only for
  // the slider thumb position so the UI doesn't render at the leftmost
  // edge looking pre-committed to "0 %".
  useEffect(() => {
    if (phase !== "front") return;
  }, [phase]);

  const valueColor = colorForValue(displayValue);
  const isCommitted = prediction !== null;

  return (
    <div
      className="mx-auto w-full max-w-md select-none"
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      role="group"
      aria-label="把握度自评"
    >
      <div className="mb-2 flex items-end justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          把握度自评
        </span>
        <span
          aria-live="polite"
          className="font-mono text-base font-semibold tabular-nums transition-colors"
          style={{ color: isCommitted ? valueColor : "var(--color-ink-soft)" }}
        >
          {isCommitted ? `${displayValue}%` : "—"}
        </span>
      </div>

      <input
        ref={inputRef}
        type="range"
        min={0}
        max={100}
        step={SLIDER_STEP}
        value={displayValue}
        disabled={isLocked}
        onChange={handleChange}
        onPointerDown={stopPropagation}
        onTouchStart={stopPropagation}
        aria-label="把握度（0 到 100 百分比）"
        aria-valuetext={isCommitted ? `${displayValue}%` : "未设定"}
        className="w-full cursor-pointer accent-[var(--color-accent)] disabled:opacity-50"
        style={{
          // Match thumb to the value color so the slider visually echoes
          // the user's confidence; CSS custom prop fallback is tolerant of
          // browsers that don't support `accent-color`.
          accentColor: isCommitted ? valueColor : undefined,
        }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
        <span>不会</span>
        <span>有印象</span>
        <span>记得</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {QUICK_SELECT_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            disabled={isLocked}
            onClick={handleQuickSelect(v)}
            aria-pressed={prediction === v}
            className={`
              rounded-full border px-3 py-1 text-xs font-mono tabular-nums
              transition-colors
              ${
                prediction === v
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] hover:border-[var(--color-border-strong)]"
              }
              disabled:cursor-not-allowed disabled:opacity-50
            `}
            style={{
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {v}%
          </button>
        ))}
      </div>

      {!isCommitted && phase === "front" && (
        <p
          aria-live="polite"
          className="mt-3 text-center text-xs text-[var(--color-ink-soft)] opacity-70"
        >
          先评估你的把握度，再翻面查看答案
        </p>
      )}
    </div>
  );
}

/**
 * Three-stop gradient red → amber → green. Solid token strings so we can
 * inline them without relying on Tailwind's JIT for arbitrary values.
 */
function colorForValue(value: number): string {
  if (value < 34) return "#c0594b"; // accent-2 family — "I will fail"
  if (value < 67) return "#d99b3b"; // amber — "I might recall"
  return "#0f6f62"; // accent — "I will recall"
}
