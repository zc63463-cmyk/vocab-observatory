import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  applyReviewAnswer,
  buildInitialSchedulerPayload,
  normalizeDesiredRetention,
} from "@/lib/review/fsrs-adapter";

describe("fsrs adapter", () => {
  it("creates a valid initial payload", () => {
    const payload = buildInitialSchedulerPayload(new Date("2026-04-24T10:00:00.000Z"));

    expect(payload.reps).toBe(0);
    expect(payload.lapses).toBe(0);
    expect(typeof payload.due).toBe("string");
  });

  it("produces a future schedule after a good answer", () => {
    const now = new Date("2026-04-24T10:00:00.000Z");
    const payload = buildInitialSchedulerPayload(now);
    const result = applyReviewAnswer(payload, "good", now);

    expect(result.state).toMatch(/learning|review|relearning|new/);
    expect(new Date(result.dueAt).getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(result.reps).toBeGreaterThanOrEqual(1);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(0);
  });

  it("clamps desired retention into the supported range", () => {
    expect(normalizeDesiredRetention(null)).toBe(0.9);
    expect(normalizeDesiredRetention(0.5)).toBe(0.7);
    expect(normalizeDesiredRetention(1.5)).toBe(0.99);
  });

  it("schedules shorter intervals for higher desired retention", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const payload = {
      difficulty: 4.8,
      due: now.toISOString(),
      elapsed_days: 10,
      lapses: 1,
      learning_steps: 0,
      last_review: "2026-04-21T10:00:00.000Z",
      reps: 12,
      scheduled_days: 10,
      stability: 18,
      state: State.Review,
    };

    const conservative = applyReviewAnswer(payload, "good", now, 0.95);
    const aggressive = applyReviewAnswer(payload, "good", now, 0.8);

    expect(conservative.scheduledDays).toBeLessThanOrEqual(aggressive.scheduledDays);
  });
});
