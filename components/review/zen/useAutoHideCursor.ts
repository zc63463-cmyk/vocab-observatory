"use client";

import { useEffect, useCallback, useRef } from "react";

interface UseAutoHideCursorOptions {
  enabled: boolean;
  delay?: number;
}

export function useAutoHideCursor({ enabled, delay = 2000 }: UseAutoHideCursorOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHiddenRef = useRef(false);

  const showCursor = useCallback(() => {
    if (isHiddenRef.current) {
      document.body.style.cursor = "";
      isHiddenRef.current = false;
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const hideCursor = useCallback(() => {
    if (!isHiddenRef.current && enabled) {
      document.body.style.cursor = "none";
      isHiddenRef.current = true;
    }
  }, [enabled]);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    
    showCursor();
    
    timeoutRef.current = setTimeout(() => {
      hideCursor();
    }, delay);
  }, [enabled, delay, showCursor, hideCursor]);

  useEffect(() => {
    if (!enabled) {
      showCursor();
      return;
    }

    // Events that should show cursor and reset timer
    const events = ["mousemove", "mousedown", "keydown", "touchstart"];
    
    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Initial timer
    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      showCursor();
    };
  }, [enabled, resetTimer, showCursor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      showCursor();
    };
  }, [showCursor]);
}
