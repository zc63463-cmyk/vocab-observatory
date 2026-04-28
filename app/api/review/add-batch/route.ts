import { NextResponse, type NextRequest } from "next/server";
import { buildInitialSchedulerPayload } from "@/lib/review/fsrs-adapter";
import {
  buildBatchReviewInsertPlan,
  uniqueWordIds,
  type BatchReviewWord,
} from "@/lib/review/batch-add";
import { getUserDesiredRetention } from "@/lib/review/settings";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { batchAddToReviewSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const body = batchAddToReviewSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;
  const requestedWordIds = uniqueWordIds(body.data.wordIds);

  const { data: words, error: wordsError } = await supabase
    .from("words")
    .select("id, content_hash")
    .in("id", requestedWordIds)
    .eq("is_deleted", false);

  if (wordsError) {
    throw wordsError;
  }

  const foundWordIds = (words ?? []).map((word) => word.id);
  const existingWordIds = new Set<string>();
  if (foundWordIds.length > 0) {
    const { data: existingProgress, error: existingProgressError } = await supabase
      .from("user_word_progress")
      .select("word_id")
      .eq("user_id", userId)
      .in("word_id", foundWordIds);

    if (existingProgressError) {
      throw existingProgressError;
    }

    for (const progress of existingProgress ?? []) {
      existingWordIds.add(progress.word_id);
    }
  }

  const nowIso = new Date().toISOString();
  const desiredRetention = await getUserDesiredRetention(supabase, userId);
  const initialPayload = buildInitialSchedulerPayload(new Date(nowIso));
  const plan = buildBatchReviewInsertPlan({
    desiredRetention,
    existingWordIds,
    initialPayload,
    nowIso,
    requestedWordIds,
    userId,
    words: (words ?? []) as BatchReviewWord[],
  });

  if (plan.rows.length === 0) {
    return NextResponse.json({
      addedCount: 0,
      alreadyTrackedCount: plan.alreadyTrackedCount,
      notFound: plan.notFound,
      ok: true,
    });
  }

  const { data, error } = await supabase
    .from("user_word_progress")
    .upsert(plan.rows, {
      ignoreDuplicates: true,
      onConflict: "user_id,word_id",
    })
    .select("id, word_id");

  if (error) {
    throw error;
  }

  const addedCount = data?.length ?? 0;
  const ignoredAsAlreadyTracked = Math.max(0, plan.rows.length - addedCount);

  return NextResponse.json({
    addedCount,
    alreadyTrackedCount: plan.alreadyTrackedCount + ignoredAsAlreadyTracked,
    notFound: plan.notFound,
    ok: true,
  });
}
