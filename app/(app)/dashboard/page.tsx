import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { MetricCard } from "@/components/ui/MetricCard";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { StackedRatingBar } from "@/components/ui/StackedRatingBar";
import { getDashboardSummary } from "@/lib/dashboard";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  const maxReviewVolume7d = Math.max(...summary.reviewVolume7d.map((item) => item.count), 1);
  const maxReviewVolume30d = Math.max(...summary.reviewVolume30d.map((item) => item.count), 1);
  const reviewsToday = summary.reviewVolume30d.at(-1)?.count ?? 0;
  const reviewPeak30d = Math.max(...summary.reviewVolume30d.map((item) => item.count), 0);

  const ratingSegments = [
    { label: "Again", value: summary.ratingDistribution.again, color: "#ef4444" },
    { label: "Hard", value: summary.ratingDistribution.hard, color: "#f59e0b" },
    { label: "Good", value: summary.ratingDistribution.good, color: "#22c55e" },
    { label: "Easy", value: summary.ratingDistribution.easy, color: "#3b82f6" },
  ];

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Owner Dashboard
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">学习仪表盘</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          这里汇总当前复习负载、今日完成量、连续学习状态、遗忘率与语义场健康度。
        </p>
      </section>

      {summary.configured ? (
        <>
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
                  <h2 className="section-title text-2xl font-semibold">今日学习面板</h2>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    汇总当天任务、当前 session 与最近 30 天表现。
                  </p>
                </div>
                <Badge tone="warm">
                  {(summary.fsrsForgettingRate * 100).toFixed(0)}% FSRS 理论遗忘率
                </Badge>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Tracked" value={summary.metrics.trackedWords} />
                <MetricCard label="Notes" value={summary.metrics.notesCount} tone="warm" />
                <MetricCard label="Reviews 7d" value={summary.metrics.reviewed7d} />
                <MetricCard label="Reviews 30d" value={summary.metrics.reviewed30d} tone="warm" />
              </div>

              {summary.activeSession ? (
                <div className="mt-4 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
                  <p>当前会话开始于：{formatDateTime(summary.activeSession.started_at)}</p>
                  <p>当前会话已完成：{summary.activeSession.cards_seen}</p>
                  <p>行为遗忘率（30天 Again 占比）：{(summary.forgettingRate30d * 100).toFixed(0)}%</p>
                </div>
              ) : null}
            </section>

            <section className="panel rounded-[1.75rem] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="section-title text-2xl font-semibold">最近一次同步</h2>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    词库导入是否健康、失败文件是否可追踪，都从这里确认。
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
                  尚未应用导入追踪迁移，运行 `0003_import_tracking.sql` 后这里会显示同步历史。
                </p>
              ) : !summary.importOverview.latestRun ? (
                <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
                  还没有导入历史。下一次执行 `/api/imports/github` 后会在此记录。
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <MetricCard label="Created" value={summary.importOverview.latestRun.created_count} />
                    <MetricCard label="Updated" value={summary.importOverview.latestRun.updated_count} />
                    <MetricCard label="Errors" value={summary.importOverview.latestRun.error_count} tone="warm" />
                  </div>
                  <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
                    <p>开始时间：{formatDateTime(summary.importOverview.latestRun.started_at)}</p>
                    <p>结束时间：{formatDateTime(summary.importOverview.latestRun.finished_at)}</p>
                    <p>有效导入：{summary.importOverview.latestRun.imported_count}</p>
                    <p>未变化：{summary.importOverview.latestRun.unchanged_count}</p>
                    <p>软删除：{summary.importOverview.latestRun.soft_deleted_count}</p>
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
              <h2 className="section-title text-2xl font-semibold">7 天复习趋势</h2>
              <MiniBarChart
                data={summary.reviewVolume7d}
                maxCount={maxReviewVolume7d}
                className="mt-5"
              />

              <div className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                  评分分布
                </h3>
                <StackedRatingBar segments={ratingSegments} className="mt-4" />
              </div>
            </section>

            <CollapsiblePanel
              title="30 天复习趋势"
              defaultOpen={false}
              badge={<Badge tone="warm">默认收起</Badge>}
              subtitle="这块更适合需要时再展开查看，不占用首屏空间。"
              summary={`最近30天共复习 ${summary.metrics.reviewed30d} 次，今日 ${reviewsToday} 次，峰值 ${reviewPeak30d} 次/天。`}
            >
              <MiniBarChart
                data={summary.reviewVolume30d.slice(-14)}
                maxCount={maxReviewVolume30d}
                accentColor="var(--color-accent-2)"
              />

              <div className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                  薄弱语义场
                </h3>
                <div className="mt-4 space-y-3">
                  {summary.weakestSemanticFields.length === 0 ? (
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      最近 30 天样本量还不够，暂时无法判断薄弱语义场。
                    </p>
                  ) : (
                    summary.weakestSemanticFields.map((field) => (
                      <div
                        key={field.name}
                        className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <p className="font-semibold">{field.name}</p>
                          <Badge tone="warm">{(field.againRate * 100).toFixed(0)}%</Badge>
                        </div>
                        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                          样本数：{field.total}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CollapsiblePanel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <CollapsiblePanel
              title="最近复习"
              defaultOpen={true}
              summary={
                summary.recentLogs[0]
                  ? `最近一次复习：${formatDateTime(summary.recentLogs[0].reviewed_at)} · 当前展示 ${summary.recentLogs.length} 条`
                  : "暂无复习记录"
              }
            >
              <div className="space-y-3">
                {summary.recentLogs.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-soft)]">还没有复习记录。</p>
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
                          <span className="font-semibold">已删除词条</span>
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
              title="最近笔记"
              defaultOpen={false}
              summary={
                summary.notes[0]
                  ? `最近一次更新：${formatDateTime(summary.notes[0].updated_at)} · 当前展示 ${summary.notes.length} 条`
                  : "暂无笔记记录"
              }
            >
              <div className="flex items-center justify-end">
                <Link href="/notes" className="text-sm font-semibold text-[var(--color-accent)]">
                  查看全部 -&gt;
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {summary.notes.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-soft)]">还没有个人笔记。</p>
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
                        <span className="font-semibold">已删除词条</span>
                      )}
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                        Version {note.version}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                        {note.content_md.slice(0, 140) || "空白笔记"}
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
        </>
      ) : (
        <div className="panel rounded-[1.75rem] p-8 text-sm leading-7 text-[var(--color-ink-soft)]">
          当前还没有 Supabase 配置，因此后台页处于占位模式。
        </div>
      )}
    </div>
  );
}
