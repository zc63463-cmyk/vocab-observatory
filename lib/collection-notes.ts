import type { Json } from "@/types/database.types";
import { slugifyLabel } from "@/lib/utils";

export type CollectionNoteKind = "root_affix" | "semantic_field";

export interface ParsedCollectionNote {
  aliases: string[];
  bodyMd: string;
  contentHash: string;
  kind: CollectionNoteKind;
  metadata: Record<string, Json>;
  relatedWordSlugs: string[];
  slug: string;
  sourcePath: string;
  sourceUpdatedAt: string | null;
  summary: string | null;
  tags: string[];
  title: string;
}

export interface PublicCollectionNoteSummary {
  id: string;
  kind: CollectionNoteKind;
  metadata: Json;
  related_word_slugs: string[];
  slug: string;
  summary: string | null;
  tags: string[];
  title: string;
  updated_at: string;
}

export interface PublicCollectionRelatedWord {
  id: string;
  ipa: string | null;
  lemma: string;
  metadata: Json;
  short_definition: string | null;
  slug: string;
  title: string;
  updated_at: string;
}

export interface PublicCollectionNoteDetail extends PublicCollectionNoteSummary {
  body_html: string;
  body_md: string;
  related_words: PublicCollectionRelatedWord[];
}

export const COLLECTION_NOTE_PREFIXES: Record<CollectionNoteKind, string> = {
  root_affix: "Wiki/词根词缀",
  semantic_field: "Wiki/语义场",
};

export function detectCollectionNoteKind(sourcePath: string): CollectionNoteKind | null {
  if (sourcePath.startsWith(`${COLLECTION_NOTE_PREFIXES.root_affix}/`)) {
    return "root_affix";
  }

  if (sourcePath.startsWith(`${COLLECTION_NOTE_PREFIXES.semantic_field}/`)) {
    return "semantic_field";
  }

  return null;
}

export function createCollectionNoteSlug(kind: CollectionNoteKind, title: string) {
  const prefix = kind === "root_affix" ? "root" : "semantic";
  return `${prefix}-${slugifyLabel(title)}`;
}

export function getCollectionNoteKindLabel(kind: CollectionNoteKind) {
  return kind === "root_affix" ? "词根词缀" : "语义场";
}

export function shouldSkipCollectionNote(sourcePath: string) {
  const filename = sourcePath.split("/").pop() ?? "";
  return filename.startsWith("_模板-");
}

export function isCollectionNotesRelationMissing(
  error: { code?: string; message?: string } | null,
) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("collection_notes") === true
  );
}
