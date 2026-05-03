import type { SupabaseClient } from "@supabase/supabase-js";
import { isNoteRevisionsRelationMissing } from "@/lib/notes";
import {
  serializeOwnerWordProgress,
  type OwnerWordProgressSummary,
} from "@/lib/words";
import type { Database } from "@/types/database.types";

type ServerSupabaseClient = SupabaseClient<Database>;

const REVIEW_LOG_HISTORY_LIMIT = 60;

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

export interface OwnerWordReviewLogEntry {
  difficulty: number | null;
  elapsed_days: number | null;
  rating: string;
  reviewed_at: string;
  scheduled_days: number | null;
  stability: number | null;
  state: string;
}

export interface OwnerWordSidebarResponse {
  history: OwnerWordSidebarRevision[];
  note: OwnerWordSidebarNoteSnapshot;
  progress: OwnerWordProgressSummary | null;
  reviewLogs: OwnerWordReviewLogEntry[];
}

export async function getOwnerWordSidebarData(
  supabase: ServerSupabaseClient,
  userId: string,
  wordId: string,
): Promise<OwnerWordSidebarResponse> {
  const [progressResult, noteResult, historyResult, reviewLogsResult] = await Promise.all([
    supabase
      .from("user_word_progress")
      .select(
        "id, due_at, review_count, state, last_reviewed_at, lapse_count, again_count",
      )
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
    supabase
      .from("review_logs")
      .select("rating, reviewed_at, scheduled_days, elapsed_days, stability, difficulty, state")
      .eq("user_id", userId)
      .eq("word_id", wordId)
      .eq("undone", false)
      .order("reviewed_at", { ascending: true })
      .limit(REVIEW_LOG_HISTORY_LIMIT),
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

  if (reviewLogsResult.error) {
    throw reviewLogsResult.error;
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
    reviewLogs: (reviewLogsResult.data ?? []) as OwnerWordReviewLogEntry[],
  };
}
