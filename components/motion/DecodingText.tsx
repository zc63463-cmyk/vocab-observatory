"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface DecodingTextProps {
  /** The final text to reveal */
  text: string;
  /** Additional class name */
  className?: string;
  /** Duration of the decode animation in ms (default 1200) */
  duration?: number;
  /** Delay before animation starts in ms (default 200) */
  delay?: number;
  /** Characters used for the scramble phase */
  scrambleChars?: string;
}

const DEFAULT_SCRAMBLE_CHARS = "█▓▒░╬╫╪╗╖╔╚╝║═╠╣";

/**
 * Decodes text from a scrambled state to the final readable text,
 * creating a "decryption" / "archaeological discovery" effect.
 * Perfect for etymology / prototype text sections.
 *
 * GPU-friendly: only swaps text content, no layout shifts.
 * Respects prefers-reduced-motion.
 */
export function DecodingText({
  text,
  className,
  duration = 1200,
  delay = 200,
  scrambleChars = DEFAULT_SCRAMBLE_CHARS,
}: DecodingTextProps) {
  const prefersReduced = useReducedMotion();
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (prefersReduced) {
      return;
    }

    const timeout = setTimeout(() => {
      startTimeRef.current = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // Eased progress — slow start, fast finish
        const eased = 1 - Math.pow(1 - progress, 3);

        const charsToReveal = Math.floor(eased * text.length);
        const result = text
          .split("")
          .map((char, index) => {
            if (index < charsToReveal) return char;
            if (char === " ") return " ";
            return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          })
          .join("");

        setDisplayed(result);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayed(text);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [text, duration, delay, scrambleChars, prefersReduced]);

  return (
    <span className={className} aria-label={text}>
      {prefersReduced ? text : displayed}
    </span>
  );
}
