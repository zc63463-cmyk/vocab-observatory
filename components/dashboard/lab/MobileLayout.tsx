"use client";

import { useState } from "react";
import { InstrumentCluster } from "./InstrumentCluster";
import { PasswordPatternLock } from "./PasswordPatternLock";
import { PatternLegend } from "./PatternLegend";
import { ForecastCalendarBody } from "./bodies/ForecastCalendarBody";
import { MasteryNetworkBody } from "./bodies/MasteryNetworkBody";
import type { SectionId } from "./sections";
import type { DashboardSummary } from "./types";

/**
 * Mobile-specific layout for the lab dashboard.
 *
 * Vertical composition (top → bottom):
 *   1. InstrumentCluster (compact, 2×2) — four live gauges as the hero.
 *      This supersedes the earlier `TodayBriefing` prose hero — the
 *      gauges already carry the numeric story, and the phone's vertical
 *      budget doesn't leave room for both.
 *   2. Featured 1 — Mastery Network (full-bleed card)
 *   3. Featured 2 — Forecast Calendar (compact 14-day, full-bleed)
 *   4. PatternLock — gesture surface (every other section unlocks here)
 *   5. PatternLegend — collapsible discoverability fallback
 *
 * Hidden on `md` and above via `md:hidden` so the desktop layout takes
 * over without runtime media-query JS.
 */
export interface MobileLayoutProps {
  summary: DashboardSummary;
  onOpenSection: (id: SectionId) => void;
}

export function MobileLayout({ summary, onOpenSection }: MobileLayoutProps) {
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="space-y-5 md:hidden">
      {/* 1. Hero: compact 2×2 instrument cluster (gauges are clickable
            drill-downs on mobile too — each one opens its paired modal). */}
      <InstrumentCluster
        summary={summary}
        onOpenSection={onOpenSection}
        variant="compact"
      />

      {/* 2. Featured: Mastery Network — rendered directly because the
            heatmap already brings its own `panel` chrome + header. Wrapping
            in FeatureCard would create double-padding and duplicate titles. */}
      <MasteryNetworkBody summary={summary} />

      {/* 3. Featured: Forecast Calendar — body is chromeless so we wrap it
            in FeatureCard to provide a coherent surface and the
            "expand to modal" affordance. */}
      <FeatureCard
        eyebrow="Forecast Calendar · 14d"
        title="复习预测日历"
        subtitle="未来两周每日到期量"
        onExpand={() => onOpenSection("forecast-calendar")}
      >
        <ForecastCalendarBody summary={summary} variant="compact" />
      </FeatureCard>

      {/* 4. Pattern lock + legend */}
      <section className="panel rounded-[2rem] p-6">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
            Pattern Unlock
          </p>
          <h2 className="section-title mt-2 text-2xl font-semibold text-[var(--color-ink)]">
            解锁更多视图
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            画一个图案打开对应模块。9 个 dot · 12 种基础图案，从 L、对角到三横三竖。
          </p>
        </header>

        <div className="mt-6">
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
    </div>
  );
}

/**
 * Featured card wrapper for mobile-only always-visible sections.
 *
 * Renders the body inline (so users don't need to tap to see it) but
 * still exposes an "expand to modal" affordance for users who want a
 * larger surface or to copy data.
 */
function FeatureCard({
  eyebrow,
  title,
  subtitle,
  onExpand,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-[2rem] p-5 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
            {eyebrow}
          </p>
          <h2 className="section-title mt-1.5 text-xl font-semibold text-[var(--color-ink)]">
            {title}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)] opacity-80">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="flex-shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          aria-label={`展开 ${title}`}
        >
          展开 ↗
        </button>
      </header>
      {children}
    </section>
  );
}
