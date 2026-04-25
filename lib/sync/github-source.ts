import JSZip from "jszip";
import type { ImportFileError } from "@/lib/imports";
import { env } from "@/lib/env";
import { parseWordMarkdown, type ParsedWord } from "@/lib/sync/parseMarkdown";

export interface ImportedGitHubRepository {
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
  const errors: ImportFileError[] = [];
  const words: ParsedWord[] = [];

  for (const file of Object.values(zip.files)) {
    if (!file.name.startsWith(prefix) || file.dir || !file.name.endsWith(".md")) {
      continue;
    }

    const sourcePath = file.name.replace(`${env.repoName}-${env.repoBranch}/`, "");
    try {
      const markdown = await file.async("string");
      try {
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
      } catch (error) {
        errors.push({
          errorMessage: error instanceof Error ? error.message : "Failed to parse markdown file.",
          errorStage: "parse_markdown",
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

  words.sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    errors,
    words,
    zipRoot: `${env.repoName}-${env.repoBranch}`,
  };
}
