"use client";

import { CircularGauge } from "./CircularGauge";
import type { SectionId } from "./sections";
import type { DashboardSummary } from "./types";

/**
 * InstrumentCluster — top-of-Console hero band.
 *
 * Four primary gauges in a row:
 *   1. **Streak** (linear, 30-day reference scale) — habit health
 *   2. **Due Today** (linear, contextual scale) — current workload
 *   3. **Target Retention** (linear, 0-100 %) — calibration target
 *   4. **FSRS Calibration Gap** (bidirectional, ±5pp) — drift indicator
 *
 * Each gauge is also a **drill-down button** when `onOpenSection` is
 * provided: clicking it opens the matching modal (mapping is hard-coded
 * inside this file because the relationship between a gauge and its
 * source section is editorial, not mechanical).
 *
 * Naming convention is deliberately analogue-instrument-flavoured to
 * lean into the "Vocab Observatory" framing. Background ambient
 * gradients give the whole panel a subtle "scanned glass" feel.
 *
 * Responsive: 2-col grid below `md`, 4-col grid at `md` and above. The
 * 4-col threshold was chosen because the gauge needs ~140px width plus
 * grid gap, and ~600px container width is when 4-up starts feeling
 * coherent rather than cramped.
 */
export interface InstrumentClusterProps {
  summary: Pick<
    DashboardSummary,
    | "metrics"
    | "configuredDesiredRetention"
    | "fsrsCalibrationGap30d"
    | "reviewVolume7d"
    | "dailyForecast"
    | "retentionGapSeries14d"
  >;
  /**
   * Optional drill-down handler. When provided, every gauge becomes a
   * clickable button mapped to its semantically-paired modal section.
   */
  onOpenSection?: (id: SectionId) => void;
  /**
   * Optional size variant. `compact` yields tighter padding and smaller
   * eyebrow/heading, used when the cluster sits inside the mobile hero
   * where vertical space is scarce.
   */
  variant?: "default" | "compact";
}

/* Anchor mental scales — chosen so common readings land mid-gauge,
   leaving visual room above for "good day" and below for "easy day". */
const STREAK_REFERENCE = 30; // 30-day habit horizon
const DUE_REFERENCE = 50; // typical heavy-load ceiling
const FSRS_GAP_REFERENCE = 0.05; // ±5 pp = noticeable drift

/* English month abbreviations for the sparkline date-range label.
   We avoid `toLocaleDateString` to keep SSR output deterministic
   (server and client share the same output regardless of locale). */
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Format an ISO-date range into a compact label:
 *   - Same month:  "Jul 15–21"
 *   - Cross-month: "Jul 28 – Aug 3"
 *
 * Falls back to `undefined` when either input is unparseable.
 *
 * IMPORTANT: we use the `getUTC*` accessors deliberately. The server
 * (`lib/dashboard.ts:formatDayKey`) emits keys like `"2026-04-25"` from
 * server-local time, which on Vercel is UTC. JS parses bare
 * `"YYYY-MM-DD"` strings as UTC midnight, so reading them back via
 * `getMonth()` / `getDate()` (local-time) shifts the day by ±1 for any
 * client whose timezone offset crosses midnight. Reading via
 * `getUTCMonth()` / `getUTCDate()` keeps the round-trip honest
 * regardless of where the user's clock is.
 */
function fmtDateRange(startIso: string, endIso: string): string | undefined {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return undefined;
  const sMonth = MONTHS_EN[s.getUTCMonth()];
  const eMonth = MONTHS_EN[e.getUTCMonth()];
  const sDay = s.getUTCDate();
  const eDay = e.getUTCDate();
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${sMonth} ${sDay}–${eDay}`
    : `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
}

/**
 * Build the full sparkline label: `"7d · Jul 15–21"`. Given a dated
 * series, derives the day count from its length and the range from
 * first/last dates. Returns undefined when the series is too short
 * to meaningfully label.
 */
function sparkLabel<T extends { date: string }>(series: readonly T[]): string | undefined {
  if (series.length < 2) return undefined;
  const range = fmtDateRange(series[0].date, series[series.length - 1].date);
  return range ? `${series.length}d · ${range}` : undefined;
}

export function InstrumentCluster({
  summary,
  onOpenSection,
  variant = "default",
}: InstrumentClusterProps) {
  const { streakDays, dueToday } = summary.metrics;
  const targetPct = summary.configuredDesiredRetention * 100;
  const gap = summary.fsrsCalibrationGap30d;

  // Pick gauge tones that surface salience without screaming
  const dueTone: "default" | "warm" =
    dueToday > DUE_REFERENCE * 0.6 ? "warm" : "default";
  const gapTone: "default" | "warm" | "cool" =
    Math.abs(gap) < 0.02 ? "default" : gap > 0 ? "warm" : "cool";

  // Editorial mapping from gauge → most-relevant section.
  const open = (id: SectionId) => () => onOpenSection?.(id);

  /* ── Sparkline inputs ─────────────────────────────────────────────
   * Each gauge's sparkline is a deliberately-chosen proxy:
   *   • Streak   → daily review counts (activity rhythm proxy; the
   *                actual streak value per day isn't stored, but
   *                non-zero days are what build streak)
   *   • Due      → next 7 days of forecasted due counts (forward-
   *                looking load; drawn left→right = today→next week)
   *   • Target   → no series (constant setting; flat line would be
   *                noise, skip)
   *   • FSRS Gap → last 7 points of the 14-day gap series (drift
   *                trajectory over the last week)
   *
   * All series are filtered to `Number.isFinite` by CircularGauge
   * itself, so we don't need to re-defensively-code here.
   */
  const streakDataset = summary.reviewVolume7d;
  const streakSeries = streakDataset.map((d) => d.count);
  const streakSparkLabel = sparkLabel(streakDataset);

  const dueDataset = summary.dailyForecast
    .filter((d) => !d.isPast)
    .slice(0, 7);
  const dueSeries = dueDataset.map((d) => d.dueCount);
  const dueSparkLabel = sparkLabel(dueDataset);

  const gapDataset = summary.retentionGapSeries14d.slice(-7);
  const gapSeries = gapDataset.map((p) => p.gap);
  const gapSparkLabel = sparkLabel(gapDataset);

  const isCompact = variant === "compact";

  return (
    <section
      className={`panel-strong relative overflow-hidden rounded-[2rem] ${
        isCompact ? "p-4" : "p-6 sm:p-8"
      }`}
    >
      {/* Ambient halo gradients — pure decoration, marked aria-hidden */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[120%] -translate-x-1/2 opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--color-accent), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -bottom-12 h-40 w-40 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--color-accent-2)" }}
      />

      {/* Subtle scan-line texture — drives the "instrument console" feel
          without overwhelming the readings. Pure CSS gradient, no images. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-ink) 0 1px, transparent 1px 4px)",
        }}
      />

      <div className="relative">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-ink-soft)]">
            Instrument Cluster
          </p>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-ink-soft)] opacity-60">
            {isCompact ? "点按钻取" : "live readings · 点击 gauge 钻取详情"}
          </p>
        </div>

        <div
          className={`${isCompact ? "mt-4" : "mt-6"} grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6`}
        >
          <CircularGauge
            value={streakDays}
            max={STREAK_REFERENCE}
            label="Streak"
            sublabel="连续天数"
            suffix="days"
            tone="cool"
            sparkline={streakSeries}
            sparklineLabel={streakSparkLabel}
            onClick={onOpenSection ? open("review-load") : undefined}
            hoverHint="复习负载 →"
          />

          <CircularGauge
            value={dueToday}
            max={Math.max(DUE_REFERENCE, dueToday * 1.2)}
            label="Due Today"
            sublabel="今日待复习"
            suffix="cards"
            tone={dueTone}
            sparkline={dueSeries}
            sparklineLabel={dueSparkLabel}
            onClick={onOpenSection ? open("forecast-calendar") : undefined}
            hoverHint="预测日历 →"
          />

          <CircularGauge
            value={targetPct}
            max={100}
            label="Target"
            sublabel="目标 retention"
            formatValue={(v) => `${Math.round(v)}%`}
            tone="cool"
            onClick={onOpenSection ? open("retention-gap") : undefined}
            hoverHint="留存差距 →"
          />

          <CircularGauge
            value={gap}
            max={FSRS_GAP_REFERENCE}
            label="FSRS Gap"
            sublabel="30 日校准偏移"
            formatValue={(v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}pp`}
            tone={gapTone}
            bidirectional
            sparkline={gapSeries}
            sparklineLabel={gapSparkLabel}
            onClick={onOpenSection ? open("fsrs-training") : undefined}
            hoverHint="FSRS 训练 →"
          />
        </div>
      </div>
    </section>
  );
}
