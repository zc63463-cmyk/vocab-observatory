import { unstable_cache } from "next/cache";
import { hasSupabasePublicEnv } from "@/lib/env";
import {
  getCollectionNoteKindLabel,
  isCollectionNotesRelationMissing,
  type CollectionNoteKind,
  type PublicCollectionNoteDetail,
  type PublicCollectionNoteSummary,
  type PublicCollectionRelatedWord,
} from "@/lib/collection-notes";
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
type CachedCollectionRowsResult =
  | { rows: CollectionNoteRow[]; status: "ok" }
  | { rows: []; status: "missing_env" | "missing_relation" };
type CachedCollectionDetailResult =
  | { note: PublicCollectionNoteDetail | null; status: "ok" }
  | { note: null; status: "missing_env" | "missing_relation" };

export interface PlazaNoteGroup {
  count: number;
  kind: CollectionNoteKind;
  label: string;
  notes: PublicCollectionNoteSummary[];
}

export interface PlazaOverview {
  available: boolean;
  configured: boolean;
  groups: PlazaNoteGroup[];
  total: number;
}

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

function toSummary(row: CollectionNoteRow): PublicCollectionNoteSummary {
  return {
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
    .filter(
      (word) => getWordMetadataString(word.metadata, "semantic_field") === note.title,
    )
    .sort((left, right) => left.lemma.localeCompare(right.lemma, "zh-CN"))
    .map(toRelatedWord);
}

const getCachedCollectionRows = unstable_cache(
  async (): Promise<CachedCollectionRowsResult> => {
    const supabase = getPublicSupabaseClientOrNull();
    if (!supabase) {
      return {
        rows: [],
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
        rows: [],
        status: "missing_relation",
      };
    }

    if (error) {
      throw error;
    }

    return {
      rows: (data ?? []) as CollectionNoteRow[],
      status: "ok",
    };
  },
  ["public-collection-note-rows"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
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
    const summary = toSummary(noteRow);
    const [bodyHtml, relatedWords] = await Promise.all([
      renderObsidianMarkdown(noteRow.body_md),
      getRelatedWords(summary),
    ]);

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
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function getPlazaOverview(): Promise<PlazaOverview> {
  if (!hasSupabasePublicEnv()) {
    return {
      available: false,
      configured: false,
      groups: [],
      total: 0,
    };
  }

  const result = await getCachedCollectionRows();
  if (result.status !== "ok") {
    return {
      available: false,
      configured: true,
      groups: [],
      total: 0,
    };
  }

  const grouped = new Map<CollectionNoteKind, PublicCollectionNoteSummary[]>();
  for (const row of result.rows) {
    const summary = toSummary(row);
    const bucket = grouped.get(summary.kind) ?? [];
    bucket.push(summary);
    grouped.set(summary.kind, bucket);
  }

  return {
    available: true,
    configured: true,
    groups: KIND_ORDER.map((kind) => ({
      count: grouped.get(kind)?.length ?? 0,
      kind,
      label: getCollectionNoteKindLabel(kind),
      notes: grouped.get(kind) ?? [],
    })).filter((group) => group.count > 0),
    total: result.rows.length,
  };
}

export async function getPublicCollectionNoteBySlug(slug: string) {
  if (!hasSupabasePublicEnv()) {
    return {
      available: false,
      configured: false,
      note: null as PublicCollectionNoteDetail | null,
    };
  }

  const result = await getCachedCollectionDetail(slug);

  return {
    available: result.status === "ok",
    configured: true,
    note: result.note,
  };
}

export function getCollectionNoteSummaryText(note: PublicCollectionNoteSummary) {
  return (
    note.summary ||
    getMetadataString(note.metadata, "coreMeaning") ||
    getMetadataString(note.metadata, "definition") ||
    "暂无摘要。"
  );
}
