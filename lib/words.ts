import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { env, hasSupabasePublicEnv } from "@/lib/env";
import { getSection, renderObsidianMarkdown } from "@/lib/markdown";
import {
  getPublicSupabaseClientOrNull,
  withTransientPublicReadRetry,
} from "@/lib/supabase/public";
import {
  createEmptyStructuredWordFields,
  isStructuredWordColumnsMissing,
  type AntonymItem,
  type CollocationExample,
  type CollocationItem,
  type CoreDefinition,
  type CorpusItem,
  type DerivedWord,
  type Mnemonic,
  type Morphology,
  type PosConversion,
  type SemanticChain,
  type SynonymItem,
} from "@/lib/structured-word";
import { escapePostgrestLike, slugifyLabel } from "@/lib/utils";
import type { Database, Json } from "@/types/database.types";
import { PUBLIC_CACHE_TAGS } from "@/lib/cache/public";

const WORD_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at";
const WORD_FILTER_METADATA_SELECT = "metadata";
const WORD_METADATA_SELECT = "slug, title, lemma, short_definition";
const WORD_SLUG_SELECT = "slug";
const WORD_DETAIL_LEGACY_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at, definition_md, body_md, examples, pos, source_path";
const WORD_DETAIL_STRUCTURED_SELECT =
  `${WORD_DETAIL_LEGACY_SELECT}, core_definitions, prototype_text, collocations, corpus_items, synonym_items, antonym_items`;
const DEFAULT_PUBLIC_WORD_PAGE_LIMIT = 60;
const MAX_PUBLIC_WORD_PAGE_LIMIT = 120;
const FEATURED_WORD_LIMIT = 6;
const PUBLIC_REVALIDATE_SECONDS = 300;
const WORD_FILTER_FACET_DIMENSIONS = ["semantic_field", "word_freq"] as const;
const WORD_GRAPH_METADATA_KEYS = [
  "antonyms",
  "roots",
  "synonyms",
] as const;

type ServerSupabaseClient = SupabaseClient<Database>;
type WordFilterFacetDimension = (typeof WORD_FILTER_FACET_DIMENSIONS)[number];

export type ReviewFilter = "all" | "tracked" | "due" | "untracked";

export interface OwnerWordProgressSummary {
  again_count: number;
  due_at: string | null;
  id: string;
  is_due: boolean;
  lapse_count: number;
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

export type PublicWordIndexEntry = Omit<PublicWordSummary, "progress">;

export interface PublicWordDetail extends PublicWordSummary {
  antonym_items: AntonymItem[];
  body_md: string;
  collocations: CollocationItem[];
  core_definitions: CoreDefinition[];
  corpus_items: CorpusItem[];
  definition_md: string;
  // Extended structured fields surfaced from `metadata` JSON for direct access
  // by view components. They mirror parser output and are nullable/empty for
  // older rows that predate the new corpus format.
  derived_words: DerivedWord[];
  examples: Json;
  mnemonic: Mnemonic | null;
  morphology: Morphology | null;
  pos: string | null;
  pos_conversions: PosConversion[];
  prototype_text: string | null;
  resolved_antonym_items: ResolvedAntonymItem[];
  resolved_synonym_items: ResolvedSynonymItem[];
  semantic_chain: SemanticChain | null;
  source_path: string;
  synonym_items: SynonymItem[];
  tags: Array<{ label: string; slug: string }>;
}

export interface CachedPublicWordDetail extends PublicWordDetail {
  antonym_html: string;
  body_html: string;
  definition_html: string;
  synonym_html: string;
}

export interface ResolvedSynonymItem extends SynonymItem {
  href: string | null;
}

export interface ResolvedAntonymItem extends AntonymItem {
  href: string | null;
}

export interface WordQueryFilters {
  freq?: string;
  q?: string;
  review?: ReviewFilter;
  semantic?: string;
}

export interface WordPagination {
  limit?: number | null;
  offset?: number | null;
}

export interface NormalizedWordQueryFilters {
  freq: string;
  q: string;
  review: ReviewFilter;
  semantic: string;
}

export interface NormalizedWordPagination {
  limit: number;
  offset: number;
}

export interface PublicWordsPageInfo {
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface PublicWordsResponse {
  configured: boolean;
  counts: {
    showing: number;
    total: number;
  };
  filterOptions: {
    frequencies: string[];
    semanticFields: string[];
  };
  filters: NormalizedWordQueryFilters;
  isOwner: boolean;
  pageInfo: PublicWordsPageInfo;
  truncated: boolean;
  words: PublicWordSummary[];
}

export interface PublicWordFilterOptions {
  frequencies: string[];
  semanticFields: string[];
}

export interface LandingSnapshot {
  configured: boolean;
  featuredWords: PublicWordSummary[];
  repoName: string;
  totalWords: number;
}

interface PublicWordMetadataRecord {
  lemma: string;
  short_definition: string | null;
  slug: string;
  title: string;
}

interface CachedPublicWordIndexRecord extends PublicWordIndexEntry {
  search_text: string;
  semantic_field: string | null;
  word_freq: string | null;
}

interface GetPublicWordsOptions {
  ownerSupabase?: ServerSupabaseClient | null;
  ownerUserId?: string | null;
  pagination?: WordPagination;
}

type BarePublicWordSummary = PublicWordIndexEntry;
type BarePublicWordMetadataRow = Pick<PublicWordIndexEntry, "metadata">;
type BareWordFilterFacetRow = Database["public"]["Tables"]["word_filter_facets"]["Row"];

interface PublicWordRowsPage {
  rows: CachedPublicWordIndexRecord[];
  total: number;
}

function isReviewFilter(value: string | undefined): value is ReviewFilter {
  return value === "all" || value === "tracked" || value === "due" || value === "untracked";
}

function isWordFilterFacetDimension(value: string): value is WordFilterFacetDimension {
  return WORD_FILTER_FACET_DIMENSIONS.includes(value as WordFilterFacetDimension);
}

function isWordFilterFacetRelationMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("word_filter_facets")
  );
}

function compactPublicMetadata(metadata: Json) {
  const compacted: Record<string, Json> = {
    semantic_field: getWordMetadataString(metadata, "semantic_field"),
    word_freq: getWordMetadataString(metadata, "word_freq"),
  };

  if (typeof metadata === "object" && metadata && !Array.isArray(metadata)) {
    for (const key of WORD_GRAPH_METADATA_KEYS) {
      const value = metadata[key];
      if (
        typeof value === "string" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"))
      ) {
        compacted[key] = value;
      }
    }
  }

  return compacted satisfies Json;
}

export function getWordMetadataString(metadata: Json, key: string) {
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

export function normalizeWordFilters(
  filters?: WordQueryFilters,
  options?: { allowReviewFilter?: boolean },
): NormalizedWordQueryFilters {
  return {
    freq: filters?.freq?.trim() ?? "",
    q: filters?.q?.trim() ?? "",
    review:
      options?.allowReviewFilter && isReviewFilter(filters?.review)
        ? filters!.review!
        : "all",
    semantic: filters?.semantic?.trim() ?? "",
  };
}

export function normalizeWordPagination(
  pagination?: WordPagination,
): NormalizedWordPagination {
  const rawLimit = pagination?.limit;
  const rawOffset = pagination?.offset;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit)
      ? Math.min(
          MAX_PUBLIC_WORD_PAGE_LIMIT,
          Math.max(1, Math.floor(rawLimit)),
        )
      : DEFAULT_PUBLIC_WORD_PAGE_LIMIT;
  const offset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset)
      ? Math.max(0, Math.floor(rawOffset))
      : 0;

  return { limit, offset };
}

export function createPublicWordsPageState(
  total: number,
  pagination: NormalizedWordPagination,
  returned: number,
) {
  const safeTotal = Math.max(0, total);
  const safeReturned = Math.max(
    0,
    Math.min(returned, pagination.limit, Math.max(safeTotal - pagination.offset, 0)),
  );
  const hasMore = pagination.offset + safeReturned < safeTotal;

  return {
    counts: {
      showing: safeReturned,
      total: safeTotal,
    },
    pageInfo: {
      hasMore,
      limit: pagination.limit,
      offset: pagination.offset,
      total: safeTotal,
    },
    truncated: hasMore,
  } satisfies Pick<PublicWordsResponse, "counts" | "pageInfo" | "truncated">;
}

export function createPublicWordsShellResponse(
  filters?: WordQueryFilters,
  pagination?: WordPagination,
): PublicWordsResponse {
  const normalizedPagination = normalizeWordPagination(pagination);

  return {
    configured: hasSupabasePublicEnv(),
    ...createPublicWordsPageState(0, normalizedPagination, 0),
    filterOptions: {
      frequencies: [],
      semanticFields: [],
    },
    filters: normalizeWordFilters(filters),
    isOwner: false,
    truncated: false,
    words: [],
  };
}

export function isDefaultPublicWordFilters(filters: NormalizedWordQueryFilters) {
  return (
    filters.freq === "" &&
    filters.q === "" &&
    filters.review === "all" &&
    filters.semantic === ""
  );
}

function buildWordSearchText(word: {
  lemma: string;
  semantic_field: string | null;
  short_definition: string | null;
  title: string;
  word_freq: string | null;
}) {
  return [
    word.lemma,
    word.title,
    word.short_definition ?? "",
    word.semantic_field ?? "",
    word.word_freq ?? "",
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function toCachedPublicWordIndexRecord(row: BarePublicWordSummary): CachedPublicWordIndexRecord {
  const metadata = compactPublicMetadata(row.metadata);
  const semanticField = getWordMetadataString(metadata, "semantic_field");
  const wordFrequency = getWordMetadataString(metadata, "word_freq");

  return {
    ...row,
    metadata,
    search_text: buildWordSearchText({
      lemma: row.lemma,
      semantic_field: semanticField,
      short_definition: row.short_definition,
      title: row.title,
      word_freq: wordFrequency,
    }),
    semantic_field: semanticField,
    word_freq: wordFrequency,
  };
}

function toPublicWordIndexEntry(record: CachedPublicWordIndexRecord): PublicWordIndexEntry {
  return {
    id: record.id,
    ipa: record.ipa,
    lemma: record.lemma,
    metadata: record.metadata,
    short_definition: record.short_definition,
    slug: record.slug,
    title: record.title,
    updated_at: record.updated_at,
  };
}

function toPublicWordSummary(
  record: CachedPublicWordIndexRecord,
  progress: OwnerWordProgressSummary | null,
): PublicWordSummary {
  return {
    ...toPublicWordIndexEntry(record),
    progress,
  };
}

function buildPublicWordFilterOptions(
  rows: BarePublicWordMetadataRow[],
): PublicWordFilterOptions {
  const semanticFields = [
    ...new Set(
      rows
        .map((row) => getWordMetadataString(row.metadata, "semantic_field"))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const frequencies = [
    ...new Set(
      rows
        .map((row) => getWordMetadataString(row.metadata, "word_freq"))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return {
    frequencies,
    semanticFields,
  };
}

export function buildPublicWordFilterOptionsFromFacetRows(
  rows: BareWordFilterFacetRow[],
): PublicWordFilterOptions {
  const semanticFields = [
    ...new Set(
      rows
        .filter((row) => isWordFilterFacetDimension(row.dimension))
        .filter((row) => row.dimension === "semantic_field" && row.count > 0)
        .map((row) => row.value.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const frequencies = [
    ...new Set(
      rows
        .filter((row) => isWordFilterFacetDimension(row.dimension))
        .filter((row) => row.dimension === "word_freq" && row.count > 0)
        .map((row) => row.value.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return {
    frequencies,
    semanticFields,
  };
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

function isCollocationExample(value: unknown): value is CollocationExample {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string" &&
    "translation" in value
  );
}

function parseCollocationItems(value: Json | undefined) {
  if (!Array.isArray(value)) {
    return [] as CollocationItem[];
  }

  const parsed: CollocationItem[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("phrase" in item) ||
      typeof item.phrase !== "string"
    ) {
      continue;
    }

    const examples: CollocationExample[] = [];
    if ("examples" in item && Array.isArray(item.examples)) {
      for (const example of item.examples) {
        if (isCollocationExample(example)) {
          examples.push(example);
        }
      }
    }

    const note =
      "note" in item && (typeof item.note === "string" || item.note === null)
        ? item.note
        : null;
    const gloss =
      "gloss" in item && (typeof item.gloss === "string" || item.gloss === null)
        ? item.gloss
        : note;

    parsed.push({
      examples,
      gloss,
      note,
      phrase: item.phrase,
    });
  }

  return parsed;
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

function matchesQuery(word: CachedPublicWordIndexRecord, query: string) {
  if (!query) {
    return true;
  }

  return word.search_text.includes(query.normalize("NFKC").toLowerCase());
}

function isDue(dueAt: string | null | undefined) {
  return Boolean(dueAt && new Date(dueAt).getTime() <= Date.now());
}

export function serializeOwnerWordProgress(progress: {
  again_count?: number | null;
  due_at: string | null;
  id: string;
  lapse_count?: number | null;
  last_reviewed_at: string | null;
  review_count: number;
  state: string;
}): OwnerWordProgressSummary {
  return {
    again_count: progress.again_count ?? 0,
    due_at: progress.due_at,
    id: progress.id,
    is_due: isDue(progress.due_at),
    lapse_count: progress.lapse_count ?? 0,
    last_reviewed_at: progress.last_reviewed_at,
    review_count: progress.review_count,
    state: progress.state,
  };
}

function matchesReviewFilter(
  progress: OwnerWordProgressSummary | null,
  reviewFilter: ReviewFilter,
) {
  if (reviewFilter === "all") {
    return true;
  }

  if (reviewFilter === "tracked") {
    return Boolean(progress);
  }

  if (reviewFilter === "due") {
    return Boolean(progress && progress.state !== "suspended" && progress.is_due);
  }

  return !progress;
}

function canUseDatabaseFilteredPublicWordsPath(
  filters: NormalizedWordQueryFilters,
  isOwner: boolean,
) {
  return (
    !isOwner &&
    filters.review === "all" &&
    filters.q === "" &&
    (filters.semantic !== "" || filters.freq !== "")
  );
}

function applyDatabaseWordMetadataFilters<
  T extends {
    contains: (column: string, value: Record<string, string>) => T;
  },
>(query: T, filters: NormalizedWordQueryFilters) {
  let nextQuery = query;

  if (filters.semantic) {
    nextQuery = nextQuery.contains("metadata", {
      semantic_field: filters.semantic,
    });
  }

  if (filters.freq) {
    nextQuery = nextQuery.contains("metadata", {
      word_freq: filters.freq,
    });
  }

  return nextQuery;
}

async function loadLegacyPublicWordFilterOptions(
  supabase: ReturnType<typeof getPublicSupabaseClientOrNull>,
): Promise<PublicWordFilterOptions> {
  if (!supabase) {
    return {
      frequencies: [],
      semanticFields: [],
    };
  }

  const { data, error } = await supabase
    .from("words")
    .select(WORD_FILTER_METADATA_SELECT)
    .eq("is_published", true)
    .eq("is_deleted", false);

  if (error) {
    throw error;
  }

  return buildPublicWordFilterOptions((data ?? []) as BarePublicWordMetadataRow[]);
}

async function getOwnerProgressMap(
  ownerUserId: string,
  supabase: ServerSupabaseClient,
) {
  const { data, error } = await supabase
    .from("user_word_progress")
    .select(
      "word_id, id, due_at, review_count, state, last_reviewed_at, lapse_count, again_count",
    )
    .eq("user_id", ownerUserId);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as Array<{
      again_count: number | null;
      due_at: string | null;
      id: string;
      lapse_count: number | null;
      last_reviewed_at: string | null;
      review_count: number;
      state: string;
      word_id: string;
    }>).map((entry) => [entry.word_id, serializeOwnerWordProgress(entry)]),
  );
}

export function resolveWordHref(label: string, availableSlugs?: Set<string>) {
  const slug = slugifyLabel(label);
  if (!slug) {
    return null;
  }

  if (availableSlugs && !availableSlugs.has(slug)) {
    return null;
  }

  return `/words/${slug}`;
}

export function resolveSynonymItems(
  items: SynonymItem[],
  availableSlugs?: Set<string>,
): ResolvedSynonymItem[] {
  return items.map((item) => ({
    ...item,
    href: resolveWordHref(item.word, availableSlugs),
  }));
}

export function resolveAntonymItems(
  items: AntonymItem[],
  availableSlugs?: Set<string>,
): ResolvedAntonymItem[] {
  return items.map((item) => ({
    ...item,
    href: resolveWordHref(item.word, availableSlugs),
  }));
}

function getMetadataField<T>(metadata: Json, key: string): T | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, Json>)[key];
  return value == null ? null : (value as unknown as T);
}

function getMetadataArray<T>(metadata: Json, key: string): T[] {
  const raw = getMetadataField<unknown>(metadata, key);
  return Array.isArray(raw) ? (raw as T[]) : [];
}

function withStructuredFallback(
  word: Record<string, Json | string | null>,
): Omit<PublicWordDetail, "progress" | "tags"> {
  const structuredDefaults = createEmptyStructuredWordFields();
  const metadata = (word.metadata as Json) ?? {};

  return {
    antonym_items: parseStructuredArray(word.antonym_items as Json, isAntonymItem),
    body_md: String(word.body_md ?? ""),
    collocations: parseCollocationItems(word.collocations as Json),
    core_definitions: parseStructuredArray(word.core_definitions as Json, isCoreDefinition),
    corpus_items: parseStructuredArray(word.corpus_items as Json, isCorpusItem),
    definition_md: String(word.definition_md ?? ""),
    derived_words: getMetadataArray<DerivedWord>(metadata, "derived_words"),
    examples: (word.examples as Json) ?? [],
    id: String(word.id),
    ipa: (word.ipa as string | null) ?? null,
    lemma: String(word.lemma),
    metadata,
    mnemonic: getMetadataField<Mnemonic>(metadata, "mnemonic"),
    morphology: getMetadataField<Morphology>(metadata, "morphology"),
    pos: (word.pos as string | null) ?? null,
    pos_conversions: getMetadataArray<PosConversion>(metadata, "pos_conversions"),
    prototype_text:
      (word.prototype_text as string | null) ??
      getWordMetadataString(metadata, "prototype") ??
      structuredDefaults.prototypeText,
    resolved_antonym_items: [],
    resolved_synonym_items: [],
    semantic_chain: getMetadataField<SemanticChain>(metadata, "semantic_chain"),
    short_definition: (word.short_definition as string | null) ?? null,
    slug: String(word.slug),
    source_path: String(word.source_path ?? ""),
    synonym_items: parseStructuredArray(word.synonym_items as Json, isSynonymItem),
    title: String(word.title),
    updated_at: String(word.updated_at),
  };
}

const getCachedPublicWordRows = unstable_cache(
  async (): Promise<CachedPublicWordIndexRecord[] | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry("public word index", async () => {
        const { data, error } = await supabase
          .from("words")
          .select(WORD_SELECT)
          .eq("is_published", true)
          .eq("is_deleted", false)
          .order("lemma");

        if (error) {
          throw error;
        }

        return ((data ?? []) as BarePublicWordSummary[]).map(toCachedPublicWordIndexRecord);
      });
    } catch (err) {
      console.error("[words] Failed to fetch public word index:", err);
      return null;
    }
  },
  ["public-word-rows"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedDefaultPublicWordRows = unstable_cache(
  async (offset: number, limit: number): Promise<CachedPublicWordIndexRecord[] | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry(
        `default public word rows offset=${offset} limit=${limit}`,
        async () => {
          const { data, error } = await supabase
            .from("words")
            .select(WORD_SELECT)
            .eq("is_published", true)
            .eq("is_deleted", false)
            .order("lemma")
            .range(offset, offset + limit - 1);

          if (error) {
            throw error;
          }

          return ((data ?? []) as BarePublicWordSummary[]).map(toCachedPublicWordIndexRecord);
        },
      );
    } catch (err) {
      console.error("[words] Failed to fetch default public word rows:", err);
      return null;
    }
  },
  ["public-default-word-rows"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedFilteredPublicWordRows = unstable_cache(
  async (
    semantic: string,
    freq: string,
    offset: number,
    limit: number,
  ): Promise<PublicWordRowsPage | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry(
        `filtered public word rows semantic=${semantic || "-"} freq=${freq || "-"} offset=${offset} limit=${limit}`,
        async () => {
          const query = applyDatabaseWordMetadataFilters(
            supabase
              .from("words")
              .select(WORD_SELECT, { count: "exact" })
              .eq("is_published", true)
              .eq("is_deleted", false)
              .order("lemma")
              .range(offset, offset + limit - 1),
            {
              freq,
              q: "",
              review: "all",
              semantic,
            },
          );
          const { data, error, count } = await query;

          if (error) {
            throw error;
          }

          return {
            rows: ((data ?? []) as BarePublicWordSummary[]).map(toCachedPublicWordIndexRecord),
            total: count ?? 0,
          };
        },
      );
    } catch (err) {
      console.error("[words] Failed to fetch filtered public word rows:", err);
      return null;
    }
  },
  ["public-filtered-word-rows"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedPublicWordFilterOptions = unstable_cache(
  async (): Promise<PublicWordFilterOptions> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return {
        frequencies: [],
        semanticFields: [],
      };
    }

    try {
      return await withTransientPublicReadRetry("public word filter options", async () => {
        const { data, error } = await supabase
          .from("word_filter_facets")
          .select("dimension, value, count, updated_at")
          .gt("count", 0)
          .order("value");

        if (isWordFilterFacetRelationMissing(error)) {
          return await loadLegacyPublicWordFilterOptions(supabase);
        }

        if (error) {
          throw error;
        }

        const facetRows = (data ?? []) as BareWordFilterFacetRow[];
        if (facetRows.length === 0) {
          return await loadLegacyPublicWordFilterOptions(supabase);
        }

        return buildPublicWordFilterOptionsFromFacetRows(facetRows);
      });
    } catch (err) {
      console.error("[words] Failed to fetch public word filter options:", err);
      return {
        frequencies: [],
        semanticFields: [],
      };
    }
  },
  ["public-word-filter-options"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedPublicWordSlugs = unstable_cache(
  async (): Promise<string[] | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry("public word slugs", async () => {
        const { data, error } = await supabase
          .from("words")
          .select(WORD_SLUG_SELECT)
          .eq("is_published", true)
          .eq("is_deleted", false)
          .order("lemma");

        if (error) {
          throw error;
        }

        return ((data ?? []) as Array<{ slug: string }>).map((row) => row.slug);
      });
    } catch (err) {
      console.error("[words] Failed to fetch public word slugs:", err);
      return null;
    }
  },
  ["public-word-slugs"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedStaticPublicWordSlugs = unstable_cache(
  async (limit: number): Promise<string[] | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry(
        `static public word slugs limit=${limit}`,
        async () => {
          const { data, error } = await supabase
            .from("words")
            .select(WORD_SLUG_SELECT)
            .eq("is_published", true)
            .eq("is_deleted", false)
            .order("updated_at", { ascending: false })
            .order("lemma")
            .limit(limit);

          if (error) {
            throw error;
          }

          return ((data ?? []) as Array<{ slug: string }>).map((row) => row.slug);
        },
      );
    } catch (err) {
      console.error("[words] Failed to fetch static public word slugs:", err);
      return null;
    }
  },
  ["public-static-word-slugs"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedPublicWordMetadataRecord = unstable_cache(
  async (slug: string): Promise<PublicWordMetadataRecord | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry(
        `word metadata slug "${slug}"`,
        async () => {
          const { data, error } = await supabase
            .from("words")
            .select(WORD_METADATA_SELECT)
            .eq("slug", escapePostgrestLike(slug))
            .eq("is_published", true)
            .eq("is_deleted", false)
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (!data) {
            return null;
          }

          return {
            lemma: String(data.lemma),
            short_definition: (data.short_definition as string | null) ?? null,
            slug: String(data.slug),
            title: String(data.title),
          } satisfies PublicWordMetadataRecord;
        },
      );
    } catch (err) {
      console.error(`[words] Failed to fetch metadata for slug "${slug}":`, err);
      return null;
    }
  },
  ["public-word-metadata"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordDetail],
  },
);

const getCachedFeaturedWordRows = unstable_cache(
  async (): Promise<CachedPublicWordIndexRecord[] | null> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry("featured public words", async () => {
        const { data, error } = await supabase
          .from("words")
          .select(WORD_SELECT)
          .eq("is_published", true)
          .eq("is_deleted", false)
          .order("updated_at", { ascending: false })
          .limit(FEATURED_WORD_LIMIT);

        if (error) {
          throw error;
        }

        return ((data ?? []) as BarePublicWordSummary[]).map(toCachedPublicWordIndexRecord);
      });
    } catch (err) {
      console.error("[words] Failed to fetch featured public words:", err);
      return null;
    }
  },
  ["public-featured-word-rows"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.landing, PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedPublicWordsCountValue = unstable_cache(
  async (): Promise<number> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return 0;
    }

    try {
      return await withTransientPublicReadRetry("public word count", async () => {
        // Use select("id") + limit(1) instead of head:true to avoid
        // PostgREST HEAD-request edge cases where Content-Range is omitted.
        const { count, error } = await supabase
          .from("words")
          .select("id", { count: "exact" })
          .eq("is_published", true)
          .eq("is_deleted", false)
          .limit(1);

        if (error) {
          throw error;
        }

        return count ?? 0;
      });
    } catch (err) {
      console.error("[words] Failed to fetch public word count:", err);
      return 0;
    }
  },
  ["public-word-count-v2"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.landing, PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedPublicWordDetailRecord = unstable_cache(
  async (slug: string) => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
    }

    try {
      return await withTransientPublicReadRetry(
        `word detail slug "${slug}"`,
        async () => {
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
        return null;
      }

      const { data: tagRows, error: tagError } = await supabase
        .from("word_tags")
        .select("tags!inner(label, slug)")
        .eq("word_id", word.id as string);

      if (tagError) {
        throw tagError;
      }

      const publicWord = withStructuredFallback(word);
      const hasStructuredSynonyms = publicWord.synonym_items.length > 0;
      const hasStructuredAntonyms = publicWord.antonym_items.length > 0;
      const synonymSection = getSection(publicWord.body_md, "同义词辨析");
      const antonymSection = getSection(publicWord.body_md, "反义词");
      const [rawBodyHtml, rawDefinitionHtml, rawSynonymHtml, rawAntonymHtml] = await Promise.all([
        renderObsidianMarkdown(publicWord.body_md),
        publicWord.definition_md
          ? renderObsidianMarkdown(publicWord.definition_md)
          : Promise.resolve(""),
        !hasStructuredSynonyms && synonymSection
          ? renderObsidianMarkdown(synonymSection)
          : Promise.resolve(""),
        !hasStructuredAntonyms && antonymSection
          ? renderObsidianMarkdown(antonymSection)
          : Promise.resolve(""),
      ]);

      // Sanitize all rendered HTML to prevent XSS (defensive — never crash the page)
      let bodyHtml = rawBodyHtml;
      let definitionHtml = rawDefinitionHtml;
      let synonymHtml = rawSynonymHtml;
      let antonymHtml = rawAntonymHtml;
      try {
        const { sanitizeHtmlServer } = await import("@/lib/sanitize-server");
        bodyHtml = sanitizeHtmlServer(rawBodyHtml);
        definitionHtml = sanitizeHtmlServer(rawDefinitionHtml);
        synonymHtml = sanitizeHtmlServer(rawSynonymHtml);
        antonymHtml = sanitizeHtmlServer(rawAntonymHtml);
      } catch (sanitizeError) {
        console.error("[words] HTML sanitization skipped:", sanitizeError);
      }

      return {
        ...publicWord,
        antonym_html: antonymHtml,
        body_html: bodyHtml,
        definition_html: definitionHtml,
        progress: null,
        resolved_antonym_items: resolveAntonymItems(publicWord.antonym_items),
        resolved_synonym_items: resolveSynonymItems(publicWord.synonym_items),
        synonym_html: synonymHtml,
        tags: ((tagRows ?? []) as unknown as Array<{ tags: { label: string; slug: string } }>).map(
          (row) => row.tags,
        ),
      } satisfies CachedPublicWordDetail;
        },
      );
    } catch (err) {
      // Graceful degradation during SSG: log the error but don't crash the build.
      // The page will show a "word not found" shell; ISR will retry on revalidation.
      console.error(`[words] Failed to fetch detail for slug "${slug}":`, err);
      return null;
    }
  },
  ["public-word-detail"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordDetail],
  },
);

export const getLandingSnapshot = unstable_cache(
  async (): Promise<LandingSnapshot> => {
    const repoName = `${env.repoOwner}/${env.repoName}`;

    if (!hasSupabasePublicEnv()) {
      return {
        configured: false,
        featuredWords: [],
        repoName,
        totalWords: 0,
      };
    }

    const [featuredRows, totalWords] = await Promise.all([
      getCachedFeaturedWordRows(),
      getCachedPublicWordsCountValue(),
    ]);
    const featuredWords = [...(featuredRows ?? [])]
      .map((word) => toPublicWordSummary(word, null));

    return {
      configured: true,
      featuredWords,
      repoName,
      totalWords,
    };
  },
  ["public-landing-snapshot-v2"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.landing],
  },
);

export async function getPublicWords(
  filters?: WordQueryFilters,
  options?: GetPublicWordsOptions,
): Promise<PublicWordsResponse> {
  const isOwner = Boolean(options?.ownerUserId && options.ownerSupabase);
  const pagination = normalizeWordPagination(options?.pagination);
  const normalizedFilters = normalizeWordFilters(filters, {
    allowReviewFilter: isOwner,
  });

  if (!hasSupabasePublicEnv()) {
    return {
      ...createPublicWordsShellResponse(normalizedFilters, pagination),
      configured: false,
      isOwner,
    };
  }

  const publicFilterOptionsPromise = getCachedPublicWordFilterOptions();

  if (!isOwner && isDefaultPublicWordFilters(normalizedFilters)) {
    const [defaultRows, filterOptions, total] = await Promise.all([
      getCachedDefaultPublicWordRows(pagination.offset, pagination.limit),
      publicFilterOptionsPromise,
      getCachedPublicWordsCountValue(),
    ]);
    const visibleWords = (defaultRows ?? []).map((word) => toPublicWordSummary(word, null));
    const pageState = createPublicWordsPageState(total, pagination, visibleWords.length);

    return {
      configured: true,
      ...pageState,
      filterOptions,
      filters: normalizedFilters,
      isOwner: false,
      words: visibleWords,
    };
  }

  if (canUseDatabaseFilteredPublicWordsPath(normalizedFilters, isOwner)) {
    const [filteredPage, filterOptions] = await Promise.all([
      getCachedFilteredPublicWordRows(
        normalizedFilters.semantic,
        normalizedFilters.freq,
        pagination.offset,
        pagination.limit,
      ),
      publicFilterOptionsPromise,
    ]);
    const visibleWords = (filteredPage?.rows ?? []).map((word) => toPublicWordSummary(word, null));
    const pageState = createPublicWordsPageState(
      filteredPage?.total ?? visibleWords.length,
      pagination,
      visibleWords.length,
    );

    return {
      configured: true,
      ...pageState,
      filterOptions,
      filters: normalizedFilters,
      isOwner: false,
      words: visibleWords,
    };
  }

  const [allWords, ownerProgressMap, filterOptions] = await Promise.all([
    getCachedPublicWordRows(),
    isOwner
      ? getOwnerProgressMap(options!.ownerUserId!, options!.ownerSupabase!)
      : Promise.resolve(new Map<string, OwnerWordProgressSummary>()),
    publicFilterOptionsPromise,
  ]);

  const safeWords = allWords ?? [];

  const filtered = safeWords.filter((word) => {
    if (!matchesQuery(word, normalizedFilters.q)) {
      return false;
    }

    if (normalizedFilters.semantic && word.semantic_field !== normalizedFilters.semantic) {
      return false;
    }

    if (normalizedFilters.freq && word.word_freq !== normalizedFilters.freq) {
      return false;
    }

    if (!matchesReviewFilter(ownerProgressMap.get(word.id) ?? null, normalizedFilters.review)) {
      return false;
    }

    return true;
  });

  const visibleWords = filtered
    .slice(pagination.offset, pagination.offset + pagination.limit)
    .map((word) =>
      toPublicWordSummary(word, isOwner ? (ownerProgressMap.get(word.id) ?? null) : null),
    );
  const pageState = createPublicWordsPageState(filtered.length, pagination, visibleWords.length);

  return {
    configured: true,
    ...pageState,
    filterOptions,
    filters: normalizedFilters,
    isOwner,
    words: visibleWords,
  };
}

export async function getPublicWordBySlug(slug: string) {
  if (!hasSupabasePublicEnv()) {
    return {
      configured: false,
      word: null as CachedPublicWordDetail | null,
    };
  }

  return {
    configured: true,
    word: await getCachedPublicWordDetailRecord(slug),
  };
}

export async function getPublicWordMetadataBySlug(slug: string) {
  if (!hasSupabasePublicEnv()) {
    return {
      configured: false,
      word: null as PublicWordMetadataRecord | null,
    };
  }

  return {
    configured: true,
    word: await getCachedPublicWordMetadataRecord(slug),
  };
}

export async function getPublicWordsCount() {
  if (!hasSupabasePublicEnv()) {
    return 0;
  }

  return getCachedPublicWordsCountValue();
}

export async function getStaticPublicWordSlugs(limit?: number) {
  if (!hasSupabasePublicEnv()) {
    return [];
  }

  if (typeof limit === "number") {
    return (await getCachedStaticPublicWordSlugs(limit)) ?? [];
  }

  return (await getCachedPublicWordSlugs()) ?? [];
}

export async function getAllPublicWordIndexEntries(): Promise<PublicWordIndexEntry[]> {
  if (!hasSupabasePublicEnv()) {
    return [];
  }

  return ((await getCachedPublicWordRows()) ?? []).map(toPublicWordIndexEntry);
}
