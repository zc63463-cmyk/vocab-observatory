"use client";

import { PATTERNS, SECTION_META, type SectionId } from "./sections";

/**
 * SectionDirectory — bento-style index of every patterned dashboard
 * section.
 *
 * **Why this exists.**
 * The desktop layout deliberately exposes only three living surfaces
 * inline: the InstrumentCluster, the Mastery Network, and the Pattern
 * Unlock playground. Every other section is reachable via either a
 * gauge drill-down (4 routes) or by drawing the matching gesture on
 * the lock (12 routes). For first-time visitors and keyboard users
 * those affordances are not enough on their own, so this directory
 * provides an explicit clickable index of all 12 patterned sections —
 * effectively a flattened sitemap.
 *
 * **Card anatomy.**
 *   - eyebrow: lowercase tracking-wide editorial label
 *   - title:   bold Chinese section name
 *   - glyph:   pattern shape (e.g. `┗`) rendered as a faint watermark
 *              in the upper-right; reinforces the gesture↔section
 *              association so users gradually internalise the lock
 *              shortcuts.
 *
 * Iteration order follows {@link PATTERNS}, which already groups by
 * tier (4 L-rotations → 2 diagonals → 6 lines). At `xl` breakpoints
 * this lays out as a clean 2×6 grid; at narrower widths it collapses
 * to 3 cols (4 rows) and finally 2 cols (6 rows).
 *
 * **Why not include `mastery-network` and `forecast-calendar`?**
 *   - `mastery-network` is the always-on featured surface and lives
 *     directly above this directory; listing it again would be
 *     redundant.
 *   - `forecast-calendar` has no gesture pattern (it's a gauge-only
 *     drill-down from the DUE TODAY gauge); including it here would
 *     leave a card with no glyph and break the visual rhythm.
 */
export interface SectionDirectoryProps {
  onOpenSection: (id: SectionId) => void;
}

export function SectionDirectory({ onOpenSection }: SectionDirectoryProps) {
  return (
    <section className="panel rounded-[1.75rem] p-6">
      <header className="mb-5 flex items-baseline justify-between gap-3 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
          Directory
        </p>
        <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-ink-soft)] opacity-60">
          12 section · 点击或绘制图案进入
        </p>
      </header>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {PATTERNS.map((pattern) => {
          const meta = SECTION_META[pattern.sectionId];
          return (
            <li key={pattern.key}>
              <button
                type="button"
                onClick={() => onOpenSection(pattern.sectionId)}
                className="group relative flex h-full w-full flex-col items-start gap-1.5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-panel)]"
                aria-label={`打开 ${meta.title}（手势：${pattern.name}）`}
              >
                {/* Watermark glyph in upper-right. Decorative; the
                    accessible name above already mentions the gesture
                    name. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 top-1.5 select-none font-mono text-[28px] leading-none text-[var(--color-ink-soft)] opacity-15 transition-opacity duration-300 group-hover:opacity-30"
                >
                  {pattern.glyph}
                </span>
                <p className="relative line-clamp-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                  {meta.eyebrow}
                </p>
                <p className="section-title relative line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--color-ink)]">
                  {meta.title}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
