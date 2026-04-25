import JSZip from "jszip";
import {
  detectCollectionNoteKind,
  shouldSkipCollectionNote,
  type ParsedCollectionNote,
} from "@/lib/collection-notes";
import type { ImportFileError } from "@/lib/imports";
import { env } from "@/lib/env";
import { parseCollectionNoteMarkdown } from "@/lib/sync/parseCollectionNote";
import { parseWordMarkdown, type ParsedWord } from "@/lib/sync/parseMarkdown";

export interface ImportedGitHubRepository {
  collectionNotes: ParsedCollectionNote[];
  errors: ImportFileError[];
  words: ParsedWord[];
  zipRoot: string;
}

export async function fetchRepositoryArchive() {
  const url = `https://codeload.github.com/${env.repoOwner}/${env.repoName}/zip/refs/heads/${env.repoBranch}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "codex-vocab-app",
    },
    next: {
      revalidate: 0,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download repository archive: ${response.status}`);
  }

  return response.arrayBuffer();
}

export async function importWordsFromGitHubArchive(): Promise<ImportedGitHubRepository> {
  const zip = await JSZip.loadAsync(await fetchRepositoryArchive());
  const prefix = `${env.repoName}-${env.repoBranch}/${env.wordsPrefix}/`;
  const collectionNotes: ParsedCollectionNote[] = [];
  const errors: ImportFileError[] = [];
  const words: ParsedWord[] = [];

  for (const file of Object.values(zip.files)) {
    if (file.dir || !file.name.endsWith(".md")) {
      continue;
    }

    const sourcePath = file.name.replace(`${env.repoName}-${env.repoBranch}/`, "");
    const isWordFile = file.name.startsWith(prefix);
    const collectionKind = detectCollectionNoteKind(sourcePath);

    if (!isWordFile && !collectionKind) {
      continue;
    }

    if (collectionKind && shouldSkipCollectionNote(sourcePath)) {
      continue;
    }

    try {
      const markdown = await file.async("string");
      try {
        if (isWordFile) {
          const parsed = parseWordMarkdown(markdown, sourcePath);
          words.push(parsed);
          if (parsed.warnings.length > 0) {
            errors.push(
              ...parsed.warnings.map((warning) => ({
                ...warning,
                sourcePath,
              })),
            );
          }
        } else if (collectionKind) {
          const parsed = parseCollectionNoteMarkdown(markdown, sourcePath, collectionKind);
          collectionNotes.push(parsed);
        }
      } catch (error) {
        errors.push({
          errorMessage: error instanceof Error ? error.message : "Failed to parse markdown file.",
          errorStage: isWordFile ? "parse_markdown" : "parse_collection_note",
          rawExcerpt: markdown.slice(0, 500),
          sourcePath,
        });
      }
    } catch (error) {
      errors.push({
        errorMessage: error instanceof Error ? error.message : "Failed to read markdown file.",
        errorStage: "read_markdown",
        rawExcerpt: null,
        sourcePath,
      });
    }
  }

  collectionNotes.sort((left, right) => left.slug.localeCompare(right.slug));
  words.sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    collectionNotes,
    errors,
    words,
    zipRoot: `${env.repoName}-${env.repoBranch}`,
  };
}
