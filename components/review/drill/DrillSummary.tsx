"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { springs } from "@/components/motion";
import {
  countFirstTryPasses,
  type DrillCard,
  type DrillQueueState,
} from "@/lib/review/drill";

interface DrillSummaryProps {
  state: DrillQueueState;
  /** Deck the session was launched with, for name lookup in the struggle list. */
  deck: ReadonlyArray<DrillCard>;
  onReplay: () => void;
  onPickAgain: () => void;
  onExit: () => void;
}

/**
 * Post-session summary. Metrics focus on *honest practice* rather than
 * scheduler stats because the whole point of drill is "no FSRS impact":
 *   - total unique words in the deck
 *   - first-try passes (no wrong attempts ever)
 *   - total wrong attempts across all cards (effort spent)
 *   - struggled-most list (top 3 cards by attempt count)
 *
 * Replay re-seeds the same deck fresh — useful when a user wants to
 * immediately re-test the same block to cement recall.
 */
export function DrillSummary({
  state,
  deck,
  onReplay,
  onPickAgain,
  onExit,
}: DrillSummaryProps) {
  const total = state.totalUnique;
  const firstTry = countFirstTryPasses(state);
  const totalAttempts = Object.values(state.attemptsByCard).reduce(
    (sum, n) => sum + n,
    0,
  );

  const struggleRanking = Object.entries(state.attemptsByCard)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([progressId, attempts]) => {
      const card = deck.find((c) => c.progressId === progressId);
      return {
        progressId,
        lemma: card?.lemma ?? "(未知)",
        attempts,
      };
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth }}
      className="space-y-6"
    >
      <div className="panel-strong rounded-[2rem] p-6 sm:p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Drill Complete
        </p>
        <h2
          className="section-title mt-3 text-4xl font-semibold"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          自测完成
        </h2>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          这一轮的数据只存在于这次会话里，不会进入 FSRS 复习日志。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <MetricCard label="总词数" value={total} />
        <MetricCard label="首次就对" value={firstTry} tone="warm" />
        <MetricCard label="累计错误" value={totalAttempts} />
      </div>

      {struggleRanking.length > 0 && (
        <div className="panel rounded-[1.75rem] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
            最难啃的几个
          </h3>
          <ul className="mt-3 space-y-2">
            {struggleRanking.map((row) => (
              <li
                key={row.progressId}
                className="flex items-center justify-between rounded-2xl bg-[var(--color-surface-soft)] px-4 py-2 text-sm"
              >
                <span className="font-semibold text-[var(--color-ink)]">
                  {row.lemma}
                </span>
                <span className="text-[var(--color-accent-2)]">
                  错 {row.attempts} 次
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={onReplay}>
          再来一轮（同一批）
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={onPickAgain}>
          换一批
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onExit}>
          返回复习页
        </Button>
      </div>
    </motion.div>
  );
}
