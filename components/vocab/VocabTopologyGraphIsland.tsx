"use client";

import dynamic from "next/dynamic";
import type { VocabTopologyGraphProps } from "@/components/vocab/VocabTopologyGraph";

const VocabTopologyGraph = dynamic(
  () => import("@/components/vocab/VocabTopologyGraph"),
  {
    loading: () => (
      <section className="vocab-topology panel rounded-[1.75rem] p-6">
        <div className="h-[320px] animate-pulse rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] md:h-[520px]" />
      </section>
    ),
    ssr: false,
  },
);

export function VocabTopologyGraphIsland(props: VocabTopologyGraphProps) {
  return <VocabTopologyGraph {...props} />;
}
