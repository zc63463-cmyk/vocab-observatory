import { unstable_cache } from "next/cache";
import { PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import {
  createCollectionNotePath,
  createCollectionNoteSlug,
  getCollectionNoteKindLabel,
  getCollectionNoteSlugLookupValues,
  getDirectCollectionNoteSlugValues,
  getCollectionNoteSummaryText,
  isCollectionNotesRelationMissing,
  type CollectionNoteKind,
  type PublicCollectionNoteDetail,
  type PublicCollectionNoteSummary,
  type PublicCollectionRelatedWord,
} from "@/lib/collection-notes";
import { hasSupabasePublicEnv } from "@/lib/env";
import { renderObsidianMarkdown } from "@/lib/markdown";
import { getPublicSupabaseClientOrNull } from "@/lib/supabase/public";
import {
  getAllPublicWordIndexEntries,
  getWordMetadataString,
  type PublicWordIndexEntry,
} from "@/lib/words";
import type { Database, Json } from "@/types/database.types";

const COLLECTION_NOTE_SELECT =
  "id, slug, kind, title, summary, metadata, tags, related_word_slugs, updated_at";
const PUBLIC_REVALIDATE_SECONDS = 300;
const KIND_ORDER: CollectionNoteKind[] = ["root_affix", "semantic_field"];

type CollectionNoteRow = Database["public"]["Tables"]["collection_notes"]["Row"];
type CachedCollectionSummariesResult =
  | { notes: CachedCollectionNoteSummary[]; status: "ok" }
  | { notes: []; status: "missing_env" | "missing_relation" };
type CachedCollectionDetailResult =
  | { note: PublicCollectionNoteDetail | null; status: "ok" }
  | { note: null; status: "missing_env" | "missing_relation" };

interface CachedCollectionNoteSummary extends PublicCollectionNoteSummary {
  search_text: string;
}

export type PlazaFilterKind = "all" | CollectionNoteKind;

export interface PlazaFilters {
  kind: PlazaFilterKind;
  q: string;
}

export interface PlazaNoteGroup {
  count: number;
  kind: CollectionNoteKind;
  label: string;
  notes: PublicCollectionNoteSummary[];
}

export interface PlazaOverview {
  available: boolean;
  configured: boolean;
  counts: {
    showing: number;
    total: number;
  };
  filters: PlazaFilters;
  groups: PlazaNoteGroup[];
  total: number;
}

export type PlazaOverviewResponse = PlazaOverview;

function isCollectionNoteKind(value: string): value is CollectionNoteKind {
  return value === "root_affix" || value === "semantic_field";
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

function buildCollectionSearchText(note: Pick<PublicCollectionNoteSummary, "metadata" | "summary" | "tags" | "title">) {
  return [
    note.title,
    note.summary ?? "",
    getMetadataString(note.metadata, "coreMeaning") ?? "",
    getMetadataString(note.metadata, "definition") ?? "",
    ...note.tags,
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function toCachedSummary(row: CollectionNoteRow): CachedCollectionNoteSummary {
  const summary: PublicCollectionNoteSummary = {
    id: row.id,
    kind: isCollectionNoteKind(row.kind) ? row.kind : "semantic_field",
    metadata: row.metadata,
    related_word_slugs: row.related_word_slugs ?? [],
    slug: row.slug,
    summary: row.summary,
    tags: row.tags ?? [],
    title: row.title,
    updated_at: row.updated_at,
  };

  return {
    ...summary,
    search_text: buildCollectionSearchText(summary),
  };
}

function toPublicSummary(summary: CachedCollectionNoteSummary): PublicCollectionNoteSummary {
  return {
    id: summary.id,
    kind: summary.kind,
    metadata: summary.metadata,
    related_word_slugs: summary.related_word_slugs,
    slug: summary.slug,
    summary: summary.summary,
    tags: summary.tags,
    title: summary.title,
    updated_at: summary.updated_at,
  };
}

function toRelatedWord(word: PublicWordIndexEntry): PublicCollectionRelatedWord {
  return {
    id: word.id,
    ipa: word.ipa,
    lemma: word.lemma,
    metadata: word.metadata,
    short_definition: word.short_definition,
    slug: word.slug,
    title: word.title,
    updated_at: word.updated_at,
  };
}

function createCollectionNoteLookupValues(
  note: Pick<PublicCollectionNoteSummary, "kind" | "slug" | "title">,
) {
  return new Set(
    [
      ...getCollectionNoteSlugLookupValues(note.slug),
      ...getCollectionNoteSlugLookupValues(createCollectionNoteSlug(note.kind, note.title)),
    ].filter(Boolean),
  );
}

export function normalizePlazaFilters(filters?: Partial<PlazaFilters>): PlazaFilters {
  return {
    kind:
      filters?.kind === "root_affix" || filters?.kind === "semantic_field"
        ? filters.kind
        : "all",
    q: filters?.q?.trim() ?? "",
  };
}

function matchesCollectionQuery(
  note: PublicCollectionNoteSummary & { search_text?: string },
  query: string,
) {
  if (!query) {
    return true;
  }

  return (note.search_text ?? buildCollectionSearchText(note)).includes(
    query.normalize("NFKC").toLowerCase(),
  );
}

export function filterCollectionNotes<T extends PublicCollectionNoteSummary & { search_text?: string }>(
  notes: T[],
  filters?: Partial<PlazaFilters>,
) {
  const normalizedFilters = normalizePlazaFilters(filters);

  return notes.filter((note) => {
    if (normalizedFilters.kind !== "all" && note.kind !== normalizedFilters.kind) {
      return false;
    }

    if (!matchesCollectionQuery(note, normalizedFilters.q)) {
      return false;
    }

    return true;
  });
}

export function findCompatibleCollectionNote(
  notes: Pick<PublicCollectionNoteSummary, "kind" | "slug" | "title">[],
  requestedSlug: string,
) {
  const requestedLookups = new Set(getCollectionNoteSlugLookupValues(requestedSlug));

  return (
    notes.find((note) => {
      const noteLookups = createCollectionNoteLookupValues(note);
      for (const candidate of requestedLookups) {
        if (noteLookups.has(candidate)) {
          return true;
        }
      }

      return false;
    }) ?? null
  );
}

export function getCollectionNoteCanonicalPath(
  requestedSlug: string,
  matchedNote: Pick<PublicCollectionNoteSummary, "kind" | "slug" | "title">,
) {
  const directValues = new Set(getDirectCollectionNoteSlugValues(requestedSlug));
  const canonicalSlug = matchedNote.slug;

  if (directValues.has(canonicalSlug)) {
    return null;
  }

  const titleDerivedSlug = createCollectionNoteSlug(matchedNote.kind, matchedNote.title);
  if (directValues.has(titleDerivedSlug)) {
    return null;
  }

  return createCollectionNotePath(canonicalSlug);
}

async function getRelatedWords(note: PublicCollectionNoteSummary) {
  const allWords = await getAllPublicWordIndexEntries();

  if (note.kind === "root_affix") {
    const wordBySlug = new Map(allWords.map((word) => [word.slug, word]));

    return note.related_word_slugs
      .map((slug) => wordBySlug.get(slug))
      .filter((word): word is PublicWordIndexEntry => Boolean(word))
      .map(toRelatedWord);
  }

  return allWords
    .filter((word) => getWordMetadataString(word.metadata, "semantic_field") === note.title)
    .sort((left, right) => left.lemma.localeCompare(right.lemma, "zh-CN"))
    .map(toRelatedWord);
}

export const getCachedCollectionSummaries = unstable_cache(
  async (): Promise<CachedCollectionSummariesResult> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return {
        notes: [],
        status: "missing_env",
      };
    }

    const { data, error } = await supabase
      .from("collection_notes")
      .select(COLLECTION_NOTE_SELECT)
      .eq("is_published", true)
      .eq("is_deleted", false)
      .order("kind")
      .order("title");

    if (isCollectionNotesRelationMissing(error)) {
      return {
        notes: [],
        status: "missing_relation",
      };
    }

    if (error) {
      throw error;
    }

    return {
      notes: ((data ?? []) as CollectionNoteRow[]).map(toCachedSummary),
      status: "ok",
    };
  },
  ["public-collection-note-summaries"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.plazaIndex],
  },
);

const getCachedCollectionDetail = unstable_cache(
  async (slug: string): Promise<CachedCollectionDetailResult> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return {
        note: null,
        status: "missing_env",
      };
    }

    const { data, error } = await supabase
      .from("collection_notes")
      .select(`${COLLECTION_NOTE_SELECT}, body_md`)
      .eq("slug", slug)
      .eq("is_published", true)
      .eq("is_deleted", false)
      .maybeSingle();

    if (isCollectionNotesRelationMissing(error)) {
      return {
        note: null,
        status: "missing_relation",
      };
    }

    if (error) {
      throw error;
    }

    if (!data) {
      return {
        note: null,
        status: "ok",
      };
    }

    const noteRow = data as CollectionNoteRow & { body_md: string };
    const summary = toPublicSummary(toCachedSummary(noteRow));
    const [rawBodyHtml, relatedWords] = await Promise.all([
      renderObsidianMarkdown(noteRow.body_md),
      getRelatedWords(summary),
    ]);

    // Sanitize rendered HTML to prevent XSS (defensive — never crash the page)
    let bodyHtml = rawBodyHtml;
    try {
      const { sanitizeHtmlServer } = await import("@/lib/sanitize-server");
      bodyHtml = sanitizeHtmlServer(rawBodyHtml);
    } catch (sanitizeError) {
      console.error("[plaza] HTML sanitization skipped:", sanitizeError);
    }

    return {
      note: {
        ...summary,
        body_html: bodyHtml,
        body_md: noteRow.body_md,
        related_words: relatedWords,
      },
      status: "ok",
    };
  },
  ["public-collection-note-detail"],
  {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.plazaDetail],
  },
);

export async function getPlazaOverview(filters?: Partial<PlazaFilters>): Promise<PlazaOverview> {
  const normalizedFilters = normalizePlazaFilters(filters);

  if (!hasSupabasePublicEnv()) {
    return {
      available: false,
      configured: false,
      counts: {
        showing: 0,
        total: 0,
      },
      filters: normalizedFilters,
      groups: [],
      total: 0,
    };
  }

  const result = await getCachedCollectionSummaries();
  if (result.status !== "ok") {
    return {
      available: false,
      configured: true,
      counts: {
        showing: 0,
        total: 0,
      },
      filters: normalizedFilters,
      groups: [],
      total: 0,
    };
  }

  const filteredNotes = filterCollectionNotes(result.notes, normalizedFilters);
  const grouped = new Map<CollectionNoteKind, PublicCollectionNoteSummary[]>();
  for (const note of filteredNotes) {
    const bucket = grouped.get(note.kind) ?? [];
    bucket.push(toPublicSummary(note));
    grouped.set(note.kind, bucket);
  }

  return {
    available: true,
    configured: true,
    counts: {
      showing: filteredNotes.length,
      total: result.notes.length,
    },
    filters: normalizedFilters,
    groups: KIND_ORDER.map((kind) => ({
      count: grouped.get(kind)?.length ?? 0,
      kind,
      label: getCollectionNoteKindLabel(kind),
      notes: grouped.get(kind) ?? [],
    })).filter((group) => group.count > 0),
    total: result.notes.length,
  };
}

export async function getPublicCollectionNoteBySlug(slug: string) {
  if (!hasSupabasePublicEnv()) {
    return {
      available: false,
      canonicalPath: null as string | null,
      configured: false,
      note: null as PublicCollectionNoteDetail | null,
    };
  }

  const exactResult = await getCachedCollectionDetail(slug);
  if (exactResult.status !== "ok") {
    return {
      available: false,
      canonicalPath: null,
      configured: true,
      note: null,
    };
  }

  if (exactResult.note) {
    return {
      available: true,
      canonicalPath: null,
      configured: true,
      note: exactResult.note,
    };
  }

  const summariesResult = await getCachedCollectionSummaries();
  if (summariesResult.status !== "ok") {
    return {
      available: false,
      canonicalPath: null,
      configured: true,
      note: null,
    };
  }

  const matchedNote = findCompatibleCollectionNote(summariesResult.notes, slug);
  if (!matchedNote) {
    return {
      available: true,
      canonicalPath: null,
      configured: true,
      note: null,
    };
  }

  const canonicalDetail = await getCachedCollectionDetail(matchedNote.slug);
  if (canonicalDetail.status !== "ok") {
    return {
      available: false,
      canonicalPath: null,
      configured: true,
      note: null,
    };
  }

  return {
    available: true,
    canonicalPath: getCollectionNoteCanonicalPath(slug, matchedNote),
    configured: true,
    note: canonicalDetail.note,
  };
}

export { getCollectionNoteSummaryText };
