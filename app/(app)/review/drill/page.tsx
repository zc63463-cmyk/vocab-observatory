import { DrillApp } from "@/components/review/drill/DrillApp";

/**
 * /review/drill — multi-mode self-test (cloze + definition fill-in).
 *
 * Intentionally a server-component shell around a client-only drill
 * orchestrator. No data is prefetched on the server: the drill candidate
 * list depends on owner-session auth and is short enough that the client
 * fetch is imperceptible. Keeping the shell static means the page
 * transition from /review is instant.
 *
 * Contract: no FSRS side-effects. Drill writes nothing to review_logs or
 * scheduler_payload. See lib/review/drill.ts for the rationale.
 */
export default function DrillPage() {
  return (
    <div className="space-y-6">
      <section className="panel-strong rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Self-Test · Drill Mode
        </p>
        <h1 className="section-title mt-3 text-4xl font-semibold sm:text-5xl">
          测试模式
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-ink-soft)]">
          自选任意数量已经复习过的词，用例句挖空或释义填词反复过关——答错会留到队尾，直到全部答对。
          <strong className="text-[var(--color-ink)]"> 这一轮的成绩不会影响 FSRS 复习调度</strong>
          ，专门用于临时巩固。
        </p>
      </section>

      <DrillApp />
    </div>
  );
}
