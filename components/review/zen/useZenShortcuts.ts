"use client";

import { useEffect, useCallback } from "react";
import type { ZenPhase, RatingKey } from "./types";

interface UseZenShortcutsOptions {
  phase: ZenPhase;
  onReveal: () => void;
  onRate: (rating: RatingKey) => void;
  onExit: () => void;
  onToggleHistory: () => void;
  onOpenWordPage: () => void;
  onSpeak: () => void;
  onNextBatch: () => void;
  isOmniOpen: boolean;
  isAnimating: boolean;
  isHistoryOpen: boolean;
}

function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  
  const tag = target.tagName.toLowerCase();
  const isContentEditable = target.getAttribute("contenteditable") === "true";
  
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "button" ||
    isContentEditable
  );
}

export function useZenShortcuts({
  phase,
  onReveal,
  onRate,
  onExit,
  onToggleHistory,
  onOpenWordPage,
  onSpeak,
  onNextBatch,
  isOmniOpen,
  isAnimating,
  isHistoryOpen,
}: UseZenShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger if an input element is focused
      if (isInputElement(e.target)) {
        return;
      }

      // Don't trigger if Omni-Search is open
      if (isOmniOpen) {
        return;
      }

      // Ignore repeat (long press)
      if (e.repeat) {
        return;
      }

      // Ignore with modifiers (except for Cmd/Ctrl+K which is handled by Omni)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Handle Escape with priority: close drawer first, then exit
      if (e.key === "Escape") {
        e.preventDefault();
        if (isHistoryOpen) {
          onToggleHistory();
        } else {
          onExit();
        }
        return;
      }

      // H: toggle history drawer (works in any non-loading phase)
      if (e.key === "h" || e.key === "H") {
        // Allow H during done state too, but not during loading/error
        if (phase === "loading" || phase === "error") return;
        e.preventDefault();
        onToggleHistory();
        return;
      }

      // When drawer is open, disable all other shortcuts (Space, rating keys)
      // to prevent accidental interaction with the main card.
      if (isHistoryOpen) {
        return;
      }

      // Phase 0.1 Session Summary: Enter at done phase returns to /review.
      // No rating / Space at done; only Enter, Esc (handled above), and N are active.
      if (phase === "done") {
        if (e.key === "Enter") {
          e.preventDefault();
          onExit();
          return;
        }
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          onNextBatch();
          return;
        }
        return;
      }

      // D: Open word page in new tab (only from back phase)
      if (e.key === "d" || e.key === "D") {
        if (phase !== "back") return;
        e.preventDefault();
        onOpenWordPage();
        return;
      }

      // P: Speak current lemma (front or back phase)
      if (e.key === "p" || e.key === "P") {
        if (phase !== "front" && phase !== "back") return;
        e.preventDefault();
        onSpeak();
        return;
      }

      // Don't process other keys during animation lock or when error/loading
      if (isAnimating || phase === "rating" || phase === "error" || phase === "loading") {
        return;
      }

      // Space: Reveal answer (only from front phase)
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "front") {
          onReveal();
        }
        return;
      }

      // Handle rating keys (only from back phase)
      if (phase !== "back") {
        return;
      }

      let rating: RatingKey | null = null;

      // Number keys 1-4
      switch (e.key) {
        case "1":
          rating = "again";
          break;
        case "2":
          rating = "hard";
          break;
        case "3":
          rating = "good";
          break;
        case "4":
          rating = "easy";
          break;
      }

      // Vim-style keys
      switch (e.key.toLowerCase()) {
        case "j":
          rating = "again";
          break;
        case "k":
          rating = "hard";
          break;
        case "l":
          rating = "good";
          break;
      }

      // Semicolon key (use code for reliability across layouts)
      if (e.code === "Semicolon" || e.key === ";" || e.key === ":") {
        rating = "easy";
      }

      if (rating) {
        e.preventDefault();
        onRate(rating);
      }
    },
    [phase, onReveal, onRate, onExit, onToggleHistory, onOpenWordPage, onSpeak, onNextBatch, isOmniOpen, isAnimating, isHistoryOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
