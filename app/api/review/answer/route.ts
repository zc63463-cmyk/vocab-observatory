import { NextResponse, type NextRequest } from "next/server";
import { applyReviewAnswer } from "@/lib/review/fsrs-adapter";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewAnswerSchema } from "@/lib/validation/schemas";
import type { Database, Json } from "@/types/database.types";

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = reviewAnswerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const supabase = ownerSession.supabase!;
  const { data: progressData, error: progressError } = await supabase
    .from("user_word_progress")
    .select(
      "id, word_id, again_count, easy_count, good_count, hard_count, lapse_count, review_count, scheduler_payload, words!inner(content_hash)",
    )
    .eq("id", parsed.data.progressId)
    .single();

  if (progressError) {
    throw progressError;
  }

  const progress = progressData as unknown as {
    again_count: number;
    easy_count: number;
    good_count: number;
    hard_count: number;
    id: string;
    lapse_count: number;
    review_count: number;
    scheduler_payload: unknown;
    word_id: string;
    words: { content_hash: string };
  };

  const now = new Date();
  const scheduling = applyReviewAnswer(
    progress.scheduler_payload as never,
    parsed.data.rating,
    now,
  );
  const nowIso = now.toISOString();
  const counterField = `${parsed.data.rating}_count` as
    | "again_count"
    | "hard_count"
    | "good_count"
    | "easy_count";

  const updatePayload: Database["public"]["Tables"]["user_word_progress"]["Update"] = {
    content_hash_snapshot: progress.words.content_hash,
    difficulty: scheduling.difficulty,
    due_at: scheduling.dueAt,
    interval_days: scheduling.scheduledDays,
    lapse_count: progress.lapse_count + (parsed.data.rating === "again" ? 1 : 0),
    last_rating: parsed.data.rating,
    last_reviewed_at: nowIso,
    retrievability: scheduling.retrievability,
    review_count: progress.review_count + 1,
    scheduler_payload: scheduling.nextPayload as unknown as Json,
    stability: scheduling.stability,
    state: scheduling.state,
    updated_at: nowIso,
  };
  updatePayload[counterField] = progress[counterField] + 1;

  const { error: updateError } = await supabase
    .from("user_word_progress")
    .update(updatePayload)
    .eq("id", progress.id);

  if (updateError) {
    throw updateError;
  }

  const { error: logError } = await supabase.from("review_logs").insert({
    difficulty: scheduling.difficulty,
    due_at: scheduling.logDueAt,
    elapsed_days: scheduling.elapsedDays,
    metadata: {
      progress_id: progress.id,
      retrievability: scheduling.retrievability,
    },
    rating: parsed.data.rating,
    reviewed_at: nowIso,
    scheduled_days: scheduling.scheduledDays,
    stability: scheduling.stability,
    state: scheduling.state,
    user_id: ownerSession.user!.id,
    word_id: progress.word_id,
  });

  if (logError) {
    throw logError;
  }

  return NextResponse.json({
    ok: true,
    nextDueAt: scheduling.dueAt,
    state: scheduling.state,
  });
}
