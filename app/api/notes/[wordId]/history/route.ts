import { NextResponse, type NextRequest } from "next/server";
import { isNoteRevisionsRelationMissing } from "@/lib/notes";
import { requireOwnerApiSession } from "@/lib/request-auth";

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
    .from("note_revisions")
    .select("id, version, content_md, created_at")
    .eq("word_id", wordId)
    .eq("user_id", ownerSession.user!.id)
    .order("version", { ascending: false })
    .limit(8);

  if (isNoteRevisionsRelationMissing(error)) {
    return NextResponse.json({
      revisions: [],
    });
  }

  if (error) {
    throw error;
  }

  return NextResponse.json({
    revisions: data ?? [],
  });
}
