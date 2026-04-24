import matter from "gray-matter";
import type { Json } from "@/types/database.types";
import { getSection } from "@/lib/markdown";
import { sha256 } from "@/lib/sync/hash";
import { excerpt, slugifyLabel, stripMarkdown, unique } from "@/lib/utils";

export interface ParsedExample {
  label: string | null;
  source: "collocation" | "corpus";
  text: string;
}

export interface ParsedWord {
  aliases: string[];
  bodyMd: string;
  contentHash: string;
  definitionMd: string;
  examples: ParsedExample[];
  ipa: string | null;
  langCode: string;
  lemma: string;
  metadata: Record<string, Json>;
  pos: string | null;
  shortDefinition: string | null;
  slug: string;
  sourcePath: string;
  sourceUpdatedAt: string | null;
  tags: string[];
  title: string;
}

function matchFirst(content: string, pattern: RegExp) {
  return content.match(pattern)?.[1]?.trim() ?? null;
}

function extractTitle(body: string, fallbackTitle?: string) {
  return matchFirst(body, /^#\s+(.+)$/m) ?? fallbackTitle ?? "untitled";
}

function extractIpa(body: string) {
  return matchFirst(body, /\*\*音标\*\*\s*([^|\n]+)/m);
}

function extractPrimaryPos(definitionMd: string) {
  return matchFirst(definitionMd, /\*\*([a-z.]+)\.\*\*/i);
}

function extractBulletExamples(section: string, source: ParsedExample["source"]) {
  return section
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .map((line) => {
      const formatted = line.replace(/\*\*/g, "");
      const [first, ...rest] = formatted.split("：");
      if (rest.length > 0) {
        return {
          label: first.trim(),
          source,
          text: rest.join("：").trim(),
        };
      }

      return {
        label: null,
        source,
        text: formatted,
      };
    });
}

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

export function parseWordMarkdown(markdown: string, sourcePath: string): ParsedWord {
  let parsed: { content: string; data: Record<string, Json> };
  try {
    const standard = matter(markdown);
    parsed = {
      content: standard.content,
      data: standard.data as Record<string, Json>,
    };
  } catch {
    parsed = parseLooseFrontmatter(markdown);
  }

  const { content, data } = parsed;
  const rawTitle =
    typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined;
  const title = extractTitle(content, rawTitle);
  const lemma = title.trim();
  const slug = slugifyLabel(lemma);
  const definitionMd = getSection(content, "核心释义");
  const shortDefinition = definitionMd ? excerpt(definitionMd, 120) : null;
  const tags = unique(
    [
      ...(Array.isArray(data.tags)
        ? data.tags.filter((tag): tag is string => typeof tag === "string")
        : []),
      typeof data.semantic_field === "string" ? data.semantic_field : "",
      typeof data.mastery === "string" ? `掌握/${data.mastery}` : "",
    ].filter(Boolean),
  );

  const collocationSection = getSection(content, "搭配与短语");
  const corpusSection = getSection(content, "真题/语料关联");
  const examples = [
    ...extractBulletExamples(collocationSection, "collocation"),
    ...extractBulletExamples(corpusSection, "corpus"),
  ];

  return {
    aliases: Array.isArray(data.aliases)
      ? data.aliases.filter((alias): alias is string => typeof alias === "string")
      : [],
    bodyMd: content.trim(),
    contentHash: sha256(markdown),
    definitionMd,
    examples,
    ipa: extractIpa(content),
    langCode: "en",
    lemma,
    metadata: {
      date: typeof data.date === "string" ? data.date : null,
      extension_dim:
        typeof data.extension_dim === "string" ? data.extension_dim : null,
      mastery: typeof data.mastery === "string" ? data.mastery : null,
      prototype: typeof data.prototype === "string" ? data.prototype : null,
      review_count:
        typeof data.review_count === "number" ? data.review_count : null,
      semantic_field:
        typeof data.semantic_field === "string" ? data.semantic_field : null,
      source_repo: "Obsidian-Eg",
      source_title: rawTitle ?? title,
      word_freq: typeof data.word_freq === "string" ? data.word_freq : null,
    },
    pos: extractPrimaryPos(definitionMd),
    shortDefinition,
    slug,
    sourcePath,
    sourceUpdatedAt:
      typeof data.date === "string" && !Number.isNaN(new Date(data.date).getTime())
        ? new Date(data.date).toISOString()
        : null,
    tags,
    title,
  };
}

export function inferWordTitle(markdown: string) {
  return stripMarkdown(extractTitle(markdown));
}
