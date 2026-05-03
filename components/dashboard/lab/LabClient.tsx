"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/Badge";
import { DesktopLayout } from "./DesktopLayout";
import { MobileLayout } from "./MobileLayout";
import { SectionModal } from "./SectionModal";
import { ForecastCalendarBody } from "./bodies/ForecastCalendarBody";
import { FsrsTrainingBody } from "./bodies/FsrsTrainingBody";
import { ImportRunBody } from "./bodies/ImportRunBody";
import { MasteryNetworkBody } from "./bodies/MasteryNetworkBody";
import { PlanVsActualBody } from "./bodies/PlanVsActualBody";
import { PresetForecastBody } from "./bodies/PresetForecastBody";
import { RatingMixBody } from "./bodies/RatingMixBody";
import { RecentNotesBody } from "./bodies/RecentNotesBody";
import { RecentReviewsBody } from "./bodies/RecentReviewsBody";
import { RetentionGapBody } from "./bodies/RetentionGapBody";
import { ReviewLoadBody } from "./bodies/ReviewLoadBody";
import { ReviewVolumeBody } from "./bodies/ReviewVolumeBody";
import { TodaySnapshotBody } from "./bodies/TodaySnapshotBody";
import { SECTION_META, SECTION_TO_PATTERN, type SectionId } from "./sections";
import type { DashboardSummary } from "./types";

/**
 * Top-level client orchestrator for the lab dashboard.
 *
 * Owns the single piece of dynamic state — `activeSectionId` — and
 * routes it to the SectionModal. Both layout shells (mobile / desktop)
 * receive a stable `onOpenSection` callback that updates that state.
 *
 * The mobile and desktop layouts are mutually-exclusive via CSS
 * (`md:hidden` / `hidden md:block`) so both can be rendered to the
 * DOM without runtime media-query JS, keeping SSR / hydration clean.
 */
export interface LabClientProps {
  summary: DashboardSummary;
}

export function LabClient({ summary }: LabClientProps) {
  const [activeId, setActiveId] = useState<SectionId | null>(null);

  const open = useCallback((id: SectionId) => setActiveId(id), []);
  const close = useCallback(() => setActiveId(null), []);

  return (
    <>
      <MobileLayout summary={summary} onOpenSection={open} />
      <DesktopLayout summary={summary} onOpenSection={open} />

      <SectionModal
        isOpen={activeId !== null}
        onClose={close}
        eyebrow={activeId ? SECTION_META[activeId].eyebrow : undefined}
        title={activeId ? SECTION_META[activeId].title : undefined}
        subtitle={activeId ? SECTION_META[activeId].subtitle : undefined}
        badge={activeId ? <PatternHint sectionId={activeId} /> : undefined}
      >
        {activeId ? renderBody(activeId, summary) : null}
      </SectionModal>
    </>
  );
}

/**
 * Render the matching body component for a given section id.
 * Each body picks its required slice of `summary` via `Pick`.
 *
 * Centralised here so adding a new section is a 3-step diff:
 *   1. Add to `SectionId` union in `sections.ts`
 *   2. Add metadata in `SECTION_META`
 *   3. Add a case here + create the Body component
 */
function renderBody(id: SectionId, summary: DashboardSummary): React.ReactNode {
  switch (id) {
    case "today-snapshot":
      return <TodaySnapshotBody summary={summary} />;
    case "review-load":
      return <ReviewLoadBody summary={summary} />;
    case "rating-mix":
      return <RatingMixBody summary={summary} />;
    case "review-7d":
      return <ReviewVolumeBody summary={summary} range="7d" />;
    case "review-30d":
      return <ReviewVolumeBody summary={summary} range="30d" />;
    case "retention-gap":
      return <RetentionGapBody summary={summary} />;
    case "plan-vs-actual":
      return <PlanVsActualBody summary={summary} />;
    case "preset-forecast":
      return <PresetForecastBody summary={summary} />;
    case "recent-reviews":
      return <RecentReviewsBody summary={summary} />;
    case "recent-notes":
      return <RecentNotesBody summary={summary} />;
    case "forecast-calendar":
      return <ForecastCalendarBody summary={summary} variant="standard" />;
    case "mastery-network":
      // In the modal render path (this function), SectionModal already
      // wraps us in panel chrome — strip the heatmap's own to avoid
      // double-card nesting.
      return <MasteryNetworkBody summary={summary} chromeless />;
    case "fsrs-training":
      return <FsrsTrainingBody summary={summary} />;
    case "import-run":
      return <ImportRunBody summary={summary} />;
    default: {
      // Exhaustiveness guard — TS will error here if a new SectionId
      // is added without a corresponding case.
      const _exhaustive: never = id;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Tiny badge in the modal header showing the unlock pattern (if any).
 * Featured-only sections (mastery-network, forecast-calendar) have no
 * direct pattern — they're always-visible on mobile and shown inline
 * on desktop, but accessible via legend.
 */
function PatternHint({ sectionId }: { sectionId: SectionId }) {
  const pattern = SECTION_TO_PATTERN.get(sectionId);
  if (!pattern) {
    return <Badge>Featured</Badge>;
  }
  return (
    <Badge>
      {pattern.glyph} {pattern.name}
    </Badge>
  );
}
