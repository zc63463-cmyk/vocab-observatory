import { getOwnerUser } from "@/lib/auth";
import { getLatestImportOverview } from "@/lib/imports";
import {
  DEFAULT_DESIRED_RETENTION,
  getCurrentRetrievability,
} from "@/lib/review/fsrs-adapter";
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
      averageDesiredRetention: DEFAULT_DESIRED_RETENTION,
      configured: false,
      forgettingRate30d: 0,
      fsrsCalibrationGap30d: 0,
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
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const yearAgo = new Date();
  yearAgo.setHours(0, 0, 0, 0);
  yearAgo.setDate(yearAgo.getDate() - 364);

  // ── Optimized: 6 parallel queries instead of 12 ──
  // Merged review_logs queries: 3 → 1 (fetch 30d with words, derive 7d/30d/rating from it)
  // Merged user_word_progress count queries: 3 → 1 (fetch all progress, count in-memory)
  const [
    // 1. All active progress rows (for tracked count, due count, new count, FSRS retrievability)
    progressResult,
    // 2. 30d review logs WITH word metadata (covers: recent logs, 7d/30d volume, rating distribution, semantic fields)
    reviewLogs30dWithWordsResult,
    // 3. Year-long review dates (for streak calculation)
    streakResult,
    // 4. Recent notes
    notesResult,
    // 5. Notes count
    notesCountResult,
    // 6. Active session
    activeSessionResult,
  ] = await Promise.all([
    supabase
      .from("user_word_progress")
      .select("state, due_at, desired_retention, scheduler_payload")
      .eq("user_id", owner.id),
    supabase
      .from("review_logs")
      .select("rating, reviewed_at, words(lemma, slug, title, metadata)")
      .eq("user_id", owner.id)
      .gte("reviewed_at", thirtyDaysAgo.toISOString())
      .order("reviewed_at", { ascending: false })
      .limit(500),
    supabase
      .from("review_logs")
      .select("reviewed_at")
      .eq("user_id", owner.id)
      .gte("reviewed_at", yearAgo.toISOString())
      .order("reviewed_at", { ascending: false }),
    supabase
      .from("notes")
      .select("content_md, updated_at, version, words(lemma, slug, title)")
      .eq("user_id", owner.id)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase.from("notes").select("*", { count: "exact", head: true }).eq("user_id", owner.id),
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

  // ── Derive metrics from progress rows (in-memory) ──
  const progressRows = (progressResult.data ?? []) as Array<{
    desired_retention: number | null;
    state: string;
    due_at: string | null;
    scheduler_payload: unknown;
  }>;
  const trackedWords = progressRows.length;
  const dueToday = progressRows.filter((row) => row.due_at && row.due_at <= now).length;
  const todayNewCount = progressRows.filter(
    (row) => row.state === "new" && row.due_at && row.due_at <= now,
  ).length;

  const desiredRetentionValues = progressRows
    .map((row) => row.desired_retention)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDesiredRetention =
    desiredRetentionValues.length > 0
      ? desiredRetentionValues.reduce((sum, value) => sum + value, 0) / desiredRetentionValues.length
      : DEFAULT_DESIRED_RETENTION;

  // ── FSRS retrievability from progress rows ──
  const retrievabilityValues = progressRows
    .filter((row) => row.state !== "suspended")
    .map((row) =>
      getCurrentRetrievability(
        row.scheduler_payload as never,
        row.desired_retention ?? DEFAULT_DESIRED_RETENTION,
      ),
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const fsrsForgettingRate =
    retrievabilityValues.length > 0
      ? retrievabilityValues.reduce((sum, value) => sum + (1 - value), 0) /
        retrievabilityValues.length
      : 0;

  // ── Derive review metrics from the single 30d query ──
  type ReviewLogWithWords = {
    rating: string;
    reviewed_at: string;
    words: { lemma: string; slug: string; title: string; metadata: unknown } | null;
  };
  const reviewLogs30d = (reviewLogs30dWithWordsResult.data ?? []) as ReviewLogWithWords[];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const reviewLogs7d = reviewLogs30d.filter((row) => row.reviewed_at >= sevenDaysAgo.toISOString());

  // Recent logs (top 8) — already ordered by reviewed_at desc, but limit in-memory
  const recentLogs = reviewLogs30d.slice(0, 8).map((row) => ({
    rating: row.rating,
    reviewed_at: row.reviewed_at,
    words: row.words ? { lemma: row.words.lemma, slug: row.words.slug, title: row.words.title } : null,
  }));

  // Rating distribution
  const ratingDistribution = { again: 0, easy: 0, good: 0, hard: 0 };
  for (const row of reviewLogs30d) {
    if (row.rating in ratingDistribution) {
      ratingDistribution[row.rating as keyof typeof ratingDistribution] += 1;
    }
  }

  // Weakest semantic fields
  const semanticCounts = new Map<string, { again: number; total: number }>();
  for (const row of reviewLogs30d) {
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

  // Streak
  const streakDays = calculateStreak(
    new Set(((streakResult.data ?? []) as Array<{ reviewed_at: string }>).map((row) =>
      row.reviewed_at.slice(0, 10),
    )),
  );

  // Reviewed today count
  const reviewedToday = reviewLogs30d.filter((row) => row.reviewed_at >= today).length;
  const forgettingRate30d =
    reviewLogs30d.length > 0 ? ratingDistribution.again / reviewLogs30d.length : 0;
  const fsrsCalibrationGap30d = forgettingRate30d - fsrsForgettingRate;

  return {
    activeSession: activeSessionResult.data ?? null,
    averageDesiredRetention,
    configured: true,
    forgettingRate30d,
    fsrsCalibrationGap30d,
    fsrsForgettingRate,
    importOverview,
    metrics: {
      dueToday,
      notesCount: notesCountResult.count ?? 0,
      reviewed30d: reviewLogs30d.length,
      reviewed7d: reviewLogs7d.length,
      reviewedToday,
      streakDays,
      todayNewCount,
      trackedWords,
    },
    notes: (notesResult.data ?? []) as Array<{
      content_md: string;
      updated_at: string;
      version: number;
      words: { lemma: string; slug: string; title: string } | null;
    }>,
    ratingDistribution,
    recentLogs,
    reviewVolume30d: buildVolumeSeries(30, reviewLogs30d),
    reviewVolume7d: buildVolumeSeries(7, reviewLogs7d),
    weakestSemanticFields,
  };
}
