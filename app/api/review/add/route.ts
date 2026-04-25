import { NextResponse, type NextRequest } from "next/server";
import { buildInitialSchedulerPayload } from "@/lib/review/fsrs-adapter";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { addToReviewSchema } from "@/lib/validation/schemas";
import { serializeOwnerWordProgress } from "@/lib/words";
import type { Json } from "@/types/database.types";
import { asJson } from "@/types/database.types";

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const body = addToReviewSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      {
        error: body.error.flatten(),
      },
      { status: 400 },
    );
  }

  const supabase = ownerSession.supabase!;
  const { data: word, error: wordError } = await supabase
    .from("words")
    .select("id, content_hash")
    .eq("id", body.data.wordId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (wordError) {
    throw wordError;
  }

  if (!word) {
    return NextResponse.json({ error: "Word not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const initialPayload = buildInitialSchedulerPayload(new Date(now));
  const { data, error } = await supabase
    .from("user_word_progress")
    .upsert(
      {
        content_hash_snapshot: word.content_hash,
        desired_retention: 0.9,
        due_at: now,
        schedule_algo: "fsrs",
        scheduler_payload: asJson(initialPayload),
        state: "new",
        updated_at: now,
        user_id: ownerSession.user!.id,
        word_id: body.data.wordId,
      },
      {
        onConflict: "user_id,word_id",
      },
    )
    .select("id, due_at, review_count, state, last_reviewed_at")
    .single();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    ok: true,
    progress: serializeOwnerWordProgress(data),
    progressId: data.id,
  });
}
