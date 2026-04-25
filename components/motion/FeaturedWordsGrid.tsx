"use client";

import { StaggerContainer, StaggerItem } from "@/components/motion/MotionWrapper";
import { WordCard } from "@/components/words/WordCard";
import type { PublicWordSummary } from "@/lib/words";

/**
 * Client component wrapper for the featured words grid on the homepage.
 * Adds staggered fade+slide-up animation to each WordCard.
 * Separated so the homepage stays a server component.
 */
export function FeaturedWordsGrid({
  words,
}: {
  words: PublicWordSummary[];
}) {
  return (
    <StaggerContainer className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" stagger={0.08}>
      {words.map((word) => (
        <StaggerItem key={word.id}>
          <WordCard word={word} />
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
