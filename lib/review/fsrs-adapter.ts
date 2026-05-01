import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import type { ReviewRating } from "@/types/database.types";
import type { ReviewState, SchedulerUpdate, StoredSchedulerCard } from "@/lib/review/types";

export const DEFAULT_DESIRED_RETENTION = 0.9;
export const MIN_DESIRED_RETENTION = 0.7;
export const MAX_DESIRED_RETENTION = 0.99;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
/**
 * Scheduler cache keyed by the pair (retention, weights-signature). A string
 * key is used instead of the previous `Map<number, ...>` because different
 * users can now supply different `w` arrays; caching by retention alone
 * would cause scheduler instances to silently serve the wrong weights.
 *
 * The signature is a JSON of the rounded weights. Cheap and collision-free
 * for realistic values; avoids depending on a hashing lib.
 */
const schedulerCache = new Map<string, ReturnType<typeof fsrs>>();

function signWeights(weights: readonly number[] | null | undefined): string {
  if (!weights || weights.length === 0) return "default";
  // Round to 6 decimals to keep the key stable across tiny float jitter.
  return weights.map((w) => w.toFixed(6)).join(",");
}

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

function getScheduler(
  desiredRetention = DEFAULT_DESIRED_RETENTION,
  weights?: readonly number[] | null,
) {
  const normalizedRetention = normalizeDesiredRetention(desiredRetention);
  const rounded = Number(normalizedRetention.toFixed(3));
  const cacheKey = `${rounded}|${signWeights(weights)}`;
  const cached = schedulerCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const scheduler = fsrs({
    maximum_interval: 36500,
    request_retention: rounded,
    // Only pass w when the caller has explicit weights; letting ts-fsrs fall
    // back to its built-in defaults is the correct "untrained" behavior.
    ...(weights && weights.length > 0 ? { w: [...weights] } : {}),
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

export function retuneScheduledReviewCard(
  payload: StoredSchedulerCard | null | undefined,
  desiredRetention = DEFAULT_DESIRED_RETENTION,
  now = new Date(),
  weights?: readonly number[] | null,
) {
  if (!payload) {
    return null;
  }

  const card = toCard(payload);
  if (
    card.state !== State.Review ||
    !card.last_review ||
    !Number.isFinite(card.stability) ||
    card.stability <= 0 ||
    !Number.isFinite(card.scheduled_days) ||
    card.scheduled_days < 1
  ) {
    return null;
  }

  const scheduler = getScheduler(desiredRetention, weights);
  const elapsedDays = Number.isFinite(card.elapsed_days)
    ? Math.max(0, card.elapsed_days)
    : Math.max(0, card.scheduled_days);
  const scheduledDays = scheduler.next_interval(card.stability, elapsedDays);
  card.scheduled_days = scheduledDays;
  card.due = new Date(card.last_review.getTime() + scheduledDays * DAY_IN_MS);

  return {
    dueAt: card.due.toISOString(),
    nextPayload: fromCard(card),
    retrievability: scheduler.get_retrievability(card, now, false),
    scheduledDays,
  };
}

export function getCurrentRetrievability(
  payload: StoredSchedulerCard | null | undefined,
  desiredRetention = DEFAULT_DESIRED_RETENTION,
  now = new Date(),
  weights?: readonly number[] | null,
) {
  if (!payload) {
    return null;
  }

  const card = toCard(payload);
  if (card.state === State.New) {
    return null;
  }

  return getScheduler(desiredRetention, weights).get_retrievability(
    card,
    now,
    false,
  );
}

export function applyReviewAnswer(
  payload: StoredSchedulerCard | null | undefined,
  rating: ReviewRating,
  now = new Date(),
  desiredRetention = DEFAULT_DESIRED_RETENTION,
  weights?: readonly number[] | null,
): SchedulerUpdate {
  const scheduler = getScheduler(desiredRetention, weights);
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
