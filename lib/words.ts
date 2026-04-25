import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { env, hasSupabasePublicEnv } from "@/lib/env";
import { getSection, renderObsidianMarkdown } from "@/lib/markdown";
import { getPublicSupabaseClientOrNull } from "@/lib/supabase/public";
import {
  createEmptyStructuredWordFields,
  isStructuredWordColumnsMissing,
  type AntonymItem,
  type CollocationExample,
  type CollocationItem,
  type CoreDefinition,
  type CorpusItem,
  type SynonymItem,
} from "@/lib/structured-word";
import { escapePostgrestLike, slugifyLabel } from "@/lib/utils";
import type { Database, Json } from "@/types/database.types";
import { PUBLIC_CACHE_TAGS } from "@/lib/cache/public";

const WORD_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at";
const WORD_DETAIL_LEGACY_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at, definition_md, body_md, examples, pos, source_path";
const WORD_DETAIL_STRUCTURED_SELECT =
  `${WORD_DETAIL_LEGACY_SELECT}, core_definitions, prototype_text, collocations, corpus_items, synonym_items, antonym_items`;
const DISPLAY_LIMIT = 120;
const PUBLIC_REVALIDATE_SECONDS = 300;

type ServerSupabaseClient = SupabaseClient<Database>;

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

export type PublicWordIndexEntry = Omit<PublicWordSummary, "progress">;

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
  resolved_antonym_items: ResolvedAntonymItem[];
  resolved_synonym_items: ResolvedSynonymItem[];
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

export interface NormalizedWordQueryFilters {
  freq: string;
  q: string;
  review: ReviewFilter;
  semantic: string;
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
  truncated: boolean;
  words: PublicWordSummary[];
}

export interface LandingSnapshot {
  configured: boolean;
  featuredWords: PublicWordSummary[];
  repoName: string;
  totalWords: number;
}

interface CachedPublicWordIndexRecord extends PublicWordIndexEntry {
  search_text: string;
  semantic_field: string | null;
  word_freq: string | null;
}

interface GetPublicWordsOptions {
  ownerSupabase?: ServerSupabaseClient | null;
  ownerUserId?: string | null;
}

type BarePublicWordSummary = PublicWordIndexEntry;

function isReviewFilter(value: string | undefined): value is ReviewFilter {
  return value === "all" || value === "tracked" || value === "due" || value === "untracked";
}

function compactPublicMetadata(metadata: Json) {
  return {
    semantic_field: getWordMetadataString(metadata, "semantic_field"),
    word_freq: getWordMetadataString(metadata, "word_freq"),
  } satisfies Json;
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
  due_at: string | null;
  id: string;
  last_reviewed_at: string | null;
  review_count: number;
  state: string;
}): OwnerWordProgressSummary {
  return {
    due_at: progress.due_at,
    id: progress.id,
    is_due: isDue(progress.due_at),
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

async function getOwnerProgressMap(
  ownerUserId: string,
  supabase: ServerSupabaseClient,
) {
  const { data, error } = await supabase
    .from("user_word_progress")
    .select("word_id, id, due_at, review_count, state, last_reviewed_at")
    .eq("user_id", ownerUserId);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as Array<{
      due_at: string | null;
      id: string;
      last_reviewed_at: string | null;
      review_count: number;
      state: string;
      word_id: string;
    }>).map((entry) => [entry.word_id, serializeOwnerWordProgress(entry)]),
  );
}

export function resolveWordHref(label: string, availableSlugs: Set<string>) {
  const slug = slugifyLabel(label);
  if (!slug || !availableSlugs.has(slug)) {
    return null;
  }

  return `/words/${slug}`;
}

export function resolveSynonymItems(
  items: SynonymItem[],
  availableSlugs: Set<string>,
): ResolvedSynonymItem[] {
  return items.map((item) => ({
    ...item,
    href: resolveWordHref(item.word, availableSlugs),
  }));
}

export function resolveAntonymItems(
  items: AntonymItem[],
  availableSlugs: Set<string>,
): ResolvedAntonymItem[] {
  return items.map((item) => ({
    ...item,
    href: resolveWordHref(item.word, availableSlugs),
  }));
}

function withStructuredFallback(
  word: Record<string, Json | string | null>,
): Omit<PublicWordDetail, "progress" | "tags"> {
  const structuredDefaults = createEmptyStructuredWordFields();

  return {
    antonym_items: parseStructuredArray(word.antonym_items as Json, isAntonymItem),
    body_md: String(word.body_md ?? ""),
    collocations: parseCollocationItems(word.collocations as Json),
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
      getWordMetadataString((word.metadata as Json) ?? {}, "prototype") ??
      structuredDefaults.prototypeText,
    resolved_antonym_items: [],
    resolved_synonym_items: [],
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
  },
  ["public-word-rows"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.wordIndex],
  },
);

const getCachedPublicWordDetailRecord = unstable_cache(
  async (slug: string) => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return null;
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
    const availableSlugs = new Set(
      ((await getCachedPublicWordRows()) ?? []).map((entry) => entry.slug),
    );
    const synonymSection = getSection(publicWord.body_md, "同义词辨析");
    const antonymSection = getSection(publicWord.body_md, "反义词");
    const [rawBodyHtml, rawDefinitionHtml, rawSynonymHtml, rawAntonymHtml] = await Promise.all([
      renderObsidianMarkdown(publicWord.body_md),
      publicWord.definition_md
        ? renderObsidianMarkdown(publicWord.definition_md)
        : Promise.resolve(""),
      synonymSection ? renderObsidianMarkdown(synonymSection) : Promise.resolve(""),
      antonymSection ? renderObsidianMarkdown(antonymSection) : Promise.resolve(""),
    ]);

    // Sanitize all rendered HTML to prevent XSS
    const { sanitizeHtmlServer } = await import("@/lib/sanitize-server");
    const [bodyHtml, definitionHtml, synonymHtml, antonymHtml] = [
      sanitizeHtmlServer(rawBodyHtml),
      sanitizeHtmlServer(rawDefinitionHtml),
      sanitizeHtmlServer(rawSynonymHtml),
      sanitizeHtmlServer(rawAntonymHtml),
    ];

    return {
      ...publicWord,
      antonym_html: antonymHtml,
      body_html: bodyHtml,
      definition_html: definitionHtml,
      progress: null,
      resolved_antonym_items: resolveAntonymItems(publicWord.antonym_items, availableSlugs),
      resolved_synonym_items: resolveSynonymItems(publicWord.synonym_items, availableSlugs),
      synonym_html: synonymHtml,
      tags: ((tagRows ?? []) as Array<{ tags: { label: string; slug: string } }>).map(
        (row) => row.tags,
      ),
    } satisfies CachedPublicWordDetail;
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

    const rows = await getCachedPublicWordRows();
    const featuredWords = [...(rows ?? [])]
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, 6)
      .map((word) => toPublicWordSummary(word, null));

    return {
      configured: true,
      featuredWords,
      repoName,
      totalWords: rows?.length ?? 0,
    };
  },
  ["public-landing-snapshot"],
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
  const normalizedFilters = normalizeWordFilters(filters, {
    allowReviewFilter: isOwner,
  });

  if (!hasSupabasePublicEnv()) {
    return {
      configured: false,
      counts: { showing: 0, total: 0 },
      filterOptions: {
        frequencies: [],
        semanticFields: [],
      },
      filters: normalizedFilters,
      isOwner,
      truncated: false,
      words: [],
    };
  }

  const [allWords, ownerProgressMap] = await Promise.all([
    getCachedPublicWordRows(),
    isOwner
      ? getOwnerProgressMap(options!.ownerUserId!, options!.ownerSupabase!)
      : Promise.resolve(new Map<string, OwnerWordProgressSummary>()),
  ]);

  const safeWords = allWords ?? [];
  const semanticFields = [
    ...new Set(
      safeWords
        .map((word) => word.semantic_field)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const frequencies = [
    ...new Set(
      safeWords
        .map((word) => word.word_freq)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));

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

  const visibleWords = filtered.slice(0, DISPLAY_LIMIT).map((word) =>
    toPublicWordSummary(word, isOwner ? (ownerProgressMap.get(word.id) ?? null) : null),
  );

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
    filters: normalizedFilters,
    isOwner,
    truncated: filtered.length > visibleWords.length,
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

export async function getPublicWordsCount() {
  if (!hasSupabasePublicEnv()) {
    return 0;
  }

  const rows = await getCachedPublicWordRows();
  return rows?.length ?? 0;
}

export async function getAllPublicWordIndexEntries(): Promise<PublicWordIndexEntry[]> {
  if (!hasSupabasePublicEnv()) {
    return [];
  }

  return ((await getCachedPublicWordRows()) ?? []).map(toPublicWordIndexEntry);
}
