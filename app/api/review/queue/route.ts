import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/lib/request-auth";

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const supabase = ownerSession.supabase!;
  const { data, error } = await supabase
    .from("user_word_progress")
    .select(
      "id, word_id, state, review_count, due_at, content_hash_snapshot, words!inner(slug, title, lemma, ipa, short_definition, definition_md, metadata)",
    )
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(20);

  if (error) {
    throw error;
  }

  const items = ((data ?? []) as Array<{
    content_hash_snapshot: string | null;
    due_at: string | null;
    id: string;
    review_count: number;
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
  }>).map((row) => ({
    content_hash_snapshot: row.content_hash_snapshot,
    definition_md: row.words.definition_md,
    due_at: row.due_at,
    ipa: row.words.ipa,
    lemma: row.words.lemma,
    metadata: row.words.metadata,
    progress_id: row.id,
    review_count: row.review_count,
    short_definition: row.words.short_definition,
    slug: row.words.slug,
    state: row.state,
    title: row.words.title,
    word_id: row.word_id,
  }));

  return NextResponse.json({ items });
}
