"use client";

import { useEffect } from "react";
import { useOmniStore } from "./useOmniStore";

export function useOmniHotkeys() {
  const { isOpen, toggle, close } = useOmniStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+K / Cmd+K → toggle
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
