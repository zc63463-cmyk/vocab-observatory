import { NextResponse } from "next/server";
import {
  buildReviewQueueBatch,
  REVIEW_QUEUE_CANDIDATE_LIMIT,
} from "@/lib/review/queue";
import { getOrCreateReviewSession } from "@/lib/review/session";
import { requireOwnerApiSession } from "@/lib/request-auth";
import type { ReviewQueueItem, StoredSchedulerCard } from "@/lib/review/types";

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const supabase = ownerSession.supabase!;
  const session = await getOrCreateReviewSession(supabase, ownerSession.user!.id);
  const { count, data, error } = await supabase
    .from("user_word_progress")
    .select(
      "id, word_id, state, review_count, due_at, desired_retention, scheduler_payload, content_hash_snapshot, words!inner(slug, title, lemma, ipa, short_definition, definition_md, metadata)",
      { count: "exact" },
    )
    .eq("user_id", ownerSession.user!.id)
    .neq("state", "suspended")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(REVIEW_QUEUE_CANDIDATE_LIMIT);

  if (error) {
    throw error;
  }

  const rawRows = (data ?? []) as unknown as Array<{
    content_hash_snapshot: string | null;
    desired_retention: number | null;
    due_at: string | null;
    id: string;
    review_count: number;
    scheduler_payload: StoredSchedulerCard | null;
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
  }>;

  const batch = buildReviewQueueBatch(rawRows);
  const dueToday = count ?? rawRows.length;
  const newCards = rawRows.filter((row) => row.state === "new").length;
  const items = batch.items.map(({ item: row, priority }): ReviewQueueItem => ({
    content_hash_snapshot: row.content_hash_snapshot,
    definition_md: row.words.definition_md,
    due_at: row.due_at,
    ipa: row.words.ipa,
    is_new: row.state === "new",
    lemma: row.words.lemma,
    metadata: row.words.metadata as ReviewQueueItem["metadata"],
    progress_id: row.id,
    queue_bucket: priority.bucket,
    queue_label: priority.label,
    queue_reason: priority.reason,
    retrievability: priority.retrievability,
    review_count: row.review_count,
    short_definition: row.words.short_definition,
    slug: row.words.slug,
    state: row.state,
    title: row.words.title,
    word_id: row.word_id,
  }));

  return NextResponse.json({
    items,
    session,
    stats: {
      completed: session.cards_seen,
      deferredNewCards: batch.deferredNewCards,
      dueToday,
      newCards,
      remaining: dueToday,
    },
  });
}
