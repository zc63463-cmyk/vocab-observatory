"use client";

import { useEffect, useCallback } from "react";
import type { ZenPhase, RatingKey } from "./types";

interface UseZenShortcutsOptions {
  phase: ZenPhase;
  onReveal: () => void;
  onRate: (rating: RatingKey) => void;
  onExit: () => void;
  onSkip: () => void;
  isOmniOpen: boolean;
  isAnimating: boolean;
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
  onSkip,
  isOmniOpen,
  isAnimating,
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

      // Handle Escape (always works)
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }

      // Don't process other keys during animation lock or when done/error
      if (isAnimating || phase === "rating" || phase === "done" || phase === "error" || phase === "loading") {
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

      // Skip: S key
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSkip();
        return;
      }

      if (rating) {
        e.preventDefault();
        onRate(rating);
      }
    },
    [phase, onReveal, onRate, onExit, onSkip, isOmniOpen, isAnimating]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
