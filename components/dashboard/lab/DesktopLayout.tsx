"use client";

import { useState } from "react";
import { InstrumentCluster } from "./InstrumentCluster";
import { TodayNarrative } from "./TodayNarrative";
import { PasswordPatternLock } from "./PasswordPatternLock";
import { PatternLegend } from "./PatternLegend";
import { ForecastCalendarBody } from "./bodies/ForecastCalendarBody";
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
import { FsrsTrainingBody } from "./bodies/FsrsTrainingBody";
import { SECTION_META, type SectionId } from "./sections";
import type { DashboardSummary } from "./types";

/**
 * Desktop layout — Console / instrument-cluster aesthetic (Phase 3).
 *
 * Composition (top → bottom):
 *   1. **Instrument Cluster** — 4 circular gauges (Streak / Due / Target / FSRS Gap)
 *      provide the live numeric anchor for the page.
 *   2. **Pattern Lock + Today's Narrative** — interaction playground on
 *      the left, editorial prose interpretation on the right.
 *      The gauges show the *what*; this row shows the *meaning*.
 *   3. **Body Bento** — every other section inline as a panel, so power
 *      users can scan-read everything without opening modals.
 *
 * Hidden below `md` so the mobile layout (`MobileLayout.tsx`) handles
 * narrow widths exclusively.
 */
export interface DesktopLayoutProps {
  summary: DashboardSummary;
  onOpenSection: (id: SectionId) => void;
}

export function DesktopLayout({ summary, onOpenSection }: DesktopLayoutProps) {
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="hidden space-y-6 md:block">
      {/* ── Console hero band (4 circular gauges, clickable) ──────────── */}
      <InstrumentCluster summary={summary} onOpenSection={onOpenSection} />

      {/* ── Interaction + narrative band ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="panel relative rounded-[2rem] p-6">
          <header>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
              Pattern Unlock · Playground
            </p>
            <h2 className="section-title mt-2 text-xl font-semibold text-[var(--color-ink)]">
              手势密码锁
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              移动端的核心交互 — 在桌面端也可玩玩。
            </p>
          </header>
          <div className="mt-4">
            <PasswordPatternLock onUnlock={onOpenSection} />
          </div>
          <PatternLegend
            open={legendOpen}
            onToggle={() => setLegendOpen((v) => !v)}
            onSelect={(id) => {
              setLegendOpen(false);
              onOpenSection(id);
            }}
          />
        </section>

        <TodayNarrative summary={summary} />
      </div>

      {/* ── Row: Review Load (2/3) + Import Run (1/3) ─────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionPanel id="review-load" onExpand={() => onOpenSection("review-load")}>
          <ReviewLoadBody summary={summary} />
        </SectionPanel>
        <SectionPanel id="import-run" onExpand={() => onOpenSection("import-run")}>
          <ImportRunBody summary={summary} />
        </SectionPanel>
      </div>

      {/* ── Observation Deck — Mastery Network + Forecast Calendar ───────
            A named dual-pane "scene" that juxtaposes two complementary
            views: *spatial* (mastery graph = the landscape of what you
            know) and *temporal* (forecast = when that landscape will
            demand attention).

            Breakpoints: stacked below lg; 2-col at lg+ (≥ 1024px), where
            each half is ~500px — wide enough for the heatmap SVG to
            remain legible and for the calendar's compact 2×7 grid to
            give generous per-cell space. */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
            Observation Deck
          </p>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-ink-soft)] opacity-60">
            双视图并排 · 空间 + 时间
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionPanel
            id="mastery-network"
            onExpand={() => onOpenSection("mastery-network")}
          >
            {/* chromeless: SectionPanel already provides panel chrome
                and header — don't double-nest. */}
            <MasteryNetworkBody summary={summary} chromeless />
          </SectionPanel>
          <SectionPanel
            id="forecast-calendar"
            onExpand={() => onOpenSection("forecast-calendar")}
          >
            {/* compact: 2×7 grid instead of 1×14, fits a half-column
                at lg without cells getting squeezed. */}
            <ForecastCalendarBody summary={summary} variant="compact" />
          </SectionPanel>
        </div>
      </div>

      {/* ── 3-col bento: 7d / Rating / Retention Gap ─────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionPanel id="review-7d" onExpand={() => onOpenSection("review-7d")}>
          <ReviewVolumeBody summary={summary} range="7d" />
        </SectionPanel>
        <SectionPanel id="rating-mix" onExpand={() => onOpenSection("rating-mix")}>
          <RatingMixBody summary={summary} />
        </SectionPanel>
        <SectionPanel id="retention-gap" onExpand={() => onOpenSection("retention-gap")}>
          <RetentionGapBody summary={summary} />
        </SectionPanel>
      </div>

      {/* ── 2-col: Plan vs Actual + Preset Forecast ──────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionPanel id="plan-vs-actual" onExpand={() => onOpenSection("plan-vs-actual")}>
          <PlanVsActualBody summary={summary} />
        </SectionPanel>
        <SectionPanel id="preset-forecast" onExpand={() => onOpenSection("preset-forecast")}>
          <PresetForecastBody summary={summary} />
        </SectionPanel>
      </div>

      {/* ── 3-col: 30d / Recent reviews / Recent notes ───────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionPanel id="review-30d" onExpand={() => onOpenSection("review-30d")}>
          <ReviewVolumeBody summary={summary} range="30d" />
        </SectionPanel>
        <SectionPanel id="recent-reviews" onExpand={() => onOpenSection("recent-reviews")}>
          <RecentReviewsBody summary={summary} />
        </SectionPanel>
        <SectionPanel id="recent-notes" onExpand={() => onOpenSection("recent-notes")}>
          <RecentNotesBody summary={summary} />
        </SectionPanel>
      </div>

      {/* ── FSRS Training (full width) ───────────────────────────────── */}
      <SectionPanel id="fsrs-training" onExpand={() => onOpenSection("fsrs-training")}>
        <FsrsTrainingBody summary={summary} />
      </SectionPanel>
    </div>
  );
}

/**
 * Standard panel chrome for desktop bento entries.
 *
 * Renders the section's eyebrow + title + subtitle from `SECTION_META`,
 * with an "expand ↗" affordance that opens the full modal. Body content
 * is shown inline (no double-tap to reveal) — modal is only for users
 * who want a larger surface.
 */
function SectionPanel({
  id,
  onExpand,
  children,
}: {
  id: SectionId;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  const meta = SECTION_META[id];
  return (
    <section className="panel rounded-[1.75rem] p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
            {meta.eyebrow}
          </p>
          <h2 className="section-title mt-1.5 text-xl font-semibold text-[var(--color-ink)]">
            {meta.title}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)] opacity-80">{meta.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="flex-shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
          aria-label={`展开 ${meta.title}`}
        >
          展开 ↗
        </button>
      </header>
      {children}
    </section>
  );
}
