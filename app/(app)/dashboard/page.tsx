import Link from "next/link";
import { FsrsTrainingPanel } from "@/components/review/FsrsTrainingPanel";
import { RetentionDiagnostics } from "@/components/review/RetentionDiagnostics";
import { ReviewRetentionSettings } from "@/components/review/ReviewRetentionSettings";
import { Badge } from "@/components/ui/Badge";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { AnimatedMetricCard as MetricCard } from "@/components/ui/AnimatedMetricCard";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { PlanVsActualChart } from "@/components/ui/PlanVsActualChart";
import { StackedRatingBar } from "@/components/ui/StackedRatingBar";
import { MasteryHeatmap } from "@/components/review/MasteryHeatmap";
import type { DailyForecastDay } from "@/lib/dashboard";
import { getDashboardSummary } from "@/lib/dashboard";
import { getNearestReviewRetentionPreset } from "@/lib/review/settings";
import { excerpt, formatDateTime } from "@/lib/utils";

function formatPercent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPoints(value: number, digits = 0) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}pp`;
}

function getLoadColor(count: number): string {
  if (count <= 5) return "#0f766e";
  if (count <= 15) return "#3b82f6";
  if (count <= 30) return "#f59e0b";
  return "#ef4444";
}

function getForecastSuggestion(days: DailyForecastDay[]): { text: string; tone: "cool" | "warm" } {
  const today = days.find((d) => d.isToday);
  if (!today) return { text: "无法获取今日数据", tone: "warm" };
  const futureDays = days.filter((d) => !d.isPast && !d.isToday);
  const maxFuture = Math.max(...futureDays.map((d) => d.dueCount), 0);
  const avgFuture =
    futureDays.length > 0
      ? futureDays.reduce((sum, d) => sum + d.dueCount, 0) / futureDays.length
      : 0;
  const tomorrow = futureDays[0];

  if (today.dueCount === 0 && maxFuture > 0) {
    return {
      text: `今天没有到期卡片，可以提前复习。未来 ${futureDays.length} 天平均每日 ${Math.round(avgFuture)} 张，最高 ${maxFuture} 张（${futureDays.find((d) => d.dueCount === maxFuture)?.dateLabel}）。`,
      tone: "cool",
    };
  }
  if (today.dueCount > avgFuture * 1.5) {
    return {
      text: `今天负载较高（${today.dueCount} 张），是日均的 ${Math.round(today.dueCount / Math.max(avgFuture, 1))} 倍。建议专注完成核心复习，非紧急卡可推迟到明天（${tomorrow?.dueCount ?? 0} 张）。`,
      tone: "warm",
    };
  }
  if (tomorrow && tomorrow.dueCount > today.dueCount * 1.5) {
    return {
      text: `明天负载会上升（${tomorrow.dueCount} vs 今天 ${today.dueCount}）。如果时间充裕，今天可以多处理一些，减轻明日压力。`,
      tone: "warm",
    };
  }
  if (today.dueCount <= 10 && maxFuture <= 20) {
    return {
      text: `负载平稳，今天 ${today.dueCount} 张，未来两周峰值 ${maxFuture} 张。节奏舒适，保持即可。`,
      tone: "cool",
    };
  }
  return {
    text: `今天 ${today.dueCount} 张待复习，未来 ${futureDays.length} 天共 ${futureDays.reduce((s, d) => s + d.dueCount, 0)} 张。`,
    tone: "cool",
  };
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  const maxReviewVolume7d = Math.max(...summary.reviewVolume7d.map((item) => item.count), 1);
  const maxReviewVolume30d = Math.max(...summary.reviewVolume30d.map((item) => item.count), 1);
  const reviewsToday = summary.reviewVolume30d.at(-1)?.count ?? 0;
  const reviewPeak30d = Math.max(...summary.reviewVolume30d.map((item) => item.count), 0);
  const retentionGapLabel = formatSignedPoints(summary.fsrsCalibrationGap30d);
  const nearestPreset = getNearestReviewRetentionPreset(summary.configuredDesiredRetention);
  const configuredForecast = summary.configuredRetentionForecast;
  const activeGapDays = summary.retentionGapSeries14d.filter((item) => item.reviewCount > 0);
  const avgGap14d =
    activeGapDays.length > 0
      ? activeGapDays.reduce((sum, item) => sum + item.gap, 0) / activeGapDays.length
      : 0;
  const aboveTargetDays = activeGapDays.filter((item) => item.gap > 0).length;

  const ratingSegments = [
    { label: "Again", value: summary.ratingDistribution.again, color: "#ef4444" },
    { label: "Hard", value: summary.ratingDistribution.hard, color: "#f59e0b" },
    { label: "Good", value: summary.ratingDistribution.good, color: "#22c55e" },
    { label: "Easy", value: summary.ratingDistribution.easy, color: "#3b82f6" },
  ];

  if (!summary.configured) {
    return (
      <div className="panel rounded-[1.75rem] p-8 text-sm leading-7 text-[var(--color-ink-soft)]">
        Dashboard data is unavailable because Supabase is not configured in this environment.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Owner Dashboard
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">Learning dashboard</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          Track today&apos;s review load, watch calibration drift, and compare how each retention
          preset changes the next two weeks of workload.
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Streak Days" value={summary.metrics.streakDays} />
        <MetricCard label="Due Today" value={summary.metrics.dueToday} tone="warm" />
        <MetricCard label="Reviewed Today" value={summary.metrics.reviewedToday} />
        <MetricCard label="Today New" value={summary.metrics.todayNewCount} tone="warm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-[1.75rem] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title text-2xl font-semibold">Review load and calibration</h2>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                This is the control surface for retention target, active queue size, and the gap
                between observed misses and FSRS expectation.
              </p>
            </div>
            <Badge tone="warm">{formatPercent(summary.fsrsForgettingRate)}</Badge>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Tracked" value={summary.metrics.trackedWords} />
            <MetricCard label="Notes" value={summary.metrics.notesCount} tone="warm" />
            <MetricCard label="Reviews 7d" value={summary.metrics.reviewed7d} />
            <MetricCard label="Reviews 30d" value={summary.metrics.reviewed30d} tone="warm" />
            <MetricCard
              label="Target Retention"
              value={formatPercent(summary.averageDesiredRetention)}
            />
            <MetricCard
              label="FSRS Gap 30d"
              value={retentionGapLabel}
              tone={summary.fsrsCalibrationGap30d > 0 ? "warm" : "cool"}
            />
          </div>

          <ReviewRetentionSettings
            key={summary.configuredDesiredRetention}
            initialDesiredRetention={summary.configuredDesiredRetention}
            averageDesiredRetention={summary.averageDesiredRetention}
            trackedWords={summary.metrics.trackedWords}
          />

          <RetentionDiagnostics diagnostic={summary.retentionDiagnostic} />

          <FsrsTrainingPanel initialStatus={summary.fsrsTrainingStatus} />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Current target
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                {formatPercent(summary.configuredDesiredRetention)}
              </p>
              <p className="mt-2">
                Nearest preset: {nearestPreset.label}. Average active-card target is{" "}
                {formatPercent(summary.averageDesiredRetention)}.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Current forecast
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <SmallStat label="Due now" value={configuredForecast.dueNow} />
                <SmallStat label="Next 7d" value={configuredForecast.due7d} />
                <SmallStat label="Next 14d" value={configuredForecast.due14d} />
              </div>
            </div>
          </div>

          {summary.activeSession ? (
            <div className="mt-4 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
              <p>Active session started: {formatDateTime(summary.activeSession.started_at)}</p>
              <p>Cards seen: {summary.activeSession.cards_seen}</p>
              <p>Observed again rate, 30d: {formatPercent(summary.forgettingRate30d)}</p>
              <p>FSRS calibration gap, 30d: {retentionGapLabel}</p>
            </div>
          ) : null}
        </section>

        <section className="panel rounded-[1.75rem] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title text-2xl font-semibold">Latest import run</h2>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Keep the sync pipeline visible so broken source files or partial runs surface here
                before they silently stale the corpus.
              </p>
            </div>
            {summary.importOverview.latestRun ? (
              <Badge
                tone={
                  summary.importOverview.latestRun.status === "completed_with_errors" ||
                  summary.importOverview.latestRun.status === "failed"
                    ? "warm"
                    : "default"
                }
              >
                {summary.importOverview.latestRun.status}
              </Badge>
            ) : null}
          </div>

          {!summary.importOverview.available ? (
            <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
              Import tracking tables are not available yet. Run `0003_import_tracking.sql` and the
              dashboard will start showing run history here.
            </p>
          ) : !summary.importOverview.latestRun ? (
            <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
              No import history yet. The next `/api/imports/github` run will create the first entry.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard label="Created" value={summary.importOverview.latestRun.created_count} />
                <MetricCard label="Updated" value={summary.importOverview.latestRun.updated_count} />
                <MetricCard
                  label="Errors"
                  value={summary.importOverview.latestRun.error_count}
                  tone="warm"
                />
              </div>

              <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
                <p>Started: {formatDateTime(summary.importOverview.latestRun.started_at)}</p>
                <p>
                  Finished:{" "}
                  {summary.importOverview.latestRun.finished_at
                    ? formatDateTime(summary.importOverview.latestRun.finished_at)
                    : "Still running"}
                </p>
                <p>Imported: {summary.importOverview.latestRun.imported_count}</p>
                <p>Unchanged: {summary.importOverview.latestRun.unchanged_count}</p>
                <p>Soft deleted: {summary.importOverview.latestRun.soft_deleted_count}</p>
              </div>

              {summary.importOverview.recentErrors.length > 0 ? (
                <div className="space-y-3">
                  {summary.importOverview.recentErrors.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                        {entry.error_stage}
                      </p>
                      <p className="mt-2 font-semibold">{entry.source_path ?? "pipeline"}</p>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                        {entry.error_message}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-[1.75rem] p-6">
          <h2 className="section-title text-2xl font-semibold">7d review volume</h2>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Quick read on whether the last week stayed steady or spiked.
          </p>
          <MiniBarChart data={summary.reviewVolume7d} maxCount={maxReviewVolume7d} className="mt-5" />

          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
              Rating mix
            </h3>
            <StackedRatingBar segments={ratingSegments} className="mt-4" />
          </div>
        </section>

        <section className="panel rounded-[1.75rem] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title text-2xl font-semibold">Retention gap trend</h2>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Positive gap means observed Again rate is above the tolerated forgetting implied by
                the target retention used that day.
              </p>
            </div>
            <Badge tone={avgGap14d > 0 ? "warm" : "default"}>
              {formatSignedPoints(avgGap14d)} avg
            </Badge>
          </div>

          {summary.retentionGapSeries14d.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--color-ink-soft)]">No retention trend data yet.</p>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-7 gap-2 xl:grid-cols-14">
                {summary.retentionGapSeries14d.map((item) => {
                  const barHeight =
                    item.reviewCount === 0
                      ? 10
                      : Math.max(16, Math.min(96, Math.abs(item.gap) * 220));
                  const barColor =
                    item.reviewCount === 0
                      ? "rgba(120, 135, 130, 0.45)"
                      : item.gap > 0
                        ? "#f59e0b"
                        : "#0f766e";

                  return (
                    <div key={item.date} className="min-w-0">
                      <div
                        className="flex h-32 items-end justify-center rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-3"
                        title={`${item.date}: ${formatSignedPoints(item.gap, 1)} gap, ${formatPercent(item.againRate, 1)} Again, ${formatPercent(item.targetForgettingRate, 1)} target forgetting, ${item.reviewCount} reviews`}
                      >
                        <div
                          className="w-full rounded-full"
                          style={{
                            backgroundColor: barColor,
                            height: `${barHeight}px`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-center text-[10px] leading-tight text-[var(--color-ink-soft)]">
                        {item.date.slice(5)}
                      </p>
                      <p className="text-center text-[10px] leading-tight text-[var(--color-ink-soft)]">
                        {item.reviewCount}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Pressure days</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                    {aboveTargetDays}/{activeGapDays.length || 14}
                  </p>
                  <p className="mt-2">Days where misses ran above target tolerance.</p>
                </div>
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Latest active day
                  </p>
                  {activeGapDays.at(-1) ? (
                    <>
                      <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                        {formatSignedPoints(activeGapDays.at(-1)!.gap)}
                      </p>
                      <p className="mt-2">
                        {activeGapDays.at(-1)!.date} with{" "}
                        {formatPercent(activeGapDays.at(-1)!.againRate)} Again against{" "}
                        {formatPercent(activeGapDays.at(-1)!.targetForgettingRate)} target
                        forgetting.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2">No recent review days yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="panel rounded-[1.75rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="section-title text-2xl font-semibold">复习预测日历</h2>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              基于当前 retention 目标配算的未来 14 天每日到期量
            </p>
          </div>
          <Badge>{formatPercent(summary.configuredDesiredRetention)} 目标</Badge>
        </div>

        {summary.dailyForecast.length === 0 ? (
          <p className="mt-5 text-sm text-[var(--color-ink-soft)]">暂无预测数据。</p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-3 xl:grid-cols-14">
              {summary.dailyForecast.map((day) => {
                const color = getLoadColor(day.dueCount);
                const hasActual = day.actualReviewCount !== null;

                return (
                  <div
                    key={day.date}
                    className={`relative flex flex-col items-center rounded-[1.2rem] border p-3 transition-all ${
                      day.isToday
                        ? "border-[var(--color-accent)] bg-[var(--color-surface)] shadow-md"
                        : "border-[var(--color-border)] bg-[var(--color-surface-soft)]"
                    } ${day.isPast ? "opacity-60" : ""}`}
                  >
                    {day.isToday && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] px-2 text-[10px] font-bold uppercase tracking-wider text-white">
                        今天
                      </span>
                    )}
                    <p className="text-xs font-medium text-[var(--color-ink-soft)]">
                      周{day.weekday}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{day.dateLabel}</p>

                    <div className="mt-2 flex flex-col items-center gap-1">
                      {hasActual ? (
                        <div className="relative h-8 w-full">
                          <div
                            className="absolute bottom-0 w-full rounded-t-md opacity-25"
                            style={{
                              backgroundColor: color,
                              height: `${Math.min(100, Math.max(8, day.dueCount * 2))}%`,
                            }}
                          />
                          <div
                            className="absolute bottom-0 w-full rounded-t-md"
                            style={{
                              backgroundColor: "#22c55e",
                              height: `${Math.min(100, Math.max(4, (day.actualReviewCount ?? 0) * 2))}%`,
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="flex h-8 w-full items-end justify-center rounded-t-md"
                          style={{ backgroundColor: `${color}20` }}
                        >
                          <div
                            className="w-full rounded-t-md transition-all"
                            style={{
                              backgroundColor: color,
                              height: `${Math.min(100, Math.max(6, day.dueCount * 2))}%`,
                            }}
                          />
                        </div>
                      )}
                      <span
                        className="text-base font-bold"
                        style={{ color: day.dueCount > 0 ? color : "var(--color-ink-soft)" }}
                      >
                        {day.dueCount}
                      </span>
                    </div>

                    {hasActual ? (
                      <p className="mt-1 text-[10px] leading-tight text-emerald-600 dark:text-emerald-400">
                        实际 {day.actualReviewCount}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-soft)]">
                  负载等级：
                </span>
                {[
                  { label: "轻", color: "#0f766e" },
                  { label: "中", color: "#3b82f6" },
                  { label: "较高", color: "#f59e0b" },
                  { label: "重", color: "#ef4444" },
                ].map((level) => (
                  <span key={level.label} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: level.color }}
                    />
                    <span className="text-[11px] text-[var(--color-ink-soft)]">{level.label}</span>
                  </span>
                ))}
              </div>
              {(() => {
                const suggestion = getForecastSuggestion(summary.dailyForecast);
                return (
                  <p
                    className={`max-w-xl text-sm ${
                      suggestion.tone === "warm"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-teal-700 dark:text-teal-300"
                    }`}
                  >
                    💡 {suggestion.text}
                  </p>
                );
              })()}
            </div>
          </>
        )}
      </section>

      <section className="panel rounded-[1.75rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="section-title text-2xl font-semibold">计划 vs 实际</h2>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              把过去 14 天的每日预计到期量与实际完成量并排对比，看看节奏是否匹配
            </p>
          </div>
          <Badge>滚动 14 天</Badge>
        </div>
        <div className="mt-5">
          <PlanVsActualChart data={summary.planVsActual} />
        </div>
      </section>

      <MasteryHeatmap cells={summary.masteryCells} relationGraph={summary.relationGraph} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-[1.75rem] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title text-2xl font-semibold">Preset load forecast</h2>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Compare how the next review load shifts under Sprint, Balanced, and Conservative
                targets before you retune the queue.
              </p>
            </div>
            <Badge>{formatPercent(summary.configuredDesiredRetention)} current</Badge>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {summary.retentionForecasts.map((forecast) => {
              const delta7d = forecast.due7d - configuredForecast.due7d;
              const delta14d = forecast.due14d - configuredForecast.due14d;
              const isCurrent =
                Math.abs(forecast.desiredRetention - summary.configuredDesiredRetention) < 0.0005;

              return (
                <div
                  key={forecast.id}
                  className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">
                        {forecast.label} {formatPercent(forecast.desiredRetention)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">
                        {forecast.description}
                      </p>
                    </div>
                    <Badge tone={delta7d > 0 ? "warm" : "default"}>
                      {isCurrent ? "Current" : `${delta7d >= 0 ? "+" : ""}${delta7d} in 7d`}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <SmallStat label="Due now" value={forecast.dueNow} />
                    <SmallStat label="Next 7d" value={forecast.due7d} />
                    <SmallStat label="Next 14d" value={forecast.due14d} />
                  </div>

                  <p className="mt-3 text-xs leading-6 text-[var(--color-ink-soft)]">
                    Delta vs current target: {delta7d >= 0 ? "+" : ""}
                    {delta7d} cards in 7d, {delta14d >= 0 ? "+" : ""}
                    {delta14d} cards in 14d.
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <CollapsiblePanel
          title="30d review deep dive"
          defaultOpen={false}
          badge={<Badge tone="warm">Collapsed by default</Badge>}
          subtitle="Use this when the weekly surface is not enough and you need a broader queue shape."
          summary={`30d total ${summary.metrics.reviewed30d}, today ${reviewsToday}, peak ${reviewPeak30d} in a day.`}
        >
          <MiniBarChart
            data={summary.reviewVolume30d.slice(-14)}
            maxCount={maxReviewVolume30d}
            accentColor="var(--color-accent-2)"
          />

          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
              Highest again-risk semantic fields
            </h3>
            <div className="mt-4 space-y-3">
              {summary.weakestSemanticFields.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  Not enough 30d data yet to rank semantic fields.
                </p>
              ) : (
                summary.weakestSemanticFields.map((field) => (
                  <Link
                    key={field.name}
                    href={`/words?semantic=${encodeURIComponent(field.name)}`}
                    className="block rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 transition-colors hover:border-[var(--color-accent)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-semibold text-[var(--color-ink)]">{field.name}</p>
                      <Badge tone="warm">{formatPercent(field.againRate)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      {field.total} recent reviews. Open filtered words for targeted cleanup.
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </CollapsiblePanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CollapsiblePanel
          title="Recent reviews"
          defaultOpen={true}
          summary={
            summary.recentLogs[0]
              ? `Latest review ${formatDateTime(summary.recentLogs[0].reviewed_at)}. Showing ${summary.recentLogs.length} rows.`
              : "No review logs yet."
          }
        >
          <div className="space-y-3">
            {summary.recentLogs.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">No review logs yet.</p>
            ) : (
              summary.recentLogs.map((log, index) => (
                <div
                  key={`${log.reviewed_at}-${index}`}
                  className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    {log.words ? (
                      <Link
                        href={`/words/${log.words.slug}`}
                        className="font-semibold text-[var(--color-accent)]"
                      >
                        {log.words.lemma}
                      </Link>
                    ) : (
                      <span className="font-semibold">Deleted word</span>
                    )}
                    <span className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                      {log.rating}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    {formatDateTime(log.reviewed_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Recent notes"
          defaultOpen={false}
          summary={
            summary.notes[0]
              ? `Latest update ${formatDateTime(summary.notes[0].updated_at)}. Showing ${summary.notes.length} notes.`
              : "No note history yet."
          }
        >
          <div className="flex items-center justify-end">
            <Link href="/notes" className="text-sm font-semibold text-[var(--color-accent)]">
              View all notes
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {summary.notes.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">No personal notes yet.</p>
            ) : (
              summary.notes.map((note, index) => (
                <div
                  key={`${note.updated_at}-${index}`}
                  className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
                >
                  {note.words ? (
                    <Link
                      href={`/words/${note.words.slug}`}
                      className="font-semibold text-[var(--color-accent)]"
                    >
                      {note.words.lemma}
                    </Link>
                  ) : (
                    <span className="font-semibold">Deleted word</span>
                  )}
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                    Version {note.version}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                    {excerpt(note.content_md, 140) || "Empty note"}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                    {formatDateTime(note.updated_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </CollapsiblePanel>
      </div>
    </div>
  );
}
