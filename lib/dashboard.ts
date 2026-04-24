import { getOwnerUser } from "@/lib/auth";
import { getLatestImportOverview } from "@/lib/imports";
import { getCurrentRetrievability } from "@/lib/review/fsrs-adapter";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import { startOfTodayIso } from "@/lib/utils";

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildVolumeSeries(days: number, logs: Array<{ reviewed_at: string }>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    buckets.set(formatDayKey(date), 0);
  }

  for (const log of logs) {
    const key = log.reviewed_at.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return [...buckets.entries()].map(([date, count]) => ({ count, date }));
}

function calculateStreak(daysSet: Set<string>) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (daysSet.has(formatDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function getDashboardSummary() {
  const [owner, supabase, importOverview] = await Promise.all([
    getOwnerUser(),
    getServerSupabaseClientOrNull(),
    getLatestImportOverview(),
  ]);

  if (!supabase || !owner) {
    return {
      activeSession: null as { cards_seen: number; id: string; started_at: string } | null,
      configured: false,
      forgettingRate30d: 0,
      fsrsForgettingRate: 0,
      importOverview,
      metrics: {
        dueToday: 0,
        notesCount: 0,
        reviewed30d: 0,
        reviewed7d: 0,
        reviewedToday: 0,
        streakDays: 0,
        todayNewCount: 0,
        trackedWords: 0,
      },
      notes: [] as Array<{
        content_md: string;
        updated_at: string;
        version: number;
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
      reviewVolume30d: [] as Array<{ count: number; date: string }>,
      reviewVolume7d: [] as Array<{ count: number; date: string }>,
      weakestSemanticFields: [] as Array<{
        againRate: number;
        name: string;
        total: number;
      }>,
    };
  }

  const today = startOfTodayIso();
  const now = new Date().toISOString();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const yearAgo = new Date();
  yearAgo.setHours(0, 0, 0, 0);
  yearAgo.setDate(yearAgo.getDate() - 364);

  const [
    trackedWordsResult,
    dueTodayResult,
    todayNewResult,
    reviewedTodayResult,
    notesCountResult,
    recentLogsResult,
    notesResult,
    reviewLogs30dResult,
    reviewLogs30dWithWordsResult,
    streakResult,
    activeProgressResult,
    activeSessionResult,
  ] = await Promise.all([
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
      .from("user_word_progress")
      .select("*", { count: "exact", head: true })
      .eq("user_id", owner.id)
      .eq("state", "new")
      .lte("due_at", now),
    supabase
      .from("review_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", owner.id)
      .gte("reviewed_at", today),
    supabase.from("notes").select("*", { count: "exact", head: true }).eq("user_id", owner.id),
    supabase
      .from("review_logs")
      .select("rating, reviewed_at, words(lemma, slug, title)")
      .eq("user_id", owner.id)
      .order("reviewed_at", { ascending: false })
      .limit(8),
    supabase
      .from("notes")
      .select("content_md, updated_at, version, words(lemma, slug, title)")
      .eq("user_id", owner.id)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("review_logs")
      .select("rating, reviewed_at")
      .eq("user_id", owner.id)
      .gte("reviewed_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("review_logs")
      .select("rating, reviewed_at, words(metadata)")
      .eq("user_id", owner.id)
      .gte("reviewed_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("review_logs")
      .select("reviewed_at")
      .eq("user_id", owner.id)
      .gte("reviewed_at", yearAgo.toISOString())
      .order("reviewed_at", { ascending: false }),
    supabase
      .from("user_word_progress")
      .select("scheduler_payload")
      .eq("user_id", owner.id)
      .neq("state", "suspended"),
    supabase
      .from("sessions")
      .select("id, cards_seen, started_at")
      .eq("user_id", owner.id)
      .eq("mode", "review")
      .is("ended_at", null)
      .gte("started_at", today)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const reviewLogs30d = (reviewLogs30dResult.data ?? []) as Array<{
    rating: string;
    reviewed_at: string;
  }>;
  const reviewLogs7d = reviewLogs30d.filter((row) => row.reviewed_at >= sevenDaysAgo.toISOString());

  const ratingDistribution = {
    again: 0,
    easy: 0,
    good: 0,
    hard: 0,
  };
  for (const row of reviewLogs30d) {
    if (row.rating in ratingDistribution) {
      ratingDistribution[row.rating as keyof typeof ratingDistribution] += 1;
    }
  }

  const semanticCounts = new Map<string, { again: number; total: number }>();
  for (const row of (reviewLogs30dWithWordsResult.data ?? []) as Array<{
    rating: string;
    words: { metadata: unknown } | null;
  }>) {
    const metadata = row.words?.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      continue;
    }

    const semanticField =
      "semantic_field" in metadata && typeof metadata.semantic_field === "string"
        ? metadata.semantic_field
        : null;
    if (!semanticField) {
      continue;
    }

    const current = semanticCounts.get(semanticField) ?? { again: 0, total: 0 };
    current.total += 1;
    if (row.rating === "again") {
      current.again += 1;
    }
    semanticCounts.set(semanticField, current);
  }

  const weakestSemanticFields = [...semanticCounts.entries()]
    .filter(([, value]) => value.total >= 5)
    .map(([name, value]) => ({
      againRate: value.again / value.total,
      name,
      total: value.total,
    }))
    .sort((left, right) => {
      if (right.againRate !== left.againRate) {
        return right.againRate - left.againRate;
      }
      return right.total - left.total;
    })
    .slice(0, 3);

  const streakDays = calculateStreak(
    new Set(((streakResult.data ?? []) as Array<{ reviewed_at: string }>).map((row) =>
      row.reviewed_at.slice(0, 10),
    )),
  );

  const retrievabilityValues = ((activeProgressResult.data ?? []) as Array<{
    scheduler_payload: unknown;
  }>)
    .map((row) => getCurrentRetrievability(row.scheduler_payload as never))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const fsrsForgettingRate =
    retrievabilityValues.length > 0
      ? retrievabilityValues.reduce((sum, value) => sum + (1 - value), 0) /
        retrievabilityValues.length
      : 0;

  return {
    activeSession: activeSessionResult.data ?? null,
    configured: true,
    forgettingRate30d: reviewLogs30d.length > 0 ? ratingDistribution.again / reviewLogs30d.length : 0,
    fsrsForgettingRate,
    importOverview,
    metrics: {
      dueToday: dueTodayResult.count ?? 0,
      notesCount: notesCountResult.count ?? 0,
      reviewed30d: reviewLogs30d.length,
      reviewed7d: reviewLogs7d.length,
      reviewedToday: reviewedTodayResult.count ?? 0,
      streakDays,
      todayNewCount: todayNewResult.count ?? 0,
      trackedWords: trackedWordsResult.count ?? 0,
    },
    notes: (notesResult.data ?? []) as Array<{
      content_md: string;
      updated_at: string;
      version: number;
      words: { lemma: string; slug: string; title: string } | null;
    }>,
    ratingDistribution,
    recentLogs: (recentLogsResult.data ?? []) as Array<{
      rating: string;
      reviewed_at: string;
      words: { lemma: string; slug: string; title: string } | null;
    }>,
    reviewVolume30d: buildVolumeSeries(30, reviewLogs30d),
    reviewVolume7d: buildVolumeSeries(7, reviewLogs7d),
    weakestSemanticFields,
  };
}
