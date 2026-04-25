import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewRejoinSchema } from "@/lib/validation/schemas";
import { serializeOwnerWordProgress } from "@/lib/words";

function restoreStateFromPayload(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "state" in payload &&
    typeof payload.state === "number"
  ) {
    switch (payload.state) {
      case 0:
        return "new";
      case 1:
        return "learning";
      case 2:
        return "review";
      case 3:
        return "relearning";
      default:
        return "review";
    }
  }

  return "review";
}

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = reviewRejoinSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = ownerSession.supabase!;
  const { data: progress, error: fetchError } = await supabase
    .from("user_word_progress")
    .select("id, due_at, review_count, scheduler_payload")
    .eq("id", parsed.data.progressId)
    .eq("user_id", ownerSession.user!.id)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  const now = new Date().toISOString();
  const restoredState =
    progress.review_count === 0
      ? "new"
      : restoreStateFromPayload(progress.scheduler_payload);

  const nextDueAt =
    progress.due_at && new Date(progress.due_at).getTime() > Date.now()
      ? now
      : now;

  const { data, error } = await supabase
    .from("user_word_progress")
    .update({
      due_at: nextDueAt,
      state: restoredState,
      updated_at: now,
    })
    .eq("id", progress.id)
    .select("id, due_at, review_count, state, last_reviewed_at")
    .single();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    ok: true,
    progress: serializeOwnerWordProgress(data),
  });
}
