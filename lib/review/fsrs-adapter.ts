import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import type { ReviewRating } from "@/types/database.types";
import type { ReviewState, SchedulerUpdate, StoredSchedulerCard } from "@/lib/review/types";

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
});

const ratingMap: Record<ReviewRating, 1 | 2 | 3 | 4> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const reviewStateMap: Record<number, ReviewState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

function toCard(payload?: StoredSchedulerCard | null): Card {
  if (!payload) {
    return createEmptyCard();
  }

  return {
    difficulty: payload.difficulty,
    due: new Date(payload.due),
    elapsed_days: payload.elapsed_days,
    lapses: payload.lapses,
    learning_steps: payload.learning_steps,
    last_review: payload.last_review ? new Date(payload.last_review) : undefined,
    reps: payload.reps,
    scheduled_days: payload.scheduled_days,
    stability: payload.stability,
    state: payload.state,
  };
}

function fromCard(card: Card): StoredSchedulerCard {
  return {
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    elapsed_days: card.elapsed_days,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    last_review: card.last_review?.toISOString() ?? null,
    reps: card.reps,
    scheduled_days: card.scheduled_days,
    stability: card.stability,
    state: card.state,
  };
}

export function buildInitialSchedulerPayload(now = new Date()) {
  return fromCard(createEmptyCard(now));
}

export function getCurrentRetrievability(
  payload: StoredSchedulerCard | null | undefined,
  now = new Date(),
) {
  if (!payload) {
    return null;
  }

  const card = toCard(payload);
  if (card.state === State.New) {
    return null;
  }

  return scheduler.get_retrievability(card, now, false);
}

export function applyReviewAnswer(
  payload: StoredSchedulerCard | null | undefined,
  rating: ReviewRating,
  now = new Date(),
): SchedulerUpdate {
  const currentCard = toCard(payload);
  const result = scheduler.next(currentCard, now, ratingMap[rating]);
  const retrievability =
    result.card.state === State.New
      ? null
      : scheduler.get_retrievability(result.card, now, false);

  return {
    difficulty: result.card.difficulty,
    dueAt: result.card.due.toISOString(),
    elapsedDays: result.log.elapsed_days,
    lapses: result.card.lapses,
    logDueAt: result.log.due.toISOString(),
    nextPayload: fromCard(result.card),
    rating,
    reps: result.card.reps,
    retrievability,
    scheduledDays: result.log.scheduled_days,
    stability: result.card.stability,
    state: reviewStateMap[result.card.state] ?? "review",
  };
}
