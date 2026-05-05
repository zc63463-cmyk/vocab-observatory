import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCollectionNotesRelationMissing,
  type ParsedCollectionNote,
} from "@/lib/collection-notes";
import { env } from "@/lib/env";
import {
  completeImportRun,
  createImportRun,
  insertImportErrors,
  type ImportFileError,
} from "@/lib/imports";
import {
  castStructuredWordJson,
  isStructuredWordColumnsMissing,
} from "@/lib/structured-word";
import { importWordsFromGitHubArchive } from "@/lib/sync/github-source";
import {
  planEntitySync,
  planWordSync,
  type ExistingSyncRef,
  type ExistingWordRef,
} from "@/lib/sync/import-plan";
import type { Database } from "@/types/database.types";
import { asJson } from "@/types/database.types";
import { chunkArray, slugifyLabel } from "@/lib/utils";

type AdminClient = SupabaseClient<Database>;
type ImportedWords = Awaited<ReturnType<typeof importWordsFromGitHubArchive>>["words"];
type ImportedCollections =
  Awaited<ReturnType<typeof importWordsFromGitHubArchive>>["collectionNotes"];
const WORD_FILTER_FACET_DIMENSIONS = ["semantic_field", "word_freq"] as const;
type WordFilterFacetDimension = (typeof WORD_FILTER_FACET_DIMENSIONS)[number];

function isWordFilterFacetRelationMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("word_filter_facets")
  );
}

function buildSourcePathLikeFilter(prefixes: readonly string[]) {
  // PostgREST requires `*` as the LIKE wildcard when the filter is embedded in
  // an `.or(...)` string — `%` conflicts with URL percent-encoding and silently
  // produces empty result sets or request errors (e.g. when the prefix itself
  // contains non-ASCII bytes like `L0_超纲词`, those get encoded to `%XX` and
  // the trailing `/%` wildcard is no longer parseable server-side).
  return prefixes
    .map((prefix) => `source_path.like.${prefix}/*`)
    .join(",");
}

function buildWordFilterFacetRows(
  words: ImportedWords,
  now: string,
): Database["public"]["Tables"]["word_filter_facets"]["Insert"][] {
  const counts = new Map<string, number>();

  for (const word of words) {
    for (const dimension of WORD_FILTER_FACET_DIMENSIONS) {
      const value = word.metadata[dimension];
      if (typeof value !== "string") {
        continue;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const key = `${dimension}:${trimmed}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([key, count]) => {
    const separatorIndex = key.indexOf(":");
    const dimension = key.slice(0, separatorIndex) as WordFilterFacetDimension;
    const value = key.slice(separatorIndex + 1);

    return {
      count,
      dimension,
      updated_at: now,
      value,
    };
  });
}

function tagRecordsFromWords(words: ImportedWords) {
  const tagMap = new Map<string, { label: string; slug: string }>();

  for (const word of words) {
    for (const tag of word.tags) {
      const label = tag.trim();
      if (!label) {
        continue;
      }

      const slug = slugifyLabel(label);
      tagMap.set(slug, { label, slug });
    }
  }

  return [...tagMap.values()];
}

function createWordUpsertPayload(
  word: ImportedWords[number],
  now: string,
  includeStructuredFields: boolean,
): Database["public"]["Tables"]["words"]["Insert"] {
  return {
    aliases: word.aliases,
    antonym_items: includeStructuredFields
      ? castStructuredWordJson(word).antonym_items
      : undefined,
    body_md: word.bodyMd,
    collocations: includeStructuredFields
      ? castStructuredWordJson(word).collocations
      : undefined,
    content_hash: word.contentHash,
    core_definitions: includeStructuredFields
      ? castStructuredWordJson(word).core_definitions
      : undefined,
    corpus_items: includeStructuredFields
      ? castStructuredWordJson(word).corpus_items
      : undefined,
    definition_md: word.definitionMd,
    examples: asJson(word.examples),
    ipa: word.ipa,
    is_deleted: false,
    is_published: true,
    lang_code: word.langCode,
    lemma: word.lemma,
    metadata: word.metadata,
    pos: word.pos,
    prototype_text: includeStructuredFields
      ? castStructuredWordJson(word).prototype_text
      : undefined,
    short_definition: word.shortDefinition,
    slug: word.slug,
    source_path: word.sourcePath,
    source_updated_at: word.sourceUpdatedAt,
    synonym_items: includeStructuredFields
      ? castStructuredWordJson(word).synonym_items
      : undefined,
    synced_at: now,
    title: word.title,
    updated_at: now,
  };
}

function createCollectionNoteUpsertPayload(
  note: ParsedCollectionNote,
  now: string,
): Database["public"]["Tables"]["collection_notes"]["Insert"] {
  return {
    body_md: note.bodyMd,
    content_hash: note.contentHash,
    is_deleted: false,
    is_published: true,
    kind: note.kind,
    metadata: note.metadata,
    related_word_slugs: note.relatedWordSlugs,
    slug: note.slug,
    source_path: note.sourcePath,
    source_updated_at: note.sourceUpdatedAt,
    summary: note.summary,
    synced_at: now,
    tags: note.tags,
    title: note.title,
    updated_at: now,
  };
}

export interface SyncGitHubWordsOptions {
  // Lets a manual call narrow the sync to a single prefix (e.g. only
  // `Wiki/L0_超纲词`). When omitted we fall back to the full configured list,
  // which is what the daily cron wants. A narrowed run still produces a
  // complete import_run record; its soft-delete scope is likewise narrowed
  // so untouched prefixes keep their existing rows.
  prefixesOverride?: readonly string[];
  triggerType?: string;
}

export async function syncGitHubWords(
  admin: AdminClient,
  options?: SyncGitHubWordsOptions,
) {
  const triggerType = options?.triggerType ?? "manual";
  const activePrefixes = options?.prefixesOverride ?? env.wordsPrefixes;
  const importRun = await createImportRun(admin, triggerType);
  const importErrors: ImportFileError[] = [];

  try {
    const imported = await importWordsFromGitHubArchive({ prefixes: activePrefixes });
    const incomingCollectionNotes = imported.collectionNotes;
    const incomingWords = imported.words;
    importErrors.push(...imported.errors);

    const { data: existingRows, error: existingError } = await admin
      .from("words")
      .select("slug, source_path, content_hash, is_deleted")
      .or(buildSourcePathLikeFilter(activePrefixes));

    if (existingError) {
      throw existingError;
    }

    let collectionNotesAvailable = true;
    const { data: existingCollectionRows, error: existingCollectionError } = await admin
      .from("collection_notes")
      .select("slug, source_path, content_hash, is_deleted");

    if (isCollectionNotesRelationMissing(existingCollectionError)) {
      collectionNotesAvailable = false;
    } else if (existingCollectionError) {
      throw existingCollectionError;
    }

    const plan = planWordSync(
      (existingRows ?? []) as ExistingWordRef[],
      incomingWords,
    );
    const collectionPlan = collectionNotesAvailable
      ? planEntitySync(
          (existingCollectionRows ?? []) as ExistingSyncRef[],
          incomingCollectionNotes,
        )
      : {
          create: [] as ImportedCollections,
          softDelete: [] as ExistingSyncRef[],
          unchanged: [] as ImportedCollections,
          update: [] as ImportedCollections,
        };
    const failedSourcePaths = new Set(
      importErrors
        .map((entry) => entry.sourcePath)
        .filter((value): value is string => Boolean(value)),
    );
    plan.softDelete = plan.softDelete.filter(
      (row) => !failedSourcePaths.has(row.source_path),
    );
    collectionPlan.softDelete = collectionPlan.softDelete.filter(
      (row) => !failedSourcePaths.has(row.source_path),
    );

    const now = new Date().toISOString();
    const syncableWords = [
      ...plan.create,
      ...plan.update,
      // Re-upsert unchanged source files so parser/schema upgrades can backfill derived fields.
      ...plan.unchanged,
    ];
    let includeStructuredFields = true;
    let upsertableWords: Database["public"]["Tables"]["words"]["Insert"][] = syncableWords.map(
      (word) => createWordUpsertPayload(word, now, includeStructuredFields),
    );

    let upsertChunks = chunkArray(upsertableWords, 100);
    for (let chunkIndex = 0; chunkIndex < upsertChunks.length; chunkIndex += 1) {
      const chunk = upsertChunks[chunkIndex];
      if (chunk.length === 0) {
        continue;
      }

      const { error } = await admin.from("words").upsert(chunk, {
        onConflict: "slug",
      });

      if (isStructuredWordColumnsMissing(error) && includeStructuredFields) {
        includeStructuredFields = false;
        upsertableWords = syncableWords.map((word) =>
          createWordUpsertPayload(word, now, false),
        );
        upsertChunks = chunkArray(upsertableWords, 100);
        chunkIndex = -1;
        continue;
      }

      if (error) {
        throw error;
      }
    }

    let wordFilterFacetsAvailable = true;
    const wordFilterFacetRows = buildWordFilterFacetRows(incomingWords, now);
    const { error: clearWordFilterFacetError } = await admin
      .from("word_filter_facets")
      .delete()
      .in("dimension", [...WORD_FILTER_FACET_DIMENSIONS]);

    if (isWordFilterFacetRelationMissing(clearWordFilterFacetError)) {
      wordFilterFacetsAvailable = false;
    } else if (clearWordFilterFacetError) {
      throw clearWordFilterFacetError;
    }

    for (const chunk of chunkArray(wordFilterFacetRows, 100)) {
      if (chunk.length === 0 || !wordFilterFacetsAvailable) {
        continue;
      }

      const { error } = await admin.from("word_filter_facets").upsert(chunk, {
        onConflict: "dimension,value",
      });

      if (isWordFilterFacetRelationMissing(error)) {
        wordFilterFacetsAvailable = false;
        continue;
      }

      if (error) {
        throw error;
      }
    }

    const syncableCollectionNotes = [
      ...collectionPlan.create,
      ...collectionPlan.update,
      ...collectionPlan.unchanged,
    ];

    for (const chunk of chunkArray(
      syncableCollectionNotes.map((note) => createCollectionNoteUpsertPayload(note, now)),
      100,
    )) {
      if (chunk.length === 0 || !collectionNotesAvailable) {
        continue;
      }

      const { error } = await admin.from("collection_notes").upsert(chunk, {
        onConflict: "slug",
      });

      if (isCollectionNotesRelationMissing(error)) {
        collectionNotesAvailable = false;
        continue;
      }

      if (error) {
        throw error;
      }
    }

    const softDeletePaths = plan.softDelete.map((row) => row.source_path);
    for (const chunk of chunkArray(softDeletePaths, 100)) {
      if (chunk.length === 0) {
        continue;
      }

      const { error } = await admin
        .from("words")
        .update({
          is_deleted: true,
          is_published: false,
          updated_at: now,
        })
        .in("source_path", chunk);

      if (error) {
        throw error;
      }
    }

    const collectionSoftDeletePaths = collectionPlan.softDelete.map((row) => row.source_path);
    for (const chunk of chunkArray(collectionSoftDeletePaths, 100)) {
      if (chunk.length === 0 || !collectionNotesAvailable) {
        continue;
      }

      const { error } = await admin
        .from("collection_notes")
        .update({
          is_deleted: true,
          is_published: false,
          updated_at: now,
        })
        .in("source_path", chunk);

      if (isCollectionNotesRelationMissing(error)) {
        collectionNotesAvailable = false;
        continue;
      }

      if (error) {
        throw error;
      }
    }

    const tags = tagRecordsFromWords(incomingWords);
    for (const chunk of chunkArray(tags, 200)) {
      if (chunk.length === 0) {
        continue;
      }

      const { error } = await admin.from("tags").upsert(chunk, {
        onConflict: "slug",
      });

      if (error) {
        throw error;
      }
    }

    const { data: wordsWithIds, error: wordsError } = await admin
      .from("words")
      .select("id, slug")
      .or(buildSourcePathLikeFilter(activePrefixes));

    if (wordsError) {
      throw wordsError;
    }

    const { data: tagsWithIds, error: tagsError } = await admin
      .from("tags")
      .select("id, slug");

    if (tagsError) {
      throw tagsError;
    }

    const wordIdBySlug = new Map((wordsWithIds ?? []).map((row) => [row.slug, row.id]));
    const tagIdBySlug = new Map((tagsWithIds ?? []).map((row) => [row.slug, row.id]));
    const importedWordIds = incomingWords
      .map((word) => wordIdBySlug.get(word.slug))
      .filter((value): value is string => Boolean(value));

    for (const chunk of chunkArray(importedWordIds, 100)) {
      if (chunk.length === 0) {
        continue;
      }

      const { error } = await admin.from("word_tags").delete().in("word_id", chunk);
      if (error) {
        throw error;
      }
    }

    const wordTagRows = incomingWords.flatMap((word) => {
      const wordId = wordIdBySlug.get(word.slug);
      if (!wordId) {
        return [];
      }

      return word.tags
        .map((tag) => tagIdBySlug.get(slugifyLabel(tag)))
        .filter((tagId): tagId is string => Boolean(tagId))
        .map((tagId) => ({
          tag_id: tagId,
          word_id: wordId,
        }));
    });

    for (const chunk of chunkArray(wordTagRows, 300)) {
      if (chunk.length === 0) {
        continue;
      }

      const { error } = await admin.from("word_tags").upsert(chunk, {
        onConflict: "word_id,tag_id",
      });

      if (error) {
        throw error;
      }
    }

    await insertImportErrors(admin, importRun?.id ?? null, importErrors);
    await completeImportRun(admin, importRun?.id ?? null, {
      created_count: plan.create.length,
      error_count: importErrors.length,
      finished_at: now,
      imported_count: incomingWords.length,
      soft_deleted_count: plan.softDelete.length,
      status: importErrors.length > 0 ? "completed_with_errors" : "completed",
      summary: {
        collection_notes: collectionNotesAvailable
          ? {
              created: collectionPlan.create.length,
              imported: incomingCollectionNotes.length,
              soft_deleted: collectionPlan.softDelete.length,
              unchanged: collectionPlan.unchanged.length,
              updated: collectionPlan.update.length,
            }
          : {
              available: false,
            },
        failed_source_paths: [...failedSourcePaths],
        zip_root: imported.zipRoot,
      },
      tags_count: tags.length,
      trigger_type: triggerType,
      unchanged_count: plan.unchanged.length,
      updated_count: plan.update.length,
    });

    return {
      created: plan.create.length,
      collectionNotesCreated: collectionNotesAvailable ? collectionPlan.create.length : 0,
      collectionNotesImported: collectionNotesAvailable ? incomingCollectionNotes.length : 0,
      collectionNotesSoftDeleted: collectionNotesAvailable ? collectionPlan.softDelete.length : 0,
      collectionNotesUpdated: collectionNotesAvailable ? collectionPlan.update.length : 0,
      errorCount: importErrors.length,
      imported: incomingWords.length,
      latestRunId: importRun?.id ?? null,
      softDeleted: plan.softDelete.length,
      tags: tags.length,
      unchanged: plan.unchanged.length,
      updated: plan.update.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    const fallbackError: ImportFileError = {
      errorMessage: message,
      errorStage: "sync_pipeline",
      rawExcerpt: null,
      sourcePath: null,
    };
    importErrors.push(fallbackError);
    await insertImportErrors(admin, importRun?.id ?? null, [fallbackError]);
    await completeImportRun(admin, importRun?.id ?? null, {
      error_count: importErrors.length,
      finished_at: new Date().toISOString(),
      status: "failed",
      summary: {
        message,
      },
      trigger_type: triggerType,
    });
    throw error;
  }
}
