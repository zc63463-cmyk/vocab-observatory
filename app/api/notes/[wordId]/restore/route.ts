import { NextResponse, type NextRequest } from "next/server";
import { isNoteRevisionsRelationMissing } from "@/lib/notes";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { noteRestoreSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ wordId: string }> },
) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = noteRestoreSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { wordId } = await context.params;
  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;

  const { data: revision, error: revisionError } = await supabase
    .from("note_revisions")
    .select("id, note_id, content_md, version")
    .eq("id", parsed.data.revisionId)
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();

  if (isNoteRevisionsRelationMissing(revisionError)) {
    return NextResponse.json(
      { error: "当前数据库未启用笔记历史恢复能力。" },
      { status: 409 },
    );
  }

  if (revisionError) {
    throw revisionError;
  }

  if (!revision) {
    return NextResponse.json({ error: "未找到可恢复的历史版本。" }, { status: 404 });
  }

  const { data: note, error: noteError } = await supabase
    .from("notes")
    .select("id, version")
    .eq("word_id", wordId)
    .eq("user_id", userId)
    .single();

  if (noteError) {
    throw noteError;
  }

  const nextVersion = note.version + 1;
  const updatedAt = new Date().toISOString();
  const { data: restoredNote, error: restoreError } = await supabase
    .from("notes")
    .update({
      content_md: revision.content_md,
      updated_at: updatedAt,
      version: nextVersion,
    })
    .eq("id", note.id)
    .eq("user_id", userId)
    .select("content_md, updated_at, version")
    .single();

  if (restoreError) {
    throw restoreError;
  }

  const { error: insertRevisionError } = await supabase.from("note_revisions").insert({
    content_md: revision.content_md,
    note_id: note.id,
    user_id: userId,
    version: nextVersion,
    word_id: wordId,
  });

  if (insertRevisionError && !isNoteRevisionsRelationMissing(insertRevisionError)) {
    throw insertRevisionError;
  }

  return NextResponse.json({
    contentMd: restoredNote.content_md,
    ok: true,
    restoredFromVersion: revision.version,
    updatedAt: restoredNote.updated_at,
    version: restoredNote.version,
  });
}
