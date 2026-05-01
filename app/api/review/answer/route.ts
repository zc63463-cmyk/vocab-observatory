import { NextResponse, type NextRequest } from "next/server";
import { applyReviewAnswer } from "@/lib/review/fsrs-adapter";
import { getUserFsrsWeights } from "@/lib/review/settings";
import type { StoredSchedulerCard } from "@/lib/review/types";
import { incrementSessionCardsSeen } from "@/lib/review/session";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewAnswerSchema } from "@/lib/validation/schemas";
import type { Database, Json } from "@/types/database.types";
import { asJson } from "@/types/database.types";

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
      "id, word_id, again_count, desired_retention, easy_count, good_count, hard_count, lapse_count, review_count, scheduler_payload, difficulty, due_at, interval_days, last_reviewed_at, last_rating, retrievability, stability, state, content_hash_snapshot, words!inner(content_hash)",
    )
    .eq("id", parsed.data.progressId)
    .single();

  if (progressError) {
    throw progressError;
  }

  // Supabase returns a flat row with a nested join — define the shape we actually selected
  interface ProgressWithContentHash {
    again_count: number;
    content_hash_snapshot: string | null;
    desired_retention: number;
    difficulty: number | null;
    due_at: string | null;
    easy_count: number;
    good_count: number;
    hard_count: number;
    id: string;
    interval_days: number | null;
    lapse_count: number;
    last_rating: string | null;
    last_reviewed_at: string | null;
    retrievability: number | null;
    review_count: number;
    scheduler_payload: Json;
    stability: number | null;
    state: string;
    word_id: string;
    words: { content_hash: string };
  }

  const progress = progressData as unknown as ProgressWithContentHash;

  // Personalised weights are loaded once per request — passing null falls
  // back to ts-fsrs defaults, which is correct for users who haven't trained.
  // A failure reading the weights must NOT block rating persistence: the
  // user's answer is the critical path, personalisation is a nicety. On
  // error we log and proceed with defaults.
  let fsrsWeights: Awaited<ReturnType<typeof getUserFsrsWeights>> = null;
  try {
    fsrsWeights = await getUserFsrsWeights(supabase, ownerSession.user!.id);
  } catch (error) {
    console.warn(
      "[review/answer] failed to load personalised weights, falling back to defaults:",
      error,
    );
  }

  const now = new Date();
  const scheduling = applyReviewAnswer(
    progress.scheduler_payload as StoredSchedulerCard | null,
    parsed.data.rating,
    now,
    progress.desired_retention,
    fsrsWeights?.weights ?? null,
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
    scheduler_payload: asJson(scheduling.nextPayload),
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

  const previousSnapshot = {
    scheduler_payload: progress.scheduler_payload,
    difficulty: progress.difficulty,
    due_at: progress.due_at,
    interval_days: progress.interval_days,
    lapse_count: progress.lapse_count,
    last_rating: progress.last_rating,
    last_reviewed_at: progress.last_reviewed_at,
    retrievability: progress.retrievability,
    review_count: progress.review_count,
    stability: progress.stability,
    state: progress.state,
    again_count: progress.again_count,
    hard_count: progress.hard_count,
    good_count: progress.good_count,
    easy_count: progress.easy_count,
    content_hash_snapshot: progress.content_hash_snapshot,
  };

  const { data: logData, error: logError } = await supabase.from("review_logs").insert({
    difficulty: scheduling.difficulty,
    due_at: scheduling.logDueAt,
    elapsed_days: scheduling.elapsedDays,
    metadata: {
      desired_retention: progress.desired_retention,
      progress_id: progress.id,
      retrievability: scheduling.retrievability,
    },
    previous_progress_snapshot: previousSnapshot as unknown as Json,
    progress_id: progress.id,
    rating: parsed.data.rating,
    reviewed_at: nowIso,
    scheduled_days: scheduling.scheduledDays,
    stability: scheduling.stability,
    state: scheduling.state,
    user_id: ownerSession.user!.id,
    word_id: progress.word_id,
  }).select("id").single();

  if (logError) {
    throw logError;
  }

  await incrementSessionCardsSeen(supabase, parsed.data.sessionId);

  return NextResponse.json({
    ok: true,
    nextDueAt: scheduling.dueAt,
    state: scheduling.state,
    reviewLogId: logData.id,
  });
}
