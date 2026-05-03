import { ReviewQueue } from "@/components/review/ReviewQueue";
import { ReviewStatsPanel } from "@/components/review/ReviewStatsPanel";

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <section className="panel-strong relative rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Spaced Repetition
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">复习队列</h1>
        <p className="mt-4 max-w-3xl pr-12 text-sm leading-7 text-[var(--color-ink-soft)]">
          这里展示当前到期的词条。点击 Again / Hard / Good / Easy 后，会写入复习日志并更新下一次到期时间。
        </p>
      </section>
      <ReviewStatsPanel />
      <ReviewQueue />
    </div>
  );
}
