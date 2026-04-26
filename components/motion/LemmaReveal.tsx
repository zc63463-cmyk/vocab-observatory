"use client";

import { SplitText } from "@/components/motion/SplitText";

interface LemmaRevealProps {
  lemma: string;
}

/**
 * Client-side shell that wraps the lemma (word title) in a SplitText
 * animation. Separated so WordHeader can remain a server component.
 */
export function LemmaReveal({ lemma }: LemmaRevealProps) {
  return (
    <SplitText
      text={lemma}
      className="section-title text-5xl font-semibold"
      staggerDelay={0.035}
    />
  );
}
