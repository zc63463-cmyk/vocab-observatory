import { getOwnerUser } from "@/lib/auth";
import { getLatestImportOverview } from "@/lib/imports";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import { startOfTodayIso } from "@/lib/utils";

function buildLast7DaysVolume(
  logs: Array<{ rating: string; reviewed_at: string }>,
) {
  const buckets = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = date.toISOString().slice(0, 10);
    buckets.set(iso, 0);
  }

  for (const log of logs) {
    const key = log.reviewed_at.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return [...buckets.entries()].map(([date, count]) => ({ count, date }));
}

export async function getDashboardSummary() {
  const [owner, supabase, importOverview] = await Promise.all([
    getOwnerUser(),
    getServerSupabaseClientOrNull(),
    getLatestImportOverview(),
  ]);

  if (!supabase || !owner) {
    return {
      configured: false,
      importOverview,
      metrics: {
        dueToday: 0,
        notesCount: 0,
        reviewed7d: 0,
        reviewedToday: 0,
        trackedWords: 0,
      },
      notes: [] as Array<{
        content_md: string;
        updated_at: string;
        words: { lemma: string; slug: string; title: string } | null;
      }>,
      ratingDistribution: {
        again: 0,
        easy: 0,
        good: 0,
        hard: 0,
      },
      recentLogs: [] as Array<{
        rating: string;
        reviewed_at: string;
        words: { lemma: string; slug: string; title: string } | null;
      }>,
      reviewVolume7d: [] as Array<{ count: number; date: string }>,
    };
  }

  const today = startOfTodayIso();
  const now = new Date().toISOString();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [tracked, due, reviewedToday, notesCount, recentLogs, notes, recentReviewWindow] =
    await Promise.all([
      supabase
        .from("user_word_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", owner.id),
      supabase
        .from("user_word_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", owner.id)
        .lte("due_at", now),
      supabase
        .from("review_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", owner.id)
        .gte("reviewed_at", today),
      supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", owner.id),
      supabase
        .from("review_logs")
        .select("rating, reviewed_at, words(lemma, slug, title)")
        .eq("user_id", owner.id)
        .order("reviewed_at", { ascending: false })
        .limit(8),
      supabase
        .from("notes")
        .select("content_md, updated_at, words(lemma, slug, title)")
        .eq("user_id", owner.id)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("review_logs")
        .select("rating, reviewed_at")
        .eq("user_id", owner.id)
        .gte("reviewed_at", sevenDaysAgo.toISOString()),
    ]);

  const ratingDistribution = {
    again: 0,
    easy: 0,
    good: 0,
    hard: 0,
  };
  for (const row of recentReviewWindow.data ?? []) {
    if (row.rating in ratingDistribution) {
      ratingDistribution[row.rating as keyof typeof ratingDistribution] += 1;
    }
  }

  return {
    configured: true,
    importOverview,
    metrics: {
      dueToday: due.count ?? 0,
      notesCount: notesCount.count ?? 0,
      reviewed7d: (recentReviewWindow.data ?? []).length,
      reviewedToday: reviewedToday.count ?? 0,
      trackedWords: tracked.count ?? 0,
    },
    notes: (notes.data ?? []) as Array<{
      content_md: string;
      updated_at: string;
      words: { lemma: string; slug: string; title: string } | null;
    }>,
    ratingDistribution,
    recentLogs: (recentLogs.data ?? []) as Array<{
      rating: string;
      reviewed_at: string;
      words: { lemma: string; slug: string; title: string } | null;
    }>,
    reviewVolume7d: buildLast7DaysVolume(
      (recentReviewWindow.data ?? []) as Array<{ rating: string; reviewed_at: string }>,
    ),
  };
}
