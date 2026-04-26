import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { prioritizeReviewQueueItems } from "@/lib/review/queue";
import type { StoredSchedulerCard } from "@/lib/review/types";

function buildReviewCard(
  overrides: Partial<StoredSchedulerCard> = {},
): StoredSchedulerCard {
  return {
    difficulty: 4.5,
    due: "2026-05-12T10:00:00.000Z",
    elapsed_days: 10,
    lapses: 1,
    learning_steps: 0,
    last_review: "2026-04-22T10:00:00.000Z",
    reps: 12,
    scheduled_days: 20,
    stability: 24,
    state: State.Review,
    ...overrides,
  };
}

describe("review queue prioritization", () => {
  it("puts learning cards first, then the highest-risk review cards, then new cards", () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const ordered = prioritizeReviewQueueItems(
      [
        {
          desired_retention: 0.9,
          due_at: "2026-05-01T09:15:00.000Z",
          id: "new-card",
          review_count: 0,
          scheduler_payload: null,
          state: "new",
        },
        {
          desired_retention: 0.9,
          due_at: "2026-05-01T09:30:00.000Z",
          id: "learning-card",
          review_count: 1,
          scheduler_payload: buildReviewCard({
            due: "2026-05-01T09:30:00.000Z",
            learning_steps: 1,
            scheduled_days: 0,
            stability: 3,
            state: State.Learning,
          }),
          state: "learning",
        },
        {
          desired_retention: 0.9,
          due_at: "2026-05-01T08:00:00.000Z",
          id: "stable-review",
          review_count: 9,
          scheduler_payload: buildReviewCard({
            elapsed_days: 6,
            last_review: "2026-04-25T10:00:00.000Z",
            scheduled_days: 16,
            stability: 30,
          }),
          state: "review",
        },
        {
          desired_retention: 0.9,
          due_at: "2026-05-01T08:30:00.000Z",
          id: "risky-review",
          review_count: 9,
          scheduler_payload: buildReviewCard({
            elapsed_days: 18,
            last_review: "2026-04-12T10:00:00.000Z",
            scheduled_days: 18,
            stability: 12,
          }),
          state: "review",
        },
      ],
      now,
    );

    expect(ordered.map((item) => item.id)).toEqual([
      "learning-card",
      "risky-review",
      "stable-review",
      "new-card",
    ]);
  });
});
