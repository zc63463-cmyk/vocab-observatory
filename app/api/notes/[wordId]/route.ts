import { NextResponse, type NextRequest } from "next/server";
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
    .select("content_md, updated_at")
    .eq("word_id", wordId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    contentMd: data?.content_md ?? "",
    updatedAt: data?.updated_at ?? null,
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
  const { data: current } = await supabase
    .from("notes")
    .select("version")
    .eq("word_id", wordId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("notes")
    .upsert(
      {
        content_md: parsed.data.contentMd,
        updated_at: new Date().toISOString(),
        user_id: ownerSession.user!.id,
        version: (current?.version ?? 0) + 1,
        word_id: wordId,
      },
      {
        onConflict: "user_id,word_id",
      },
    )
    .select("updated_at")
    .single();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    ok: true,
    updatedAt: data.updated_at,
  });
}
