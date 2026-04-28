"use client";

import { useEffect } from "react";
import { useOmniStore } from "./useOmniStore";

export function useOmniHotkeys() {
  const { isOpen, toggle, close } = useOmniStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore keys during IME composition
      if ((e as any).isComposing) return;

      // Ctrl+K / Cmd+K → toggle (case-insensitive)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
        return;
      }

      // Escape → close (only when palette is open)
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, toggle, close]);
}
