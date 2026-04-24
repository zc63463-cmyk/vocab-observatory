import type { ParsedWord } from "@/lib/sync/parseMarkdown";

export interface ExistingWordRef {
  content_hash: string;
  is_deleted: boolean;
  slug: string;
  source_path: string;
}

export interface WordSyncPlan {
  create: ParsedWord[];
  softDelete: ExistingWordRef[];
  unchanged: ParsedWord[];
  update: ParsedWord[];
}

export function planWordSync(existing: ExistingWordRef[], incoming: ParsedWord[]): WordSyncPlan {
  const bySlug = new Map(existing.map((item) => [item.slug, item]));
  const bySourcePath = new Map(existing.map((item) => [item.source_path, item]));
  const matchedSourcePaths = new Set<string>();
  const create: ParsedWord[] = [];
  const update: ParsedWord[] = [];
  const unchanged: ParsedWord[] = [];

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
