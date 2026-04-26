"use client";

import { DecodingText } from "@/components/motion/DecodingText";

interface PrototypeRevealProps {
  text: string;
}

/**
 * Client-side shell for the 原型义 (prototype/etymology) section.
 * Uses DecodingText to create a "decrypt the etymology" reveal effect.
 */
export function PrototypeReveal({ text }: PrototypeRevealProps) {
  return (
    <section className="panel rounded-[1.75rem] p-6">
      <h2 className="section-title text-2xl font-semibold">原型义</h2>
      <p className="mt-4 text-base leading-8 text-[var(--color-ink-soft)]">
        <DecodingText text={text} duration={1400} delay={400} />
      </p>
    </section>
  );
}
