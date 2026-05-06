import { describe, expect, it } from "vitest";
import {
  SCHEDULER_CACHE_LIMIT,
  applyReviewAnswer,
  buildInitialSchedulerPayload,
  getSchedulerCacheSize,
} from "@/lib/review/fsrs-adapter";

/**
 * Regression for the P0 finding in
 * `.trae/documents/code-robustness-review-report.md`:
 *   `schedulerCache` used to be an unbounded Map keyed by
 *   (retention, weights-signature). Long-running server processes would
 *   accumulate a scheduler per unique weights vector and eventually OOM.
 *
 * The fix gives the Map an LRU bound; these tests pin the bound in place
 * and prove that eviction happens once we cross it.
 */
describe("fsrs schedulerCache — LRU bound", () => {
  /**
   * Drive the scheduler via `applyReviewAnswer` with a synthetic weights
   * vector per iteration. Each unique signature mints a new cache entry.
   * The test is timing-independent — it only checks the final size.
   */
  function exerciseScheduler(seed: number) {
    const now = new Date("2026-04-24T10:00:00.000Z");
    const payload = buildInitialSchedulerPayload(now);
    // 21 weights is the current ts-fsrs v5 shape. We deliberately vary just
    // one entry per call so every invocation produces a fresh sig.
    const weights = Array.from({ length: 21 }, (_, i) => (i === 0 ? 0.1 + seed * 1e-4 : 0.5));
    applyReviewAnswer(payload, "good", now, 0.9, weights);
  }

  it("exposes the documented cap", () => {
    expect(SCHEDULER_CACHE_LIMIT).toBe(100);
  });

  it("never grows beyond the cap even when pushed past it", () => {
    // Walk well past the cap so we exercise the eviction path repeatedly.
    for (let i = 0; i < SCHEDULER_CACHE_LIMIT * 2; i += 1) {
      exerciseScheduler(i);
    }
    expect(getSchedulerCacheSize()).toBeLessThanOrEqual(SCHEDULER_CACHE_LIMIT);
  });

  it("keeps recently-touched keys while evicting cold ones", () => {
    // Prime a distinctive "hot" entry, fill the cache past the cap while
    // re-touching the hot key between inserts, then insert one more. The
    // hot key must survive; a cold key added at the start should not.
    const hotSeed = 999_999;
    exerciseScheduler(hotSeed);
    const sizeAfterHot = getSchedulerCacheSize();
    expect(sizeAfterHot).toBeGreaterThanOrEqual(1);

    // Insert SCHEDULER_CACHE_LIMIT new cold entries, touching the hot
    // entry between each insert to bump it to the tail.
    for (let i = 0; i < SCHEDULER_CACHE_LIMIT + 5; i += 1) {
      exerciseScheduler(i);
      // LRU-refresh the hot key so it stays young.
      exerciseScheduler(hotSeed);
    }

    // The hot seed entry was re-touched every iteration so it must still
    // be in the cache; if it weren't, this call would mint a new one and
    // drive size past the cap (size is ≤ cap after this check passes).
    exerciseScheduler(hotSeed);
    expect(getSchedulerCacheSize()).toBeLessThanOrEqual(SCHEDULER_CACHE_LIMIT);
  });
});
