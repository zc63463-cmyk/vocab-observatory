import { describe, expect, it } from "vitest";
import { applyReviewAnswer, buildInitialSchedulerPayload } from "@/lib/review/fsrs-adapter";

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
});
