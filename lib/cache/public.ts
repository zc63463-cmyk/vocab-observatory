import { revalidateTag } from "next/cache";

export const PUBLIC_CACHE_TAGS = {
  landing: "public:landing",
  plazaDetail: "public:plaza:detail",
  plazaIndex: "public:plaza:index",
  wordDetail: "public:words:detail",
  wordIndex: "public:words:index",
} as const;

export type PublicCacheTag = (typeof PUBLIC_CACHE_TAGS)[keyof typeof PUBLIC_CACHE_TAGS];

export interface PublicContentRevalidationScope {
  /** Words/word-derived caches (index, detail, landing featured + count). */
  words?: boolean;
  /** Plaza / collection-note caches (index + detail). */
  collections?: boolean;
}

export function getAllPublicCacheTags(): PublicCacheTag[] {
  return Object.values(PUBLIC_CACHE_TAGS);
}

/**
 * Resolve which cache tags should be invalidated for a given scope.
 * - `words` touches `wordIndex`, `wordDetail`, and `landing` (homepage
 *   featured words + count are derived from the words table).
 * - `collections` touches `plazaIndex` + `plazaDetail`.
 * When no scope is provided, every public tag is returned (legacy behaviour).
 */
export function resolvePublicCacheTags(
  scope?: PublicContentRevalidationScope,
): PublicCacheTag[] {
  if (!scope) {
    return getAllPublicCacheTags();
  }

  const tags = new Set<PublicCacheTag>();
  if (scope.words) {
    tags.add(PUBLIC_CACHE_TAGS.wordIndex);
    tags.add(PUBLIC_CACHE_TAGS.wordDetail);
    tags.add(PUBLIC_CACHE_TAGS.landing);
  }
  if (scope.collections) {
    tags.add(PUBLIC_CACHE_TAGS.plazaIndex);
    tags.add(PUBLIC_CACHE_TAGS.plazaDetail);
  }
  return [...tags];
}

/**
 * Invalidate public ISR caches. Pass a scope to only clear the tags affected
 * by an upstream change — defaults to clearing everything for backwards
 * compatibility. Returns the tags actually invalidated (for logging/tests).
 */
export function revalidatePublicContent(
  scope?: PublicContentRevalidationScope,
): PublicCacheTag[] {
  const tags = resolvePublicCacheTags(scope);
  for (const tag of tags) {
    revalidateTag(tag, "max");
  }
  return tags;
}

export interface ImportRevalidationSignals {
  created?: number;
  updated?: number;
  softDeleted?: number;
  collectionNotesCreated?: number;
  collectionNotesUpdated?: number;
  collectionNotesSoftDeleted?: number;
}

/**
 * Derive which public-cache scopes actually need revalidation after an import
 * run. Returns `null` when nothing user-visible changed — in that case callers
 * should skip `revalidatePublicContent` entirely to avoid cache stampedes on
 * no-op cron runs.
 *
 * A re-upsert of `unchanged` rows does NOT count: the row's `updated_at` gets
 * bumped, but the derived content served to visitors is identical, so the
 * existing ISR cache is still valid.
 */
export function derivePublicContentScope(
  signals: ImportRevalidationSignals,
): PublicContentRevalidationScope | null {
  const wordsChanged =
    (signals.created ?? 0) +
      (signals.updated ?? 0) +
      (signals.softDeleted ?? 0) >
    0;
  const collectionsChanged =
    (signals.collectionNotesCreated ?? 0) +
      (signals.collectionNotesUpdated ?? 0) +
      (signals.collectionNotesSoftDeleted ?? 0) >
    0;

  if (!wordsChanged && !collectionsChanged) {
    return null;
  }

  return {
    collections: collectionsChanged,
    words: wordsChanged,
  };
}
