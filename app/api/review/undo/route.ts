import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewUndoSchema } from "@/lib/validation/schemas";
import type { ReviewQueueItem } from "@/lib/review/types";

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

  // Call atomic RPC function (Fix-1, Fix-3)
  // All operations (progress restore, log mark undone, session decrement) are in one transaction
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "undo_review_log",
    {
      p_review_log_id: parsed.data.reviewLogId,
      p_user_id: userId,
      p_session_id: parsed.data.sessionId,
    }
  );

  if (rpcError) {
    return NextResponse.json(
      { error: "撤销操作失败: " + rpcError.message },
      { status: 500 },
    );
  }

  // RPC returns an array with one row
  const result = rpcResult?.[0];
  if (!result) {
    return NextResponse.json(
      { error: "撤销操作返回无效结果" },
      { status: 500 },
    );
  }

  if (!result.out_success) {
    // Map error messages to appropriate status codes
    const message = result.out_error_message || "撤销失败";
    let status = 400;
    if (message.includes("找不到")) status = 404;
    else if (message.includes("无权")) status = 403;
    else if (message.includes("已被撤销") || message.includes("只能撤销")) status = 409;
    else if (message.includes("快照") || message.includes("进度关联")) status = 422;

    return NextResponse.json({ error: message }, { status });
  }

  // Fetch restored card data to return as ReviewQueueItem
  if (!result.out_progress_id) {
    // Should not happen since RPC validated this, but guard against null
    return NextResponse.json({ ok: true, restoredItem: null });
  }

  const { data: restoredProgress, error: fetchError } = await supabase
    .from("user_word_progress")
    .select(
      "id, word_id, state, review_count, due_at, content_hash_snapshot, scheduler_payload, words!inner(slug, title, lemma, lang_code, ipa, short_definition, definition_md, metadata)",
    )
    .eq("id", result.out_progress_id)
    .single();

  if (fetchError || !restoredProgress) {
    // Undo succeeded but couldn't fetch display data — still a success
    return NextResponse.json({ ok: true, restoredItem: null });
  }

  // Runtime validation of scheduler_payload (Fix-4 partial check)
  const payload = restoredProgress.scheduler_payload as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    console.warn("Invalid scheduler_payload after undo for progress:", result.out_progress_id);
  }

  const row = restoredProgress as unknown as {
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
      lang_code: string;
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
    lang_code: row.words.lang_code ?? "en",
    slug: row.words.slug,
    state: row.state,
    title: row.words.title,
    word_id: row.word_id,
    previewExamples: [],
  };

  return NextResponse.json({ ok: true, restoredItem });
}
