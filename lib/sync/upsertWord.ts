import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  completeImportRun,
  createImportRun,
  insertImportErrors,
  type ImportFileError,
} from "@/lib/imports";
import { importWordsFromGitHubArchive } from "@/lib/sync/github-source";
import { planWordSync, type ExistingWordRef } from "@/lib/sync/import-plan";
import type { Database } from "@/types/database.types";
import { chunkArray, slugifyLabel } from "@/lib/utils";

type AdminClient = SupabaseClient<Database>;

function tagRecordsFromWords(words: Awaited<ReturnType<typeof importWordsFromGitHubArchive>>["words"]) {
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

export async function syncGitHubWords(
  admin: AdminClient,
  options?: { triggerType?: string },
) {
  const triggerType = options?.triggerType ?? "manual";
  const importRun = await createImportRun(admin, triggerType);
  const importErrors: ImportFileError[] = [];

  try {
    const imported = await importWordsFromGitHubArchive();
    const incomingWords = imported.words;
    importErrors.push(...imported.errors);

    const { data: existingRows, error: existingError } = await admin
      .from("words")
      .select("slug, source_path, content_hash, is_deleted")
      .like("source_path", `${env.wordsPrefix}/%`);

    if (existingError) {
      throw existingError;
    }

    const plan = planWordSync(
      (existingRows ?? []) as ExistingWordRef[],
      incomingWords,
    );
    const failedSourcePaths = new Set(
      importErrors
        .map((entry) => entry.sourcePath)
        .filter((value): value is string => Boolean(value)),
    );
    plan.softDelete = plan.softDelete.filter(
      (row) => !failedSourcePaths.has(row.source_path),
    );

    const now = new Date().toISOString();
    const upsertableWords: Database["public"]["Tables"]["words"]["Insert"][] = [
      ...plan.create,
      ...plan.update,
    ].map((word) => ({
      aliases: word.aliases,
      body_md: word.bodyMd,
      content_hash: word.contentHash,
      definition_md: word.definitionMd,
      examples: word.examples as unknown as Database["public"]["Tables"]["words"]["Insert"]["examples"],
      ipa: word.ipa,
      is_deleted: false,
      is_published: true,
      lang_code: word.langCode,
      lemma: word.lemma,
      metadata: word.metadata,
      pos: word.pos,
      short_definition: word.shortDefinition,
      slug: word.slug,
      source_path: word.sourcePath,
      source_updated_at: word.sourceUpdatedAt,
      synced_at: now,
      title: word.title,
      updated_at: now,
    }));

    for (const chunk of chunkArray(upsertableWords, 100)) {
      if (chunk.length === 0) {
        continue;
      }

      const { error } = await admin.from("words").upsert(chunk, {
        onConflict: "slug",
      });

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
      .like("source_path", `${env.wordsPrefix}/%`);

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
