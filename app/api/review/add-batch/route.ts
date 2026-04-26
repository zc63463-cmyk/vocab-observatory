import { NextResponse, type NextRequest } from "next/server";
import {
  buildInitialSchedulerPayload,
} from "@/lib/review/fsrs-adapter";
import { getUserDesiredRetention } from "@/lib/review/settings";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { batchAddToReviewSchema } from "@/lib/validation/schemas";
import { asJson } from "@/types/database.types";

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
  const { wordIds } = body.data;

  // Verify all words exist and are not deleted
  const { data: words, error: wordsError } = await supabase
    .from("words")
    .select("id, content_hash")
    .in("id", wordIds)
    .eq("is_deleted", false);

  if (wordsError) {
    throw wordsError;
  }

  const foundIds = new Set((words ?? []).map((w) => w.id));
  const desiredRetention = await getUserDesiredRetention(
    supabase,
    ownerSession.user!.id,
  );
  const now = new Date().toISOString();
  const initialPayload = buildInitialSchedulerPayload(new Date(now));

  // Only upsert words that exist
  const rows = (words ?? []).map((word) => ({
    content_hash_snapshot: word.content_hash,
    desired_retention: desiredRetention,
    due_at: now,
    schedule_algo: "fsrs",
    scheduler_payload: asJson(initialPayload),
    state: "new" as const,
    updated_at: now,
    user_id: ownerSession.user!.id,
    word_id: word.id,
  }));

  if (rows.length === 0) {
    return NextResponse.json({
      addedCount: 0,
      notFound: wordIds.filter((id) => !foundIds.has(id)),
      ok: true,
    });
  }

  const { data, error } = await supabase
    .from("user_word_progress")
    .upsert(rows, {
      onConflict: "user_id,word_id",
    })
    .select("id, word_id");

  if (error) {
    throw error;
  }

  return NextResponse.json({
    addedCount: data?.length ?? 0,
    notFound: wordIds.filter((id) => !foundIds.has(id)),
    ok: true,
  });
}
