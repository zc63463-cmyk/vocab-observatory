import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import type { ReviewRating } from "@/types/database.types";
import type { ReviewState, SchedulerUpdate, StoredSchedulerCard } from "@/lib/review/types";

export const DEFAULT_DESIRED_RETENTION = 0.9;
const MIN_DESIRED_RETENTION = 0.7;
const MAX_DESIRED_RETENTION = 0.99;
const schedulerCache = new Map<number, ReturnType<typeof fsrs>>();

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

export function normalizeDesiredRetention(value?: number | null) {
  if (!Number.isFinite(value)) {
    return DEFAULT_DESIRED_RETENTION;
  }

  return Math.min(
    MAX_DESIRED_RETENTION,
    Math.max(MIN_DESIRED_RETENTION, Number(value)),
  );
}

function getScheduler(desiredRetention = DEFAULT_DESIRED_RETENTION) {
  const normalizedRetention = normalizeDesiredRetention(desiredRetention);
  const cacheKey = Number(normalizedRetention.toFixed(3));
  const cached = schedulerCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const scheduler = fsrs({
    maximum_interval: 36500,
    request_retention: cacheKey,
  });
  schedulerCache.set(cacheKey, scheduler);
  return scheduler;
}

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
  desiredRetention = DEFAULT_DESIRED_RETENTION,
  now = new Date(),
) {
  if (!payload) {
    return null;
  }

  const card = toCard(payload);
  if (card.state === State.New) {
    return null;
  }

  return getScheduler(desiredRetention).get_retrievability(card, now, false);
}

export function applyReviewAnswer(
  payload: StoredSchedulerCard | null | undefined,
  rating: ReviewRating,
  now = new Date(),
  desiredRetention = DEFAULT_DESIRED_RETENTION,
): SchedulerUpdate {
  const scheduler = getScheduler(desiredRetention);
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
