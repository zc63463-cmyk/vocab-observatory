import { cache } from "react";
import { env, hasSupabasePublicEnv } from "@/lib/env";
import { getOwnerUser } from "@/lib/auth";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import {
  createEmptyStructuredWordFields,
  isStructuredWordColumnsMissing,
  type AntonymItem,
  type CollocationItem,
  type CoreDefinition,
  type CorpusItem,
  type SynonymItem,
} from "@/lib/structured-word";
import { escapePostgrestLike } from "@/lib/utils";
import type { Json } from "@/types/database.types";

const WORD_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at";
const WORD_DETAIL_LEGACY_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at, definition_md, body_md, examples, pos, source_path";
const WORD_DETAIL_STRUCTURED_SELECT =
  `${WORD_DETAIL_LEGACY_SELECT}, core_definitions, prototype_text, collocations, corpus_items, synonym_items, antonym_items`;
const DISPLAY_LIMIT = 120;

export type ReviewFilter = "all" | "tracked" | "due" | "untracked";

export interface OwnerWordProgressSummary {
  due_at: string | null;
  id: string;
  is_due: boolean;
  last_reviewed_at: string | null;
  review_count: number;
  state: string;
}

export interface PublicWordSummary {
  id: string;
  ipa: string | null;
  lemma: string;
  metadata: Json;
  progress: OwnerWordProgressSummary | null;
  short_definition: string | null;
  slug: string;
  title: string;
  updated_at: string;
}

export interface PublicWordDetail extends PublicWordSummary {
  antonym_items: AntonymItem[];
  body_md: string;
  collocations: CollocationItem[];
  core_definitions: CoreDefinition[];
  corpus_items: CorpusItem[];
  definition_md: string;
  examples: Json;
  pos: string | null;
  prototype_text: string | null;
  source_path: string;
  synonym_items: SynonymItem[];
  tags: Array<{ label: string; slug: string }>;
}

export interface WordQueryFilters {
  freq?: string;
  q?: string;
  review?: ReviewFilter;
  semantic?: string;
}

function getMetadataString(metadata: Json, key: string) {
  if (
    typeof metadata === "object" &&
    metadata &&
    !Array.isArray(metadata) &&
    key in metadata &&
    typeof metadata[key] === "string"
  ) {
    return metadata[key] as string;
  }

  return null;
}

function parseStructuredArray<T>(value: Json | undefined, guard: (item: unknown) => item is T) {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: T[] = [];
  for (const item of value) {
    if (guard(item)) {
      parsed.push(item);
    }
  }

  return parsed;
}

function isCoreDefinition(value: unknown): value is CoreDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "partOfSpeech" in value &&
    typeof value.partOfSpeech === "string" &&
    "senses" in value &&
    Array.isArray(value.senses)
  );
}

function isCollocationItem(value: unknown): value is CollocationItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "phrase" in value &&
    typeof value.phrase === "string" &&
    "note" in value
  );
}

function isCorpusItem(value: unknown): value is CorpusItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string" &&
    "note" in value
  );
}

function isSynonymItem(value: unknown): value is SynonymItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "word" in value &&
    typeof value.word === "string" &&
    "semanticDiff" in value &&
    typeof value.semanticDiff === "string"
  );
}

function isAntonymItem(value: unknown): value is AntonymItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "word" in value &&
    typeof value.word === "string" &&
    "note" in value
  );
}

function normalizeFilters(filters?: WordQueryFilters) {
  return {
    freq: filters?.freq?.trim() ?? "",
    q: filters?.q?.trim() ?? "",
    review: (filters?.review ?? "all") as ReviewFilter,
    semantic: filters?.semantic?.trim() ?? "",
  };
}

function matchesQuery(word: Omit<PublicWordSummary, "progress">, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    word.lemma,
    word.title,
    word.short_definition ?? "",
    getMetadataString(word.metadata, "semantic_field") ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function isDue(dueAt: string | null | undefined) {
  return Boolean(dueAt && new Date(dueAt).getTime() <= Date.now());
}

async function getOwnerProgressMap() {
  const owner = await getOwnerUser();
  const supabase = await getServerSupabaseClientOrNull();

  if (!owner || !supabase) {
    return {
      isOwner: false,
      progressByWordId: new Map<string, OwnerWordProgressSummary>(),
    };
  }

  const { data, error } = await supabase
    .from("user_word_progress")
    .select("id, word_id, due_at, review_count, state, last_reviewed_at")
    .eq("user_id", owner.id);

  if (error) {
    throw error;
  }

  return {
    isOwner: true,
    progressByWordId: new Map(
      (data ?? []).map((row) => [
        row.word_id,
        {
          due_at: row.due_at,
          id: row.id,
          is_due: isDue(row.due_at),
          last_reviewed_at: row.last_reviewed_at,
          review_count: row.review_count,
          state: row.state,
        },
      ]),
    ),
  };
}

async function getAllPublicWordRows() {
  const supabase = await getServerSupabaseClientOrNull();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("words")
    .select(WORD_SELECT)
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("lemma");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<Omit<PublicWordSummary, "progress">>;
}

function withStructuredFallback(
  word: Record<string, Json | string | null>,
): Omit<PublicWordDetail, "progress" | "tags"> {
  const structuredDefaults = createEmptyStructuredWordFields();

  return {
    antonym_items: parseStructuredArray(word.antonym_items as Json, isAntonymItem),
    body_md: String(word.body_md ?? ""),
    collocations: parseStructuredArray(word.collocations as Json, isCollocationItem),
    core_definitions: parseStructuredArray(word.core_definitions as Json, isCoreDefinition),
    corpus_items: parseStructuredArray(word.corpus_items as Json, isCorpusItem),
    definition_md: String(word.definition_md ?? ""),
    examples: (word.examples as Json) ?? [],
    id: String(word.id),
    ipa: (word.ipa as string | null) ?? null,
    lemma: String(word.lemma),
    metadata: (word.metadata as Json) ?? {},
    pos: (word.pos as string | null) ?? null,
    prototype_text:
      (word.prototype_text as string | null) ??
      getMetadataString((word.metadata as Json) ?? {}, "prototype") ??
      structuredDefaults.prototypeText,
    short_definition: (word.short_definition as string | null) ?? null,
    slug: String(word.slug),
    source_path: String(word.source_path ?? ""),
    synonym_items: parseStructuredArray(word.synonym_items as Json, isSynonymItem),
    title: String(word.title),
    updated_at: String(word.updated_at),
  };
}

export const getLandingSnapshot = cache(async () => {
  const supabase = await getServerSupabaseClientOrNull();
  if (!supabase) {
    return {
      featuredWords: [] as PublicWordSummary[],
      repoName: `${env.repoOwner}/${env.repoName}`,
      totalWords: 0,
      configured: false,
    };
  }

  const { isOwner, progressByWordId } = await getOwnerProgressMap();
  const [countResult, featuredResult] = await Promise.all([
    supabase
      .from("words")
      .select("*", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("is_deleted", false),
    supabase
      .from("words")
      .select(WORD_SELECT)
      .eq("is_published", true)
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  return {
    configured: true,
    featuredWords: ((featuredResult.data ?? []) as Array<
      Omit<PublicWordSummary, "progress">
    >).map((word) => ({
      ...word,
      progress: isOwner ? progressByWordId.get(word.id) ?? null : null,
    })),
    repoName: `${env.repoOwner}/${env.repoName}`,
    totalWords: countResult.count ?? 0,
  };
});

export async function getPublicWords(filters?: WordQueryFilters) {
  const allWords = await getAllPublicWordRows();
  if (!allWords) {
    return {
      configured: false,
      counts: { showing: 0, total: 0 },
      filterOptions: {
        frequencies: [] as string[],
        semanticFields: [] as string[],
      },
      filters: normalizeFilters(filters),
      isOwner: false,
      truncated: false,
      words: [] as PublicWordSummary[],
    };
  }

  const normalizedFilters = normalizeFilters(filters);
  const { isOwner, progressByWordId } = await getOwnerProgressMap();
  const semanticFields = [...new Set(
    allWords
      .map((word) => getMetadataString(word.metadata, "semantic_field"))
      .filter((value): value is string => Boolean(value)),
  )].sort((left, right) => left.localeCompare(right));
  const frequencies = [...new Set(
    allWords
      .map((word) => getMetadataString(word.metadata, "word_freq"))
      .filter((value): value is string => Boolean(value)),
  )].sort((left, right) => left.localeCompare(right));

  const filtered = allWords.filter((word) => {
    if (!matchesQuery(word, normalizedFilters.q)) {
      return false;
    }

    if (
      normalizedFilters.semantic &&
      getMetadataString(word.metadata, "semantic_field") !== normalizedFilters.semantic
    ) {
      return false;
    }

    if (
      normalizedFilters.freq &&
      getMetadataString(word.metadata, "word_freq") !== normalizedFilters.freq
    ) {
      return false;
    }

    if (!isOwner || normalizedFilters.review === "all") {
      return true;
    }

    const progress = progressByWordId.get(word.id);
    if (normalizedFilters.review === "tracked") {
      return Boolean(progress);
    }

    if (normalizedFilters.review === "due") {
      return Boolean(progress && isDue(progress.due_at));
    }

    if (normalizedFilters.review === "untracked") {
      return !progress;
    }

    return true;
  });

  const visibleWords = filtered.slice(0, DISPLAY_LIMIT).map((word) => ({
    ...word,
    progress: isOwner ? progressByWordId.get(word.id) ?? null : null,
  }));

  return {
    configured: true,
    counts: {
      showing: visibleWords.length,
      total: filtered.length,
    },
    filterOptions: {
      frequencies,
      semanticFields,
    },
    filters: {
      ...normalizedFilters,
      review: isOwner ? normalizedFilters.review : "all",
    },
    isOwner,
    truncated: filtered.length > visibleWords.length,
    words: visibleWords,
  };
}

export async function getPublicWordBySlug(slug: string) {
  const supabase = await getServerSupabaseClientOrNull();
  if (!supabase) {
    return {
      configured: false,
      note: null as
        | {
            content_md: string;
            updated_at: string;
            version: number;
          }
        | null,
      word: null as PublicWordDetail | null,
    };
  }

  let word: Record<string, Json | string | null> | null = null;
  const structuredAttempt = await supabase
    .from("words")
    .select(WORD_DETAIL_STRUCTURED_SELECT)
    .eq("slug", escapePostgrestLike(slug))
    .eq("is_published", true)
    .eq("is_deleted", false)
    .maybeSingle();

  if (isStructuredWordColumnsMissing(structuredAttempt.error)) {
    const legacyAttempt = await supabase
      .from("words")
      .select(WORD_DETAIL_LEGACY_SELECT)
      .eq("slug", escapePostgrestLike(slug))
      .eq("is_published", true)
      .eq("is_deleted", false)
      .maybeSingle();

    if (legacyAttempt.error) {
      throw legacyAttempt.error;
    }

    word = legacyAttempt.data as Record<string, Json | string | null> | null;
  } else {
    if (structuredAttempt.error) {
      throw structuredAttempt.error;
    }

    word = structuredAttempt.data as Record<string, Json | string | null> | null;
  }

  if (!word) {
    return {
      configured: true,
      note: null,
      word: null,
    };
  }

  const { data: tagRows, error: tagError } = await supabase
    .from("word_tags")
    .select("tags!inner(label, slug)")
    .eq("word_id", word.id as string);

  if (tagError) {
    throw tagError;
  }

  const owner = await getOwnerUser();
  let note:
    | { content_md: string; updated_at: string; version: number }
    | null = null;
  let progress: OwnerWordProgressSummary | null = null;

  if (owner) {
    const [noteResult, progressResult] = await Promise.all([
      supabase
        .from("notes")
        .select("content_md, updated_at, version")
        .eq("word_id", word.id as string)
        .maybeSingle(),
      supabase
        .from("user_word_progress")
        .select("id, due_at, review_count, state, last_reviewed_at")
        .eq("user_id", owner.id)
        .eq("word_id", word.id as string)
        .maybeSingle(),
    ]);

    if (noteResult.error) {
      throw noteResult.error;
    }

    if (progressResult.error) {
      throw progressResult.error;
    }

    note = noteResult.data;
    progress = progressResult.data
      ? {
          due_at: progressResult.data.due_at,
          id: progressResult.data.id,
          is_due: isDue(progressResult.data.due_at),
          last_reviewed_at: progressResult.data.last_reviewed_at,
          review_count: progressResult.data.review_count,
          state: progressResult.data.state,
        }
      : null;
  }

  return {
    configured: true,
    note,
    word: {
      ...withStructuredFallback(word),
      progress,
      tags: ((tagRows ?? []) as Array<{ tags: { label: string; slug: string } }>).map(
        (row) => row.tags,
      ),
    },
  };
}

export async function getPublicWordsCount() {
  if (!hasSupabasePublicEnv()) {
    return 0;
  }

  const supabase = await getServerSupabaseClientOrNull();
  const { count } = await supabase!
    .from("words")
    .select("*", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("is_deleted", false);

  return count ?? 0;
}
