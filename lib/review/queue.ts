import {
  DEFAULT_DESIRED_RETENTION,
  getCurrentRetrievability,
} from "@/lib/review/fsrs-adapter";
import type {
  ReviewQueuePriorityBucket,
  StoredSchedulerCard,
} from "@/lib/review/types";

export const REVIEW_QUEUE_BATCH_LIMIT = 20;
export const REVIEW_QUEUE_CANDIDATE_LIMIT = 200;
const MAX_NEW_CARDS_PER_BATCH = 8;
const MAX_NEW_CARD_SHARE = 0.4;

export interface ReviewQueueCandidate {
  desired_retention: number | null;
  due_at: string | null;
  review_count: number;
  scheduler_payload: StoredSchedulerCard | null;
  state: string;
}

export interface ReviewQueuePriorityDetails {
  bucket: ReviewQueuePriorityBucket;
  label: string;
  reason: string;
  retrievability: number | null;
}

export interface PrioritizedReviewQueueCandidate<T extends ReviewQueueCandidate> {
  item: T;
  priority: ReviewQueuePriorityDetails;
}

export interface ReviewQueueBatch<T extends ReviewQueueCandidate> {
  deferredNewCards: number;
  items: PrioritizedReviewQueueCandidate<T>[];
}

interface QueuePrioritySnapshot {
  bucket: ReviewQueuePriorityBucket;
  dueTimestamp: number;
  label: string;
  overdueMs: number;
  reason: string;
  retrievabilityRisk: number;
  retrievability: number | null;
  reviewCount: number;
  stateRank: number;
}

function getStateRank(state: string) {
  switch (state) {
    case "learning":
    case "relearning":
      return 0;
    case "review":
      return 1;
    case "new":
      return 2;
    default:
      return 3;
  }
}

function getDueTimestamp(dueAt: string | null) {
  if (!dueAt) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = new Date(dueAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function formatOverdueWindow(overdueMs: number) {
  if (overdueMs < 60 * 60 * 1000) {
    return "<1h";
  }

  if (overdueMs < 24 * 60 * 60 * 1000) {
    return `${Math.round(overdueMs / (60 * 60 * 1000))}h`;
  }

  return `${Math.round(overdueMs / (24 * 60 * 60 * 1000))}d`;
}

function formatRecallPercent(retrievability: number) {
  return `${Math.max(0, Math.min(100, Math.round(retrievability * 100)))}%`;
}

function describeQueuePriority(
  candidate: ReviewQueueCandidate,
  overdueMs: number,
  retrievability: number | null,
): Pick<
  QueuePrioritySnapshot,
  "bucket" | "label" | "reason" | "retrievability"
> {
  if (candidate.state === "learning" || candidate.state === "relearning") {
    return {
      bucket: "learning",
      label: candidate.state === "relearning" ? "Relearning" : "Learning",
      reason: "Short-step card surfaced before mature reviews.",
      retrievability,
    };
  }

  if (candidate.state === "new") {
    return {
      bucket: "new",
      label: "New card",
      reason: "New cards are introduced in smaller batches behind active reviews.",
      retrievability: null,
    };
  }

  if (typeof retrievability === "number" && retrievability <= 0.6) {
    return {
      bucket: "at-risk",
      label: "At risk",
      reason:
        overdueMs > 0
          ? `Predicted recall ${formatRecallPercent(retrievability)} and overdue ${formatOverdueWindow(overdueMs)}.`
          : `Predicted recall ${formatRecallPercent(retrievability)}.`,
      retrievability,
    };
  }

  return {
    bucket: "overdue",
    label: "Scheduled review",
    reason:
      overdueMs > 0
        ? `Due ${formatOverdueWindow(overdueMs)} ago.`
        : "Due now.",
    retrievability,
  };
}

function getQueuePrioritySnapshot(
  candidate: ReviewQueueCandidate,
  now = new Date(),
): QueuePrioritySnapshot {
  const dueTimestamp = getDueTimestamp(candidate.due_at);
  const nowTimestamp = now.getTime();
  const overdueMs =
    Number.isFinite(dueTimestamp) && dueTimestamp !== Number.POSITIVE_INFINITY
      ? Math.max(nowTimestamp - dueTimestamp, 0)
      : 0;
  const retrievability = getCurrentRetrievability(
    candidate.scheduler_payload,
    candidate.desired_retention ?? DEFAULT_DESIRED_RETENTION,
    now,
  );
  const details = describeQueuePriority(candidate, overdueMs, retrievability);

  return {
    bucket: details.bucket,
    dueTimestamp,
    label: details.label,
    overdueMs,
    reason: details.reason,
    retrievabilityRisk:
      typeof retrievability === "number" && Number.isFinite(retrievability)
        ? 1 - retrievability
        : 0,
    retrievability: details.retrievability,
    reviewCount: candidate.review_count,
    stateRank: getStateRank(candidate.state),
  };
}

function sortScoredReviewQueueItems<T extends ReviewQueueCandidate>(
  items: Array<{ item: T; priority: QueuePrioritySnapshot }>,
) {
  return items
    .sort((left, right) => {
      if (left.priority.stateRank !== right.priority.stateRank) {
        return left.priority.stateRank - right.priority.stateRank;
      }

      if (
        left.priority.retrievabilityRisk !== right.priority.retrievabilityRisk
      ) {
        return (
          right.priority.retrievabilityRisk - left.priority.retrievabilityRisk
        );
      }

      if (left.priority.overdueMs !== right.priority.overdueMs) {
        return right.priority.overdueMs - left.priority.overdueMs;
      }

      if (left.priority.dueTimestamp !== right.priority.dueTimestamp) {
        return left.priority.dueTimestamp - right.priority.dueTimestamp;
      }

      return left.priority.reviewCount - right.priority.reviewCount;
    });
}

function getMaxNewCardsPerBatch(limit: number) {
  return Math.max(
    1,
    Math.min(MAX_NEW_CARDS_PER_BATCH, Math.ceil(limit * MAX_NEW_CARD_SHARE)),
  );
}

function scoreReviewQueueItems<T extends ReviewQueueCandidate>(
  items: T[],
  now = new Date(),
) {
  return sortScoredReviewQueueItems(
    items.map((item) => ({
      item,
      priority: getQueuePrioritySnapshot(item, now),
    })),
  );
}

export function prioritizeReviewQueueItems<T extends ReviewQueueCandidate>(
  items: T[],
  now = new Date(),
) {
  return scoreReviewQueueItems(items, now).map(({ item }) => item);
}

export function buildReviewQueueBatch<T extends ReviewQueueCandidate>(
  items: T[],
  now = new Date(),
  limit = REVIEW_QUEUE_BATCH_LIMIT,
): ReviewQueueBatch<T> {
  const sorted = scoreReviewQueueItems(items, now);
  const maxNewCards = getMaxNewCardsPerBatch(limit);
  const selected: PrioritizedReviewQueueCandidate<T>[] = [];
  let selectedNewCards = 0;

  for (const entry of sorted) {
    if (selected.length >= limit) {
      break;
    }

    if (entry.item.state === "new" && selectedNewCards >= maxNewCards) {
      continue;
    }

    if (entry.item.state === "new") {
      selectedNewCards += 1;
    }

    selected.push({
      item: entry.item,
      priority: {
        bucket: entry.priority.bucket,
        label: entry.priority.label,
        reason: entry.priority.reason,
        retrievability: entry.priority.retrievability,
      },
    });
  }

  const totalNewCards = sorted.filter((entry) => entry.item.state === "new").length;

  return {
    deferredNewCards: Math.max(totalNewCards - selectedNewCards, 0),
    items: selected,
  };
}
