import type { Json, ReviewRating } from "@/types/database.types";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";

export type ReviewState = "new" | "learning" | "review" | "relearning";
export type ReviewQueuePriorityBucket =
  | "learning"
  | "at-risk"
  | "overdue"
  | "new";

export interface StoredSchedulerCard {
  difficulty: number;
  due: string;
  elapsed_days: number;
  lapses: number;
  learning_steps: number;
  last_review: string | null;
  reps: number;
  scheduled_days: number;
  stability: number;
  state: number;
}

export interface ReviewQueueItem {
  content_hash_snapshot: string | null;
  definition_md: string;
  due_at: string | null;
  ipa: string | null;
  is_new: boolean;
  lemma: string;
  metadata: Json;
  progress_id: string;
  queue_bucket: ReviewQueuePriorityBucket;
  queue_label: string;
  queue_reason: string;
  review_count: number;
  retrievability: number | null;
  short_definition: string | null;
  previewExamples: ParsedExample[] | null;
  slug: string;
  state: string;
  title: string;
  word_id: string;
}

export interface ReviewSessionSummary {
  cards_seen: number;
  id: string;
  started_at: string;
}

export interface ReviewQueueStats {
  completed: number;
  deferredNewCards: number;
  dueToday: number;
  newCards: number;
  remaining: number;
}

export interface SchedulerUpdate {
  difficulty: number;
  dueAt: string;
  elapsedDays: number;
  lapses: number;
  logDueAt: string;
  nextPayload: StoredSchedulerCard;
  rating: ReviewRating;
  reps: number;
  retrievability: number | null;
  scheduledDays: number;
  stability: number;
  state: ReviewState;
}
