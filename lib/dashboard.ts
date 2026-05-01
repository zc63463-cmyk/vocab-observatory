import { getOwnerUser } from "@/lib/auth";
import { getLatestImportOverview } from "@/lib/imports";
import {
  DEFAULT_DESIRED_RETENTION,
  getCurrentRetrievability,
  normalizeDesiredRetention,
  retuneScheduledReviewCard,
} from "@/lib/review/fsrs-adapter";
import {
  computeRetentionDiagnostic,
  type RetentionDiagnostic,
  type RetentionDiagnosticLog,
} from "@/lib/review/retention-diagnostics";
import { REVIEW_RETENTION_PRESETS, readDesiredRetentionSetting } from "@/lib/review/settings";
import type { StoredSchedulerCard } from "@/lib/review/types";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import { startOfTodayIso } from "@/lib/utils";
import type { Json } from "@/types/database.types";

type DashboardProgressRow = {
  desired_retention: number | null;
  due_at: string | null;
  scheduler_payload: Json;
  state: string;
  words: { cefr: string | null; lemma: string; metadata: Json | null; slug: string; ipa: string | null; short_definition: string | null; pos: string | null; title: string | null } | null;
};

type DashboardReviewLogRow = {
  metadata: Json;
  rating: string;
  reviewed_at: string;
};

type DashboardSemanticWord = {
  metadata: Json;
};

function isJsonObject(
  value: Json | null | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return formatDayKey(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildVolumeSeries(days: number, logs: Array<{ reviewed_at: string }>, today?: Date) {
  const anchor = new Date(today ?? new Date());
  anchor.setHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = addDays(anchor, -index);
    buckets.set(formatDayKey(date), 0);
  }

  for (const log of logs) {
    const key = toLocalDayKey(log.reviewed_at);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return [...buckets.entries()].map(([date, count]) => ({ count, date }));
}

function calculateStreak(daysSet: Set<string>, now?: Date) {
  let streak = 0;
  const cursor = new Date(now ?? new Date());
  cursor.setHours(0, 0, 0, 0);

  while (daysSet.has(formatDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function readDesiredRetentionFromLogMetadata(
  metadata: Json | null | undefined,
  fallbackDesiredRetention: number,
) {
  if (!isJsonObject(metadata)) {
    return fallbackDesiredRetention;
  }

  const desiredRetention = metadata.desired_retention;
  return normalizeDesiredRetention(
    typeof desiredRetention === "number" ? desiredRetention : fallbackDesiredRetention,
  );
}

function resolveForecastDueAt(
  row: DashboardProgressRow,
  desiredRetention: number,
  now: Date,
) {
  if (row.state === "suspended") {
    return null;
  }

  if (row.state !== "review") {
    return row.due_at;
  }

  const retuned = retuneScheduledReviewCard(
    row.scheduler_payload as StoredSchedulerCard | null,
    desiredRetention,
    now,
  );

  return retuned?.dueAt ?? row.due_at;
}

export interface RetentionGapPoint {
  againRate: number;
  date: string;
  gap: number;
  reviewCount: number;
  targetForgettingRate: number;
}

export interface RetentionLoadForecast {
  desiredRetention: number;
  due14d: number;
  due7d: number;
  dueNow: number;
}

export interface RetentionPresetForecast extends RetentionLoadForecast {
  description: string;
  id: "sprint" | "balanced" | "conservative";
  label: string;
}

export interface DailyForecastDay {
  date: string;
  weekday: string;
  dateLabel: string;
  dueCount: number;
  isToday: boolean;
  isPast: boolean;
  actualReviewCount: number | null;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatWeekday(date: Date): string {
  return WEEKDAY_LABELS[date.getDay()];
}

export function buildRetentionGapSeries(
  days: number,
  reviewLogs: DashboardReviewLogRow[],
  fallbackDesiredRetention = DEFAULT_DESIRED_RETENTION,
  today?: Date,
) {
  const anchor = new Date(today ?? new Date());
  anchor.setHours(0, 0, 0, 0);

  const buckets = new Map<
    string,
    { againCount: number; reviewCount: number; targetForgettingSum: number }
  >();

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = addDays(anchor, -index);
    buckets.set(formatDayKey(date), {
      againCount: 0,
      reviewCount: 0,
      targetForgettingSum: 0,
    });
  }

  for (const log of reviewLogs) {
    const key = toLocalDayKey(log.reviewed_at);
    const bucket = buckets.get(key);

    if (!bucket) {
      continue;
    }

    const desiredRetention = readDesiredRetentionFromLogMetadata(
      log.metadata,
      fallbackDesiredRetention,
    );

    bucket.reviewCount += 1;
    bucket.targetForgettingSum += 1 - desiredRetention;
    if (log.rating === "again") {
      bucket.againCount += 1;
    }
  }

  return [...buckets.entries()].map(([date, bucket]) => {
    if (bucket.reviewCount === 0) {
      return {
        againRate: 0,
        date,
        gap: 0,
        reviewCount: 0,
        targetForgettingRate: 0,
      } satisfies RetentionGapPoint;
    }

    const againRate = bucket.againCount / bucket.reviewCount;
    const targetForgettingRate = bucket.targetForgettingSum / bucket.reviewCount;

    return {
      againRate,
      date,
      gap: againRate - targetForgettingRate,
      reviewCount: bucket.reviewCount,
      targetForgettingRate,
    } satisfies RetentionGapPoint;
  });
}

export function buildRetentionForecast(
  progressRows: DashboardProgressRow[],
  desiredRetention: number,
  now?: Date,
) {
  const actualNow = now ?? new Date();
  const normalizedRetention = normalizeDesiredRetention(desiredRetention);
  const nowIso = actualNow.toISOString();
  const next7dIso = addDays(actualNow, 7).toISOString();
  const next14dIso = addDays(actualNow, 14).toISOString();

  let dueNow = 0;
  let due7d = 0;
  let due14d = 0;

  for (const row of progressRows) {
    const dueAt = resolveForecastDueAt(row, normalizedRetention, actualNow);
    if (!dueAt) {
      continue;
    }

    if (dueAt <= nowIso) {
      dueNow += 1;
    }
    if (dueAt <= next7dIso) {
      due7d += 1;
    }
    if (dueAt <= next14dIso) {
      due14d += 1;
    }
  }

  return {
    desiredRetention: normalizedRetention,
    due14d,
    due7d,
    dueNow,
  } satisfies RetentionLoadForecast;
}

export function buildRetentionForecasts(
  progressRows: DashboardProgressRow[],
  now?: Date,
) {
  const actualNow = now ?? new Date();
  return REVIEW_RETENTION_PRESETS.map((preset) => ({
    ...preset,
    ...buildRetentionForecast(progressRows, preset.desiredRetention, actualNow),
  })) satisfies RetentionPresetForecast[];
}

export function buildDailyForecastCalendar(
  progressRows: DashboardProgressRow[],
  desiredRetention: number,
  days = 14,
  reviewLogs?: Array<{ reviewed_at: string }>,
  now?: Date,
): DailyForecastDay[] {
  const actualNow = now ?? new Date();
  const normalizedRetention = normalizeDesiredRetention(desiredRetention);
  const anchor = new Date(actualNow);
  anchor.setHours(0, 0, 0, 0);
  const todayIso = formatDayKey(anchor);

  const buckets: Array<{ date: string; dueCount: number; actualReviewCount: number | null }> =
    [];
  for (let i = 0; i < days; i += 1) {
    const d = addDays(anchor, i);
    buckets.push({ date: formatDayKey(d), dueCount: 0, actualReviewCount: null });
  }

  for (const row of progressRows) {
    const dueAt = resolveForecastDueAt(row, normalizedRetention, actualNow);
    if (!dueAt) continue;
    const bucket = buckets.find((b) => b.date === toLocalDayKey(dueAt));
    if (bucket) bucket.dueCount += 1;
  }

  if (reviewLogs && reviewLogs.length > 0) {
    const countsByDay = new Map<string, number>();
    for (const log of reviewLogs) {
      const key = toLocalDayKey(log.reviewed_at);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }
    for (const bucket of buckets) {
      if (bucket.date < todayIso && countsByDay.has(bucket.date)) {
        bucket.actualReviewCount = countsByDay.get(bucket.date)!;
      }
    }
  }

  return buckets.map((bucket, index) => {
    const d = addDays(anchor, index);
    return {
      date: bucket.date,
      weekday: formatWeekday(d),
      dateLabel: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
      dueCount: bucket.dueCount,
      isToday: bucket.date === todayIso,
      isPast: bucket.date < todayIso,
      actualReviewCount: bucket.actualReviewCount,
    } satisfies DailyForecastDay;
  });
}

function readMetadataStrings(metadata: unknown, keys: string[]): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    if (typeof value === "string") {
      return value.split(/[,;，、\n]/).map((s) => s.trim()).filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const r = item as Record<string, unknown>;
          return [
            typeof r.word === "string" ? r.word : null,
            typeof r.lemma === "string" ? r.lemma : null,
            typeof r.label === "string" ? r.label : null,
            typeof r.title === "string" ? r.title : null,
          ].filter((v): v is string => typeof v === "string");
        }
        return [];
      }).filter(Boolean);
    }
  }
  return [];
}

function buildRelationGraph(
  rows: DashboardProgressRow[],
): Record<string, { slug: string; lemma: string; relation: string }[]> {
  const lemmaToSlug = new Map<string, string>();
  const slugToLemma = new Map<string, string>();
  for (const row of rows) {
    if (!row.words) continue;
    slugToLemma.set(row.words.slug, row.words.lemma);
    lemmaToSlug.set(row.words.lemma.toLowerCase(), row.words.slug);
    lemmaToSlug.set(row.words.slug.toLowerCase(), row.words.slug);
  }

  const graph: Record<string, { slug: string; lemma: string; relation: string }[]> = {};
  for (const row of rows) {
    if (!row.words?.metadata) continue;
    const slug = row.words.slug;
    const neighbors: { slug: string; lemma: string; relation: string }[] = [];

    for (const label of readMetadataStrings(row.words.metadata, [
      "synonyms", "synonym_items", "synonym_words",
    ])) {
      const neighborSlug = lemmaToSlug.get(label.toLowerCase());
      if (neighborSlug && neighborSlug !== slug) {
        neighbors.push({ slug: neighborSlug, lemma: slugToLemma.get(neighborSlug) ?? label, relation: "近义" });
      }
    }
    for (const label of readMetadataStrings(row.words.metadata, [
      "antonyms", "antonym_items", "antonym_words",
    ])) {
      const neighborSlug = lemmaToSlug.get(label.toLowerCase());
      if (neighborSlug && neighborSlug !== slug) {
        neighbors.push({ slug: neighborSlug, lemma: slugToLemma.get(neighborSlug) ?? label, relation: "反义" });
      }
    }
    for (const label of readMetadataStrings(row.words.metadata, [
      "roots", "root", "root_family", "rootFamily", "word_roots",
    ])) {
      const neighborSlug = lemmaToSlug.get(label.toLowerCase());
      if (neighborSlug && neighborSlug !== slug) {
        neighbors.push({ slug: neighborSlug, lemma: slugToLemma.get(neighborSlug) ?? label, relation: "词根" });
      }
    }

    if (neighbors.length > 0) {
      graph[slug] = neighbors;
    }
  }
  return graph;
}

export async function getDashboardSummary() {
  const emptyForecast = buildRetentionForecast([], DEFAULT_DESIRED_RETENTION);
  const emptyPresetForecasts = buildRetentionForecasts([]);

  const [owner, supabase, importOverview] = await Promise.all([
    getOwnerUser(),
    getServerSupabaseClientOrNull(),
    getLatestImportOverview(),
  ]);

  if (!supabase || !owner) {
    return {
      activeSession: null as { cards_seen: number; id: string; started_at: string } | null,
      averageDesiredRetention: DEFAULT_DESIRED_RETENTION,
      configuredDesiredRetention: DEFAULT_DESIRED_RETENTION,
      configuredRetentionForecast: emptyForecast,
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
      retentionDiagnostic: computeRetentionDiagnostic({
        desiredRetention: DEFAULT_DESIRED_RETENTION,
        logs: [],
      }),
      retentionForecasts: emptyPresetForecasts,
      retentionGapSeries14d: [] as RetentionGapPoint[],
      reviewVolume30d: [] as Array<{ count: number; date: string }>,
      reviewVolume7d: [] as Array<{ count: number; date: string }>,
      weakestSemanticFields: [] as Array<{
        againRate: number;
        name: string;
        total: number;
      }>,
      dailyForecast: [] as DailyForecastDay[],
      masteryCells: [] as Array<{
        cefr: string;
        dueAt: string | null;
        lemma: string;
        metadata: unknown;
        retrievability: number;
        slug: string;
        ipa: string | null;
        shortDefinition: string | null;
        pos: string | null;
        title: string | null;
      }>,
      relationGraph: {} as Record<string, { slug: string; lemma: string; relation: string }[]>,
    };
  }

  const today = startOfTodayIso();
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const thirtyDaysAgo = addDays(new Date(today), -29);
  const ninetyDaysAgo = addDays(new Date(today), -89);
  const yearAgo = addDays(new Date(today), -364);

  const [
    progressResult,
    reviewLogs30dWithWordsResult,
    reviewLogs90dDiagnosticResult,
    streakResult,
    notesResult,
    notesCountResult,
    activeSessionResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from("user_word_progress")
      .select("state, due_at, desired_retention, scheduler_payload, words!inner(cefr, lemma, slug, metadata, ipa, short_definition, pos, title)")
      .eq("user_id", owner.id),
    supabase
      .from("review_logs")
      .select("rating, reviewed_at, metadata, words(lemma, slug, title, metadata)")
      .eq("user_id", owner.id)
      .gte("reviewed_at", thirtyDaysAgo.toISOString())
      .order("reviewed_at", { ascending: false })
      .limit(500),
    // Separate slim query for the 90-day retention diagnostic. Excludes undone
    // logs (reverted by the undo RPC) since they don't represent real memory
    // state. Kept narrow (4 columns) so the higher limit is cheap.
    supabase
      .from("review_logs")
      .select("rating, reviewed_at, elapsed_days, scheduled_days")
      .eq("user_id", owner.id)
      .eq("undone", false)
      .gte("reviewed_at", ninetyDaysAgo.toISOString())
      .order("reviewed_at", { ascending: false })
      .limit(3000),
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
    supabase.from("profiles").select("settings").eq("id", owner.id).maybeSingle(),
  ]);

  const progressRows = (progressResult.data ?? []) as unknown as DashboardProgressRow[];
  const trackedWords = progressRows.length;
  const dueToday = progressRows.filter(
    (row) => row.state !== "suspended" && row.due_at && row.due_at <= nowIso,
  ).length;
  const todayNewCount = progressRows.filter(
    (row) => row.state === "new" && row.due_at && row.due_at <= nowIso,
  ).length;

  const desiredRetentionValues = progressRows
    .map((row) => row.desired_retention)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDesiredRetention =
    desiredRetentionValues.length > 0
      ? desiredRetentionValues.reduce((sum, value) => sum + value, 0) / desiredRetentionValues.length
      : DEFAULT_DESIRED_RETENTION;
  const configuredDesiredRetention = readDesiredRetentionSetting(
    profileResult.data?.settings ?? null,
  );

  const retrievabilityValues = progressRows
    .filter((row) => row.state !== "suspended")
    .map((row) =>
      getCurrentRetrievability(
        row.scheduler_payload as StoredSchedulerCard | null,
        row.desired_retention ?? DEFAULT_DESIRED_RETENTION,
      ),
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const fsrsForgettingRate =
    retrievabilityValues.length > 0
      ? retrievabilityValues.reduce((sum, value) => sum + (1 - value), 0) /
        retrievabilityValues.length
      : 0;

  type ReviewLogWithWords = {
    metadata: Json;
    rating: string;
    reviewed_at: string;
    words: { lemma: string; metadata: Json; slug: string; title: string } | null;
  };
  const reviewLogs30d = (reviewLogs30dWithWordsResult.data ?? []) as unknown as ReviewLogWithWords[];

  const sevenDaysAgo = addDays(new Date(today), -6);
  const reviewLogs7d = reviewLogs30d.filter((row) => row.reviewed_at >= sevenDaysAgo.toISOString());

  const recentLogs = reviewLogs30d.slice(0, 8).map((row) => ({
    rating: row.rating,
    reviewed_at: row.reviewed_at,
    words: row.words ? { lemma: row.words.lemma, slug: row.words.slug, title: row.words.title } : null,
  }));

  const ratingDistribution = { again: 0, easy: 0, good: 0, hard: 0 };
  for (const row of reviewLogs30d) {
    if (row.rating in ratingDistribution) {
      ratingDistribution[row.rating as keyof typeof ratingDistribution] += 1;
    }
  }

  const semanticCounts = new Map<string, { again: number; total: number }>();
  for (const row of reviewLogs30d) {
    const metadata = row.words?.metadata as DashboardSemanticWord["metadata"] | null | undefined;
    if (!isJsonObject(metadata)) {
      continue;
    }

    const semanticField =
      typeof metadata.semantic_field === "string" ? metadata.semantic_field : null;
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
      toLocalDayKey(row.reviewed_at),
    )),
    nowDate,
  );

  const reviewedToday = reviewLogs30d.filter((row) => row.reviewed_at >= today).length;
  const forgettingRate30d =
    reviewLogs30d.length > 0 ? ratingDistribution.again / reviewLogs30d.length : 0;
  const fsrsCalibrationGap30d = forgettingRate30d - fsrsForgettingRate;

  const diagnosticLogs =
    (reviewLogs90dDiagnosticResult.data ?? []) as unknown as RetentionDiagnosticLog[];
  const retentionDiagnostic: RetentionDiagnostic = computeRetentionDiagnostic({
    desiredRetention: configuredDesiredRetention,
    logs: diagnosticLogs,
    now: nowDate,
  });

  // Build mastery heatmap: per-card retrievability grouped by CEFR
  const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"];
  const masteryCells = progressRows
    .filter((row) => row.state !== "suspended" && row.words)
    .map((row) => {
      const retrievability = getCurrentRetrievability(
        row.scheduler_payload as StoredSchedulerCard | null,
        row.desired_retention ?? DEFAULT_DESIRED_RETENTION,
      );
      return {
        cefr: row.words!.cefr ?? "unknown",
        lemma: row.words!.lemma,
        metadata: row.words!.metadata,
        slug: row.words!.slug,
        retrievability: retrievability ?? 0,
        dueAt: row.due_at,
        ipa: row.words!.ipa,
        shortDefinition: row.words!.short_definition,
        pos: row.words!.pos,
        title: row.words!.title,
      };
    })
    .sort((a, b) => {
      const cefrDiff = CEFR_ORDER.indexOf(a.cefr) - CEFR_ORDER.indexOf(b.cefr);
      if (cefrDiff !== 0) return cefrDiff;
      return b.retrievability - a.retrievability;
    });

  return {
    activeSession: activeSessionResult.data ?? null,
    averageDesiredRetention,
    configuredDesiredRetention,
    configuredRetentionForecast: buildRetentionForecast(
      progressRows,
      configuredDesiredRetention,
      nowDate,
    ),
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
    notes: (notesResult.data ?? []) as unknown as Array<{
      content_md: string;
      updated_at: string;
      version: number;
      words: { lemma: string; slug: string; title: string } | null;
    }>,
    ratingDistribution,
    recentLogs,
    retentionDiagnostic,
    retentionForecasts: buildRetentionForecasts(progressRows, nowDate),
    retentionGapSeries14d: buildRetentionGapSeries(
      14,
      reviewLogs30d,
      configuredDesiredRetention,
      nowDate,
    ),
    reviewVolume30d: buildVolumeSeries(30, reviewLogs30d, nowDate),
    reviewVolume7d: buildVolumeSeries(7, reviewLogs7d, nowDate),
    weakestSemanticFields,
    dailyForecast: buildDailyForecastCalendar(
      progressRows,
      configuredDesiredRetention,
      14,
      reviewLogs30d.map((row) => ({ reviewed_at: row.reviewed_at })),
      nowDate,
    ),
    masteryCells,
    relationGraph: buildRelationGraph(progressRows),
  };
}
