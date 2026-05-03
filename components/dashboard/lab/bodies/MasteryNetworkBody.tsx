"use client";

import { MasteryGlobe } from "@/components/review/MasteryGlobe";
import type { DashboardSummary } from "../types";

interface MasteryNetworkBodyProps {
  summary: Pick<DashboardSummary, "masteryCells" | "relationGraph">;
  /**
   * Forward to MasteryGlobe to suppress its built-in panel chrome.
   * Set to `true` when this body is rendered inside `SectionModal` —
   * the modal already provides panel styling and a header, so leaving
   * the globe's chrome on produces a distracting double-card nest.
   */
  chromeless?: boolean;
}

/**
 * Pure body wrapper around the `MasteryGlobe` WebGL component.
 *
 * Three call sites, three contexts:
 *   - `MobileLayout` hero featured card → chromeless=false (the globe
 *     brings its own panel so the vertical rhythm stays consistent
 *     with sibling mobile cards).
 *   - `DesktopLayout` Observation Deck (Phase 4) → chromeless=false.
 *     The Phase 4 desktop layout removed the wrapping SectionPanel and
 *     renders this body directly, so the globe supplies its own
 *     panel chrome. Only an external eyebrow ("Observation Deck") is
 *     printed above it.
 *   - `SectionModal` drill-down → chromeless=true (modal already has
 *     panel-strong chrome; nesting would produce double-card visuals).
 */
export function MasteryNetworkBody({
  summary,
  chromeless = false,
}: MasteryNetworkBodyProps) {
  if (summary.masteryCells.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        还没有词条进入复习队列。开始复习后这里会出现你的词汇网络图。
      </p>
    );
  }

  return (
    <MasteryGlobe
      cells={summary.masteryCells}
      relationGraph={summary.relationGraph}
      chromeless={chromeless}
    />
  );
}
