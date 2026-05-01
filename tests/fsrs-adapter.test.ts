import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  applyReviewAnswer,
  buildInitialSchedulerPayload,
  normalizeDesiredRetention,
  retuneScheduledReviewCard,
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

  it("retunes mature review cards to shorter due dates at higher retention", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const payload = {
      difficulty: 4.5,
      due: "2026-05-21T10:00:00.000Z",
      elapsed_days: 8,
      lapses: 1,
      learning_steps: 0,
      last_review: "2026-04-23T10:00:00.000Z",
      reps: 12,
      scheduled_days: 20,
      stability: 22,
      state: State.Review,
    };

    const conservative = retuneScheduledReviewCard(payload, 0.95, now);
    const aggressive = retuneScheduledReviewCard(payload, 0.8, now);

    expect(conservative).not.toBeNull();
    expect(aggressive).not.toBeNull();
    expect(conservative!.scheduledDays).toBeLessThanOrEqual(aggressive!.scheduledDays);
    expect(new Date(conservative!.dueAt).getTime()).toBeLessThanOrEqual(
      new Date(aggressive!.dueAt).getTime(),
    );
  });

  // --------------------------------------------------------------------------
  // Custom w-parameters (personalised FSRS weights)
  // --------------------------------------------------------------------------
  describe("custom w-parameters", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    // A plausible 19-element FSRS-5 default-ish array — actual values only
    // matter for the assertions below: they have to produce a *different*
    // schedule than the library-default w.
    const TUNED_W_19 = [
      0.2, 0.3, 1.2, 2.9, 5.0, 0.9, 0.85, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05,
      0.34, 1.26, 0.29, 2.61, 0, 0,
    ];

    it("propagates explicit weights into applyReviewAnswer", () => {
      const payload = {
        difficulty: 5,
        due: now.toISOString(),
        elapsed_days: 10,
        lapses: 0,
        learning_steps: 0,
        last_review: "2026-04-21T10:00:00.000Z",
        reps: 8,
        scheduled_days: 10,
        stability: 15,
        state: State.Review,
      };

      const withDefault = applyReviewAnswer(payload, "good", now, 0.9);
      const withTuned = applyReviewAnswer(payload, "good", now, 0.9, TUNED_W_19);

      // Stability is the continuous quantity directly controlled by w;
      // scheduled_days rounds to integers so small w deltas can land on the
      // same day. Detecting divergence at the stability level is the most
      // sensitive way to prove w was threaded through.
      expect(withTuned.stability).not.toBe(withDefault.stability);
    });

    it("treats empty / null weights the same as omitted (library default)", () => {
      const payload = {
        difficulty: 5,
        due: now.toISOString(),
        elapsed_days: 10,
        lapses: 0,
        learning_steps: 0,
        last_review: "2026-04-21T10:00:00.000Z",
        reps: 8,
        scheduled_days: 10,
        stability: 15,
        state: State.Review,
      };

      const omitted = applyReviewAnswer(payload, "good", now, 0.9);
      const emptyArr = applyReviewAnswer(payload, "good", now, 0.9, []);
      const nullW = applyReviewAnswer(payload, "good", now, 0.9, null);

      expect(emptyArr.scheduledDays).toBe(omitted.scheduledDays);
      expect(nullW.scheduledDays).toBe(omitted.scheduledDays);
    });

    it("propagates weights into retuneScheduledReviewCard", () => {
      const payload = {
        difficulty: 4.5,
        due: "2026-05-21T10:00:00.000Z",
        elapsed_days: 8,
        lapses: 1,
        learning_steps: 0,
        last_review: "2026-04-23T10:00:00.000Z",
        reps: 12,
        scheduled_days: 20,
        stability: 22,
        state: State.Review,
      };

      const defaultW = retuneScheduledReviewCard(payload, 0.9, now);
      const tunedW = retuneScheduledReviewCard(payload, 0.9, now, TUNED_W_19);

      expect(defaultW).not.toBeNull();
      expect(tunedW).not.toBeNull();
      // Retune should still change scheduledDays; here we only check that
      // passing w yields a distinct outcome in retrievability (which is
      // computed from scheduler with the weights applied).
      expect(tunedW!.retrievability).not.toBe(defaultW!.retrievability);
    });
  });
});
