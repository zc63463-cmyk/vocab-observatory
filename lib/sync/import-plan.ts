import type { ParsedWord } from "@/lib/sync/parseMarkdown";

export interface ExistingSyncRef {
  content_hash: string;
  is_deleted: boolean;
  slug: string;
  source_path: string;
}

interface ParsedSyncEntity {
  contentHash: string;
  slug: string;
  sourcePath: string;
}

export interface EntitySyncPlan<T extends ParsedSyncEntity> {
  create: T[];
  softDelete: ExistingSyncRef[];
  unchanged: T[];
  update: T[];
}

export type ExistingWordRef = ExistingSyncRef;
export type WordSyncPlan = EntitySyncPlan<ParsedWord>;

export function planEntitySync<T extends ParsedSyncEntity>(
  existing: ExistingSyncRef[],
  incoming: T[],
): EntitySyncPlan<T> {
  const bySlug = new Map(existing.map((item) => [item.slug, item]));
  const bySourcePath = new Map(existing.map((item) => [item.source_path, item]));
  const matchedSourcePaths = new Set<string>();
  const create: T[] = [];
  const update: T[] = [];
  const unchanged: T[] = [];

  for (const word of incoming) {
    const matched = bySlug.get(word.slug) ?? bySourcePath.get(word.sourcePath);
    if (!matched) {
      create.push(word);
      continue;
    }

    matchedSourcePaths.add(matched.source_path);

    if (
      matched.content_hash !== word.contentHash ||
      matched.source_path !== word.sourcePath ||
      matched.is_deleted
    ) {
      update.push(word);
      continue;
    }

    unchanged.push(word);
  }

  const incomingSourcePaths = new Set(incoming.map((word) => word.sourcePath));
  const softDelete = existing.filter(
    (item) =>
      !incomingSourcePaths.has(item.source_path) && !matchedSourcePaths.has(item.source_path),
  );

  return {
    create,
    softDelete,
    unchanged,
    update,
  };
}

export function planWordSync(existing: ExistingWordRef[], incoming: ParsedWord[]): WordSyncPlan {
  return planEntitySync(existing, incoming);
}
