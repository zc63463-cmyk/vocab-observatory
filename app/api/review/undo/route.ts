import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewUndoSchema } from "@/lib/validation/schemas";
import type { Json, ReviewRating } from "@/types/database.types";
import type { ReviewQueueItem } from "@/lib/review/types";

interface PreviousProgressSnapshot {
  scheduler_payload: Json;
  difficulty: number | null;
  due_at: string | null;
  interval_days: number | null;
  lapse_count: number;
  last_rating: string | null;
  last_reviewed_at: string | null;
  retrievability: number | null;
  review_count: number;
  stability: number | null;
  state: string;
  again_count: number;
  hard_count: number;
  good_count: number;
  easy_count: number;
  content_hash_snapshot: string | null;
}

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = reviewUndoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;

  // 1. Fetch the review log entry
  const { data: logEntry, error: logError } = await supabase
    .from("review_logs")
    .select("id, user_id, word_id, progress_id, undone, previous_progress_snapshot, rating")
    .eq("id", parsed.data.reviewLogId)
    .single();

  if (logError) {
    return NextResponse.json(
      { error: "找不到该评分记录" },
      { status: 404 },
    );
  }

  // 2. Security checks
  if (logEntry.user_id !== userId) {
    return NextResponse.json(
      { error: "无权撤销此评分" },
      { status: 403 },
    );
  }

  if (logEntry.undone) {
    return NextResponse.json(
      { error: "该评分已被撤销" },
      { status: 409 },
    );
  }

  if (!logEntry.previous_progress_snapshot) {
    return NextResponse.json(
      { error: "该评分记录不支持撤销（无快照）" },
      { status: 422 },
    );
  }

  if (!logEntry.progress_id) {
    return NextResponse.json(
      { error: "该评分记录缺少进度关联" },
      { status: 422 },
    );
  }

  // 3. Verify this is the most recent non-undone log for this progress
  const { data: latestLog, error: latestError } = await supabase
    .from("review_logs")
    .select("id")
    .eq("progress_id", logEntry.progress_id)
    .eq("undone", false)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .single();

  if (latestError || !latestLog || latestLog.id !== logEntry.id) {
    return NextResponse.json(
      { error: "只能撤销最近一次评分" },
      { status: 409 },
    );
  }

  // 4. Restore progress from snapshot
  const snapshot = logEntry.previous_progress_snapshot as unknown as PreviousProgressSnapshot;

  const { error: restoreError } = await supabase
    .from("user_word_progress")
    .update({
      scheduler_payload: snapshot.scheduler_payload,
      difficulty: snapshot.difficulty,
      due_at: snapshot.due_at,
      interval_days: snapshot.interval_days,
      lapse_count: snapshot.lapse_count,
      last_rating: snapshot.last_rating as ReviewRating | null,
      last_reviewed_at: snapshot.last_reviewed_at,
      retrievability: snapshot.retrievability,
      review_count: snapshot.review_count,
      stability: snapshot.stability,
      state: snapshot.state,
      again_count: snapshot.again_count,
      hard_count: snapshot.hard_count,
      good_count: snapshot.good_count,
      easy_count: snapshot.easy_count,
      content_hash_snapshot: snapshot.content_hash_snapshot,
      updated_at: new Date().toISOString(),
    })
    .eq("id", logEntry.progress_id);

  if (restoreError) {
    throw restoreError;
  }

  // 5. Mark log as undone
  const { error: markError } = await supabase
    .from("review_logs")
    .update({
      undone: true,
      undone_at: new Date().toISOString(),
    })
    .eq("id", logEntry.id);

  if (markError) {
    throw markError;
  }

  // 6. Decrement session cards_seen
  const { data: sessionData, error: sessionFetchError } = await supabase
    .from("sessions")
    .select("cards_seen")
    .eq("id", parsed.data.sessionId)
    .single();

  if (!sessionFetchError && sessionData) {
    await supabase
      .from("sessions")
      .update({
        cards_seen: Math.max(0, sessionData.cards_seen - 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.sessionId);
  }

  // 7. Fetch restored card data to return as ReviewQueueItem
  const { data: restoredProgress, error: fetchError } = await supabase
    .from("user_word_progress")
    .select(
      "id, word_id, state, review_count, due_at, content_hash_snapshot, scheduler_payload, words!inner(slug, title, lemma, ipa, short_definition, definition_md, metadata)",
    )
    .eq("id", logEntry.progress_id)
    .single();

  if (fetchError || !restoredProgress) {
    // Rollback succeeded but couldn't fetch display data — still a success
    return NextResponse.json({ ok: true, restoredItem: null });
  }

  const row = restoredProgress as {
    content_hash_snapshot: string | null;
    due_at: string | null;
    id: string;
    review_count: number;
    scheduler_payload: unknown;
    state: string;
    word_id: string;
    words: {
      definition_md: string;
      ipa: string | null;
      lemma: string;
      metadata: unknown;
      short_definition: string | null;
      slug: string;
      title: string;
    };
  };

  const restoredItem: ReviewQueueItem = {
    content_hash_snapshot: row.content_hash_snapshot,
    definition_md: row.words.definition_md,
    due_at: row.due_at,
    ipa: row.words.ipa,
    is_new: row.state === "new",
    lemma: row.words.lemma,
    metadata: row.words.metadata as ReviewQueueItem["metadata"],
    progress_id: row.id,
    queue_bucket: "learning",
    queue_label: "撤销恢复",
    queue_reason: "已撤销上次评分",
    retrievability: null,
    review_count: row.review_count,
    short_definition: row.words.short_definition,
    slug: row.words.slug,
    state: row.state,
    title: row.words.title,
    word_id: row.word_id,
  };

  return NextResponse.json({ ok: true, restoredItem });
}
