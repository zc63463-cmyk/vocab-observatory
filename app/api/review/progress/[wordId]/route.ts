import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { serializeOwnerWordProgress } from "@/lib/words";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ wordId: string }> },
) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const { wordId } = await context.params;
  const { data, error } = await ownerSession.supabase!
    .from("user_word_progress")
    .select(
      "id, due_at, review_count, state, last_reviewed_at, lapse_count, again_count",
    )
    .eq("user_id", ownerSession.user!.id)
    .eq("word_id", wordId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    progress: data ? serializeOwnerWordProgress(data) : null,
  });
}
