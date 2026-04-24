import { NextResponse, type NextRequest } from "next/server";
import { isNoteRevisionsRelationMissing } from "@/lib/notes";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { noteSchema } from "@/lib/validation/schemas";

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
    .from("notes")
    .select("content_md, updated_at, version")
    .eq("word_id", wordId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    contentMd: data?.content_md ?? "",
    updatedAt: data?.updated_at ?? null,
    version: data?.version ?? 0,
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ wordId: string }> },
) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = noteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { wordId } = await context.params;
  const supabase = ownerSession.supabase!;
  const { data: current, error: currentError } = await supabase
    .from("notes")
    .select("id, version, content_md")
    .eq("word_id", wordId)
    .maybeSingle();

  if (currentError) {
    throw currentError;
  }

  const hasChanged = current?.content_md !== parsed.data.contentMd;
  const nextVersion = hasChanged ? (current?.version ?? 0) + 1 : (current?.version ?? 0);
  const { data, error } = await supabase
    .from("notes")
    .upsert(
      {
        content_md: parsed.data.contentMd,
        id: current?.id,
        updated_at: new Date().toISOString(),
        user_id: ownerSession.user!.id,
        version: nextVersion || 1,
        word_id: wordId,
      },
      {
        onConflict: "user_id,word_id",
      },
    )
    .select("id, updated_at, version")
    .single();

  if (error) {
    throw error;
  }

  if (hasChanged || !current) {
    const { error: revisionError } = await supabase.from("note_revisions").insert({
      content_md: parsed.data.contentMd,
      note_id: data.id,
      user_id: ownerSession.user!.id,
      version: data.version,
      word_id: wordId,
    });

    if (revisionError && !isNoteRevisionsRelationMissing(revisionError)) {
      throw revisionError;
    }
  }

  return NextResponse.json({
    ok: true,
    updatedAt: data.updated_at,
    version: data.version,
  });
}
