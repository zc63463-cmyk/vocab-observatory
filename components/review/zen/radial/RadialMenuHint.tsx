"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

// First-run onboarding chip for the radial action menu.
//
// Why this exists:
//   The FAB renders three dots, which most users instinctively tap rather
//   than long-press. A simple tap on the FAB triggers the gesture's
//   pressing state, fails the 50ms activation window, and is silently
//   treated as a cancel. New users walk away thinking the button is
//   broken. This chip nudges them toward "long press" once.
//
// When it's shown:
//   • Mobile only (the desktop flow uses keyboard shortcuts).
//   • Card is on the back face — the moment the user *needs* to rate.
//   • localStorage flag `LS_KEY` is unset (first session, or wiped).
//
// When it's auto-dismissed:
//   • The user successfully opens the ring (active phase reached).
//   • An 8-second display timer expires.
//   • The user taps the close affordance.
// Once dismissed, we never show it again on this device — see `dismiss()`.

const LS_KEY = "vocab-observatory.zen.radial-hint-dismissed";
const AUTO_DISMISS_MS = 8000;

/** Read-only check so we can decide before the first paint whether to
 *  even mount the chip. Returning true if localStorage is unavailable —
 *  better to silently skip the hint than to render in private mode. */
function alreadyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return true;
  }
}

export interface UseRadialHintApi {
  /** True while the hint should be visible. Combine with the caller's
   *  own availability gate before rendering <RadialMenuHint />. */
  visible: boolean;
  /** Hide the hint and persist that decision to localStorage. Idempotent. */
  dismiss: () => void;
}

/** Owns the dismissed/visible state + localStorage persistence. The
 *  hook starts in the "dismissed" state to avoid an SSR/CSR mismatch
 *  flash; the effect below flips it on the client if the flag is unset. */
export function useRadialHint(): UseRadialHintApi {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(alreadyDismissed());
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_KEY, "1");
    } catch {
      // private mode / quota-exceeded: dismissed stays true in memory
      // for the rest of the session, which is good enough.
    }
  }, []);

  return { visible: !dismissed, dismiss };
}

export interface RadialMenuHintProps {
  onDismiss: () => void;
}

export function RadialMenuHint({ onDismiss }: RadialMenuHintProps) {
  // Auto-dismiss after AUTO_DISMISS_MS so a user who never engages the
  // FAB doesn't see the chip forever (it would re-appear next session
  // since dismiss writes to localStorage; but at least this one session
  // gets clean once it expires).
  useEffect(() => {
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  return (
    <motion.div
      // Same z-stack as the FAB itself. Anchored so the arrow tip sits
      // a short gap above the FAB's halo (FAB bottom = safe-area + 24,
      // FAB diameter 60 + halo 14 pad ≈ 88 overall; chip bottom offset
      // below lands the arrow tip ~12px above the halo).
      className="fixed left-1/2 z-[61] md:hidden -translate-x-1/2 select-none"
      style={{
        bottom:
          "calc(max(24px, calc(env(safe-area-inset-bottom) + 24px)) + 104px)",
      }}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      role="status"
      aria-live="polite"
    >
      <div
        className="relative flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] px-4 py-2"
        style={{
          // Layered gradient + glass, matching the FAB body so the two
          // feel like part of the same material system.
          background:
            "linear-gradient(152deg, color-mix(in srgb, white 22%, var(--color-panel-strong)) 0%, var(--color-panel-strong) 60%, var(--color-panel) 100%)",
          backdropFilter: "blur(10px) saturate(1.08)",
          WebkitBackdropFilter: "blur(10px) saturate(1.08)",
          boxShadow:
            "0 12px 28px rgba(35, 26, 18, 0.18), 0 2px 6px rgba(35, 26, 18, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.45)",
        }}
      >
        {/* Leading long-press glyph — a small filled dot with an arc
            around it suggests "press and hold". */}
        <svg
          width="14"
          height="14"
          viewBox="-7 -7 14 14"
          aria-hidden="true"
          style={{ color: "var(--color-accent)", flexShrink: 0 }}
        >
          <circle cx="0" cy="0" r="2.2" fill="currentColor" />
          <path
            d="M 4.6 -2.2 A 5 5 0 0 1 4.6 2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M -4.6 -2.2 A 5 5 0 0 0 -4.6 2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>

        <span className="text-sm leading-none text-[var(--color-ink)]">
          <span className="font-semibold" style={{ letterSpacing: "0.02em" }}>
            长按
          </span>
          <span className="mx-1 text-[var(--color-ink-soft)]">·</span>
          <span className="text-[var(--color-ink-soft)]">拖向目标</span>
        </span>

        <button
          type="button"
          aria-label="关闭提示"
          onClick={onDismiss}
          className="-mr-1 ml-1 flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-border)] transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 3 L9 9 M9 3 L3 9" />
          </svg>
        </button>
      </div>

      {/* Down-pointing arrow that visually connects the chip to the FAB.
          Framer-motion's `animate` with an array produces a slow drift
          so the arrow gently "nudges" toward the button — the global
          <MotionConfig reducedMotion="user"> collapses the loop to a
          single frame when the user prefers reduced motion. */}
      <motion.div
        className="mx-auto h-0 w-0"
        style={{
          marginTop: -1,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid var(--color-panel-strong)",
          filter: "drop-shadow(0 1px 1px rgba(35, 26, 18, 0.12))",
        }}
        animate={{ y: [0, 3, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />
    </motion.div>
  );
}
