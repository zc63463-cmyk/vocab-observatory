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
 * Desktop layout — three-stage Console aesthetic (Phase 4.1).
 *
 * **Composition rationale.**
 * Earlier iterations of this layout inlined every dashboard body as a
 * SectionPanel, producing ~9 vertical bento rows that re-stated data
 * already surfaced by the gauges and reachable through the gesture
 * lock. Phase 4 trims the inline surface down to three living
 * "stages" plus a flat directory at the bottom:
 *
 *   1. **Instrument Cluster** — 4 circular gauges with sparklines.
 *      Numeric truth at a glance. Each gauge is itself a drill-down
 *      button into its semantically-paired section modal.
 *   2. **Observation Deck** — a named two-column "scene" that
 *      juxtaposes *entry* (left, `1fr`) and *map* (right, `2fr`):
 *        - Left pane: **快速入口（手势）** — the 9-dot gesture lock
 *          that powers the mobile core interaction, here kept
 *          available as a shortcut affordance. Drawing a pattern
 *          jumps to its section modal; the legend below offers a
 *          clickable cheat-sheet.
 *        - Right pane: **词汇网络图** — the Mastery Network graph,
 *          the only featured (always-on) data visualization.
 *          Spatial map of what you know vs what's slipping.
 *      Pairing them gives the row a "you-are-here" character:
 *      the map on the right shows where you stand, the shortcuts on
 *      the left let you dive into any diagnostic view without
 *      scrolling.
 *   3. **Section Directory** — a flat sitemap of all 12 patterned
 *      sections styled like a secondary instrument console. Each
 *      card is a button (no inline data) so the visual cost is
 *      roughly one row, and together with the gauges + gesture lock
 *      guarantees 100 % modal discoverability for keyboard- and
 *      click-only users.
 *
 * **What was removed in Phase 4.**
 *   - 9 SectionPanel rows (review-load, import-run, review-7d,
 *     rating-mix, retention-gap, plan-vs-actual, preset-forecast,
 *     review-30d, recent-reviews, recent-notes, fsrs-training) — all
 *     reachable via gauge or pattern.
 *   - Forecast Calendar half-pane (still reachable via DUE TODAY
 *     gauge drill-down).
 *   - `TodayNarrative` panel (its unique copy folded into
 *     `TodaySnapshotBody`, reached via the diagonal pattern).
 *
 * **Phase 4.1 revision.**
 * Observation Deck switched from "Mastery solo, Pattern Lock below as
 * a separate stage" to the current 1fr/2fr paired row. The
 * gesture-lock panel also got renamed from "手势密码锁 / Pattern
 * Unlock · Playground" (which over-emphasised its mobile-toy aspect)
 * to "快速入口（手势）/ Quick Access · 手势" to reflect that on
 * desktop it is primarily a shortcut surface.
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

      {/* ── Stage 2: Observation Deck (paired row) ─────────────────────
            Left (1fr) = 快速入口（手势）; right (2fr) = 词汇网络图.
            Both panels use matching `rounded-[1.75rem] p-6` chrome so
            their edges align visually — MasteryHeatmap renders its own
            outer `panel` with those same tokens when `chromeless=false`
            (see bodies/MasteryNetworkBody.tsx). */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
            Observation Deck
          </p>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-ink-soft)] opacity-60">
            快速入口 · 记忆拓扑
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          {/* Left pane: gesture shortcut affordance. */}
          <section className="panel relative rounded-[1.75rem] p-6">
            <header>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
                Quick Access · 手势
              </p>
              <h2 className="section-title mt-2 text-xl font-semibold text-[var(--color-ink)]">
                快速入口（手势）
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                画图案或点击下方图例直接进入 section。
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

          {/* Right pane: Mastery Network. The heatmap brings its own
              panel chrome so it slots into the grid cell directly
              without an extra wrapper. */}
          <MasteryNetworkBody summary={summary} />
        </div>
      </div>

      {/* ── Stage 3: Directory bento (clickable section sitemap) ────── */}
      <SectionDirectory onOpenSection={onOpenSection} />
    </div>
  );
}
