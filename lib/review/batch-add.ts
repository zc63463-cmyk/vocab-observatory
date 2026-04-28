import { asJson, type Json } from "@/types/database.types";

export interface BatchReviewWord {
  content_hash: string | null;
  id: string;
}

export interface BatchReviewInsertPlanOptions {
  desiredRetention: number;
  existingWordIds: Set<string>;
  initialPayload: unknown;
  nowIso: string;
  requestedWordIds: string[];
  userId: string;
  words: BatchReviewWord[];
}

export interface BatchReviewInsertRow {
  content_hash_snapshot: string | null;
  desired_retention: number;
  due_at: string;
  schedule_algo: "fsrs";
  scheduler_payload: Json;
  state: "new";
  updated_at: string;
  user_id: string;
  word_id: string;
}

export interface BatchReviewInsertPlan {
  alreadyTrackedCount: number;
  notFound: string[];
  rows: BatchReviewInsertRow[];
}

export function uniqueWordIds(wordIds: string[]) {
  return [...new Set(wordIds)];
}

export function buildBatchReviewInsertPlan({
  desiredRetention,
  existingWordIds,
  initialPayload,
  nowIso,
  requestedWordIds,
  userId,
  words,
}: BatchReviewInsertPlanOptions): BatchReviewInsertPlan {
  const requestedIds = uniqueWordIds(requestedWordIds);
  const wordById = new Map(words.map((word) => [word.id, word]));
  const notFound = requestedIds.filter((wordId) => !wordById.has(wordId));
  const alreadyTrackedCount = requestedIds.filter(
    (wordId) => wordById.has(wordId) && existingWordIds.has(wordId),
  ).length;
  const rows = requestedIds
    .map((wordId) => wordById.get(wordId))
    .filter((word): word is BatchReviewWord => Boolean(word))
    .filter((word) => !existingWordIds.has(word.id))
    .map((word) => ({
      content_hash_snapshot: word.content_hash,
      desired_retention: desiredRetention,
      due_at: nowIso,
      schedule_algo: "fsrs" as const,
      scheduler_payload: asJson(initialPayload),
      state: "new" as const,
      updated_at: nowIso,
      user_id: userId,
      word_id: word.id,
    }));

  return {
    alreadyTrackedCount,
    notFound,
    rows,
  };
}
