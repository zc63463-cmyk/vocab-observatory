"use client";

import { useState } from "react";
import { InstrumentCluster } from "./InstrumentCluster";
import { PasswordPatternLock } from "./PasswordPatternLock";
import { PatternLegend } from "./PatternLegend";
import { SectionDirectory } from "./SectionDirectory";
import { MasteryNetworkBody } from "./bodies/MasteryNetworkBody";
import { type SectionId } from "./sections";
import type { DashboardSummary } from "./types";

/**
 * Desktop layout — three-stage Console aesthetic (Phase 4).
 *
 * **Composition rationale.**
 * Earlier iterations of this layout inlined every dashboard body as a
 * SectionPanel, producing ~9 vertical bento rows that re-stated data
 * already surfaced by the gauges and reachable through the gesture
 * lock. Phase 4 trims the inline surface down to three living
 * "stages", each chosen to be the most-information-dense expression of
 * its concern:
 *
 *   1. **Instrument Cluster** — 4 circular gauges with sparklines.
 *      Numeric truth at a glance. Each gauge is itself a drill-down
 *      button into its semantically-paired section modal.
 *   2. **Mastery Network** — the only featured (always-on) data
 *      visualization. Spatial map of what you know vs what's
 *      slipping. Has no gesture pattern by design — it's the
 *      "homepage" of the dashboard.
 *   3. **Pattern Unlock Playground** — the same 9-dot gesture lock
 *      that powers the mobile core interaction, here promoted to a
 *      first-class desktop affordance. Drawing a pattern jumps to
 *      its section modal; the legend below offers a clickable
 *      cheat-sheet for users who haven't memorised the shapes.
 *
 * Below those three, **`SectionDirectory`** acts as a flat sitemap of
 * all 12 patterned sections. It guarantees keyboard- and click-only
 * users can reach every modal without having to draw gestures or
 * remember which gauge maps to which section. Each card is a button
 * (no inline data), so the visual cost is roughly one row.
 *
 * **What was removed.**
 *   - 9 SectionPanel rows (review-load, import-run, review-7d,
 *     rating-mix, retention-gap, plan-vs-actual, preset-forecast,
 *     review-30d, recent-reviews, recent-notes, fsrs-training) — all
 *     reachable via gauge or pattern.
 *   - Forecast Calendar half-pane (still reachable via DUE TODAY
 *     gauge drill-down).
 *   - `TodayNarrative` panel (its unique copy folded into
 *     `TodaySnapshotBody`, reached via the diagonal pattern).
 *
 * Hidden below `md` so the mobile layout handles narrow widths
 * exclusively. Note `LabClient` mounts both layouts simultaneously and
 * relies on CSS visibility — see `MasteryHeatmap.tsx` for the
 * width-0 gate that prevents the hidden copy from running its d3
 * simulation.
 */
export interface DesktopLayoutProps {
  summary: DashboardSummary;
  onOpenSection: (id: SectionId) => void;
}

export function DesktopLayout({ summary, onOpenSection }: DesktopLayoutProps) {
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="hidden space-y-6 md:block">
      {/* ── Stage 1: Instrument Cluster ───────────────────────────────── */}
      <InstrumentCluster summary={summary} onOpenSection={onOpenSection} />

      {/* ── Stage 2: Mastery Network (featured, full-width) ────────────
            The heatmap brings its own panel chrome (`chromeless={false}`
            here — note the prop default), so we render it directly with
            an Observation Deck eyebrow above instead of wrapping in a
            redundant SectionPanel. */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
            Observation Deck
          </p>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-ink-soft)] opacity-60">
            记忆概率分布 · 词根关联
          </p>
        </div>
        <MasteryNetworkBody summary={summary} />
      </div>

      {/* ── Stage 3: Pattern Unlock Playground ─────────────────────────
            Promoted from "small left-column experiment" to a featured
            full-width stage. The lock SVG centers itself; on very wide
            viewports the panel still feels balanced because the
            PatternLegend below acts as a wide secondary block. */}
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

      {/* ── Footer: Directory bento (clickable section sitemap) ─────── */}
      <SectionDirectory onOpenSection={onOpenSection} />
    </div>
  );
}
