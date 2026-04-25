import type { SupabaseClient } from "@supabase/supabase-js";
import { isNoteRevisionsRelationMissing } from "@/lib/notes";
import {
  serializeOwnerWordProgress,
  type OwnerWordProgressSummary,
} from "@/lib/words";
import type { Database } from "@/types/database.types";

type ServerSupabaseClient = SupabaseClient<Database>;

export interface OwnerWordSidebarNoteSnapshot {
  contentMd: string;
  updatedAt: string | null;
  version: number;
}

export interface OwnerWordSidebarRevision {
  content_md: string;
  created_at: string;
  id: string;
  version: number;
}

export interface OwnerWordSidebarResponse {
  history: OwnerWordSidebarRevision[];
  note: OwnerWordSidebarNoteSnapshot;
  progress: OwnerWordProgressSummary | null;
}

export async function getOwnerWordSidebarData(
  supabase: ServerSupabaseClient,
  userId: string,
  wordId: string,
): Promise<OwnerWordSidebarResponse> {
  const [progressResult, noteResult, historyResult] = await Promise.all([
    supabase
      .from("user_word_progress")
      .select("id, due_at, review_count, state, last_reviewed_at")
      .eq("user_id", userId)
      .eq("word_id", wordId)
      .maybeSingle(),
    supabase
      .from("notes")
      .select("content_md, updated_at, version")
      .eq("user_id", userId)
      .eq("word_id", wordId)
      .maybeSingle(),
    supabase
      .from("note_revisions")
      .select("id, version, content_md, created_at")
      .eq("user_id", userId)
      .eq("word_id", wordId)
      .order("version", { ascending: false })
      .limit(8),
  ]);

  if (progressResult.error) {
    throw progressResult.error;
  }

  if (noteResult.error) {
    throw noteResult.error;
  }

  if (historyResult.error && !isNoteRevisionsRelationMissing(historyResult.error)) {
    throw historyResult.error;
  }

  return {
    history: isNoteRevisionsRelationMissing(historyResult.error)
      ? []
      : (historyResult.data ?? []),
    note: {
      contentMd: noteResult.data?.content_md ?? "",
      updatedAt: noteResult.data?.updated_at ?? null,
      version: noteResult.data?.version ?? 0,
    },
    progress: progressResult.data ? serializeOwnerWordProgress(progressResult.data) : null,
  };
}
