import matter from "gray-matter";
import type { Json } from "@/types/database.types";
import {
  createCollectionNoteSlug,
  type CollectionNoteKind,
  type ParsedCollectionNote,
} from "@/lib/collection-notes";
import { getSection } from "@/lib/markdown";
import { sha256 } from "@/lib/sync/hash";
import { excerpt, slugifyLabel, stripMarkdown, unique } from "@/lib/utils";

function normalizeFrontmatterValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed === "[]") {
    return [] as string[];
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseFrontmatterDate(value: Json) {
  if (typeof value === "string" || value instanceof Date) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function parseLooseFrontmatter(markdown: string) {
  if (!markdown.startsWith("---\n")) {
    return {
      content: markdown,
      data: {} as Record<string, Json>,
    };
  }

  const endIndex = markdown.indexOf("\n---", 4);
  if (endIndex === -1) {
    return {
      content: markdown,
      data: {} as Record<string, Json>,
    };
  }

  const raw = markdown.slice(4, endIndex).replace(/\r\n/g, "\n");
  const content = markdown.slice(endIndex + 4).replace(/^\n/, "");
  const data: Record<string, Json> = {};
  const lines = raw.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (!match) {
      index += 1;
      continue;
    }

    const [, key, value] = match;
    if (!value) {
      const items: string[] = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const itemMatch = /^\s*-\s+(.*)$/.exec(lines[nextIndex]);
        if (!itemMatch) {
          break;
        }
        items.push(String(normalizeFrontmatterValue(itemMatch[1])));
        nextIndex += 1;
      }
      data[key] = items;
      index = nextIndex;
      continue;
    }

    data[key] = normalizeFrontmatterValue(value);
    index += 1;
  }

  return { content, data };
}

function matchFirst(content: string, pattern: RegExp) {
  return content.match(pattern)?.[1]?.trim() ?? null;
}

function extractTitle(body: string, fallbackTitle?: string) {
  return matchFirst(body, /^#\s+(.+)$/m) ?? fallbackTitle ?? "untitled";
}

function extractQuotedBlockAfterCallout(body: string, marker: string) {
  const lines = body.split("\n");
  const startIndex = lines.findIndex((line) => line.includes(marker));
  if (startIndex === -1) {
    return null;
  }

  const buffer: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (buffer.length > 0) {
        break;
      }
      continue;
    }

    if (!line.trimStart().startsWith(">")) {
      break;
    }

    buffer.push(line.replace(/^>\s?/, "").trim());
  }

  const text = stripMarkdown(buffer.join(" ").trim());
  return text || null;
}

function extractWikiLinkSlugs(body: string) {
  const matches = [...body.matchAll(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g)];
  return unique(
    matches
      .map((match) => slugifyLabel(match[1]))
      .filter(Boolean),
  );
}

function extractRootAffixRelatedWordSlugs(body: string) {
  const derivedSection =
    getSection(body, "派生词族") ||
    getSection(body, "相关单词") ||
    getSection(body, "相关词汇");

  return extractWikiLinkSlugs(derivedSection || body);
}

function buildRootAffixMetadata(body: string) {
  const rootType = matchFirst(body, /\*\*类型\*\*[：:]\s*(.+)$/m);
  const coreMeaning = matchFirst(body, /\*\*核心含义\*\*[：:]\s*(.+)$/m);
  const origin = matchFirst(body, /\*\*来源\*\*[：:]\s*(.+)$/m);

  return {
    coreMeaning,
    origin,
    rootType,
    summary: coreMeaning ? stripMarkdown(coreMeaning) : null,
  };
}

function buildSemanticFieldMetadata(body: string) {
  const definition =
    extractQuotedBlockAfterCallout(body, "[!info] 语义场定义") ??
    extractQuotedBlockAfterCallout(body, "[!tip] 语义场定义");

  return {
    definition,
    summary: definition ? stripMarkdown(definition) : null,
  };
}

export function parseCollectionNoteMarkdown(
  markdown: string,
  sourcePath: string,
  kind: CollectionNoteKind,
): ParsedCollectionNote {
  let parsedFrontmatter: { content: string; data: Record<string, Json> };
  try {
    const standard = matter(markdown);
    parsedFrontmatter = {
      content: standard.content,
      data: standard.data as Record<string, Json>,
    };
  } catch {
    parsedFrontmatter = parseLooseFrontmatter(markdown);
  }

  const { content, data } = parsedFrontmatter;
  const rawTitle =
    typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined;
  const title = extractTitle(content, rawTitle);
  const sourceUpdatedAt = parseFrontmatterDate(data.date);
  const relatedWordSlugs =
    kind === "root_affix" ? extractRootAffixRelatedWordSlugs(content) : [];
  const parsedMetadata =
    kind === "root_affix"
      ? buildRootAffixMetadata(content)
      : buildSemanticFieldMetadata(content);
  const summary = parsedMetadata.summary ?? excerpt(content, 180);

  return {
    aliases: Array.isArray(data.aliases)
      ? data.aliases.filter((alias): alias is string => typeof alias === "string")
      : [],
    bodyMd: content.trim(),
    contentHash: sha256(markdown),
    kind,
    metadata: {
      aliases:
        Array.isArray(data.aliases)
          ? data.aliases.filter((alias): alias is string => typeof alias === "string")
          : [],
      date: sourceUpdatedAt,
      kind,
      kind_label: kind === "root_affix" ? "词根词缀" : "语义场",
      source_repo: "Obsidian-Eg",
      source_title: rawTitle ?? title,
      ...parsedMetadata,
    },
    relatedWordSlugs,
    slug: createCollectionNoteSlug(kind, title),
    sourcePath,
    sourceUpdatedAt,
    summary,
    tags: unique(
      [
        ...(Array.isArray(data.tags)
          ? data.tags.filter((tag): tag is string => typeof tag === "string")
          : []),
        kind === "root_affix" ? "学习/英语/词汇/词根词缀" : "学习/英语/词汇/语义场",
      ].filter(Boolean),
    ),
    title,
  };
}
