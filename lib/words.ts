import { unstable_cache } from "next/cache";
import { cache } from "react";
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
import type { Json } from "@/types/database.types";

const WORD_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at";
const WORD_DETAIL_LEGACY_SELECT =
  "id, slug, title, lemma, ipa, short_definition, metadata, updated_at, definition_md, body_md, examples, pos, source_path";
const WORD_DETAIL_STRUCTURED_SELECT =
  `${WORD_DETAIL_LEGACY_SELECT}, core_definitions, prototype_text, collocations, corpus_items, synonym_items, antonym_items`;
const DISPLAY_LIMIT = 120;
const PUBLIC_REVALIDATE_SECONDS = 300;

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

type BarePublicWordSummary = PublicWordIndexEntry;

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

function normalizeFilters(filters?: WordQueryFilters) {
  return {
    freq: filters?.freq?.trim() ?? "",
    q: filters?.q?.trim() ?? "",
    review: (filters?.review ?? "all") as ReviewFilter,
    semantic: filters?.semantic?.trim() ?? "",
  };
}

function matchesQuery(word: BarePublicWordSummary, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    word.lemma,
    word.title,
    word.short_definition ?? "",
    getWordMetadataString(word.metadata, "semantic_field") ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
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
  async () => {
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

    return ((data ?? []) as BarePublicWordSummary[]).map((row) => ({
      ...row,
      metadata: compactPublicMetadata(row.metadata),
    }));
  },
  ["public-word-rows"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
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
    const availableSlugs = new Set((await getCachedPublicWordRows())?.map((entry) => entry.slug) ?? []);
    const synonymSection = getSection(publicWord.body_md, "同义词辨析");
    const antonymSection = getSection(publicWord.body_md, "反义词");
    const [bodyHtml, definitionHtml, synonymHtml, antonymHtml] = await Promise.all([
      renderObsidianMarkdown(publicWord.body_md),
      publicWord.definition_md
        ? renderObsidianMarkdown(publicWord.definition_md)
        : Promise.resolve(""),
      synonymSection ? renderObsidianMarkdown(synonymSection) : Promise.resolve(""),
      antonymSection ? renderObsidianMarkdown(antonymSection) : Promise.resolve(""),
    ]);

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
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export const getLandingSnapshot = cache(async () => {
  const repoName = `${env.repoOwner}/${env.repoName}`;

  if (!hasSupabasePublicEnv()) {
    return {
      featuredWords: [] as PublicWordSummary[],
      repoName,
      totalWords: 0,
      configured: false,
    };
  }

  const rows = await getCachedPublicWordRows();
  const featuredWords = [...(rows ?? [])]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, 6)
    .map((word) => ({
      ...word,
      progress: null,
    }));

  return {
    configured: true,
    featuredWords,
    repoName,
    totalWords: rows?.length ?? 0,
  };
});

export async function getPublicWords(filters?: WordQueryFilters) {
  if (!hasSupabasePublicEnv()) {
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

  const allWords = await getCachedPublicWordRows();
  const normalizedFilters = normalizeFilters(filters);
  const safeWords = allWords ?? [];
  const semanticFields = [
    ...new Set(
      safeWords
        .map((word) => getWordMetadataString(word.metadata, "semantic_field"))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const frequencies = [
    ...new Set(
      safeWords
        .map((word) => getWordMetadataString(word.metadata, "word_freq"))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));

  const filtered = safeWords.filter((word) => {
    if (!matchesQuery(word, normalizedFilters.q)) {
      return false;
    }

    if (
      normalizedFilters.semantic &&
      getWordMetadataString(word.metadata, "semantic_field") !== normalizedFilters.semantic
    ) {
      return false;
    }

    if (
      normalizedFilters.freq &&
      getWordMetadataString(word.metadata, "word_freq") !== normalizedFilters.freq
    ) {
      return false;
    }

    return true;
  });

  const visibleWords = filtered.slice(0, DISPLAY_LIMIT).map((word) => ({
    ...word,
    progress: null,
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
      review: "all" as ReviewFilter,
    },
    isOwner: false,
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

  return (await getCachedPublicWordRows()) ?? [];
}
