import {
  DEFAULT_DESIRED_RETENTION,
  getCurrentRetrievability,
} from "@/lib/review/fsrs-adapter";
import type { StoredSchedulerCard } from "@/lib/review/types";

export interface ReviewQueueCandidate {
  desired_retention: number | null;
  due_at: string | null;
  review_count: number;
  scheduler_payload: StoredSchedulerCard | null;
  state: string;
}

interface QueuePrioritySnapshot {
  dueTimestamp: number;
  overdueMs: number;
  retrievabilityRisk: number;
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

  return {
    dueTimestamp,
    overdueMs,
    retrievabilityRisk:
      typeof retrievability === "number" && Number.isFinite(retrievability)
        ? 1 - retrievability
        : 0,
    reviewCount: candidate.review_count,
    stateRank: getStateRank(candidate.state),
  };
}

export function prioritizeReviewQueueItems<T extends ReviewQueueCandidate>(
  items: T[],
  now = new Date(),
) {
  return items
    .map((item) => ({
      item,
      priority: getQueuePrioritySnapshot(item, now),
    }))
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
    })
    .map(({ item }) => item);
}
