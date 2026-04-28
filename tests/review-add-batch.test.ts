import { describe, expect, it } from "vitest";
import { buildBatchReviewInsertPlan, uniqueWordIds } from "@/lib/review/batch-add";

const wordA = "00000000-0000-4000-8000-000000000001";
const wordB = "00000000-0000-4000-8000-000000000002";
const wordC = "00000000-0000-4000-8000-000000000003";
const missingWord = "00000000-0000-4000-8000-000000000099";
const userId = "00000000-0000-4000-8000-100000000001";

describe("batch review add helpers", () => {
  it("deduplicates requested word ids while preserving order", () => {
    expect(uniqueWordIds([wordA, wordB, wordA, wordC])).toEqual([wordA, wordB, wordC]);
  });

  it("builds insert rows only for words that are not already tracked", () => {
    const plan = buildBatchReviewInsertPlan({
      desiredRetention: 0.9,
      existingWordIds: new Set([wordA]),
      initialPayload: { due: "now" },
      nowIso: "2026-04-28T00:00:00.000Z",
      requestedWordIds: [wordA, wordB, missingWord],
      userId,
      words: [
        { content_hash: "hash-a", id: wordA },
        { content_hash: "hash-b", id: wordB },
      ],
    });

    expect(plan.alreadyTrackedCount).toBe(1);
    expect(plan.notFound).toEqual([missingWord]);
    expect(plan.rows).toEqual([
      {
        content_hash_snapshot: "hash-b",
        desired_retention: 0.9,
        due_at: "2026-04-28T00:00:00.000Z",
        schedule_algo: "fsrs",
        scheduler_payload: { due: "now" },
        state: "new",
        updated_at: "2026-04-28T00:00:00.000Z",
        user_id: userId,
        word_id: wordB,
      },
    ]);
  });

  it("does not create rows when every existing word is already tracked", () => {
    const plan = buildBatchReviewInsertPlan({
      desiredRetention: 0.95,
      existingWordIds: new Set([wordA, wordB]),
      initialPayload: { state: "new" },
      nowIso: "2026-04-28T01:00:00.000Z",
      requestedWordIds: [wordA, wordB],
      userId,
      words: [
        { content_hash: "hash-a", id: wordA },
        { content_hash: "hash-b", id: wordB },
      ],
    });

    expect(plan).toMatchObject({
      alreadyTrackedCount: 2,
      notFound: [],
      rows: [],
    });
  });
});
