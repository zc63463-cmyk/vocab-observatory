import matter from "gray-matter";
import type { Json } from "@/types/database.types";
import {
  castStructuredWordJson,
  createEmptyStructuredWordFields,
  type AntonymItem,
  type CollocationItem,
  type CoreDefinition,
  type CorpusItem,
  type StructuredParseWarning,
  type StructuredWordFields,
  type SynonymItem,
} from "@/lib/structured-word";
import { getSection } from "@/lib/markdown";
import { sha256 } from "@/lib/sync/hash";
import { excerpt, slugifyLabel, stripMarkdown, unique } from "@/lib/utils";

export interface ParsedExample {
  label: string | null;
  source: "collocation" | "corpus";
  text: string;
}

export interface ParsedWord extends StructuredWordFields {
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
  warnings: StructuredParseWarning[];
}

function matchFirst(content: string, pattern: RegExp) {
  return content.match(pattern)?.[1]?.trim() ?? null;
}

function stripFormatting(value: string) {
  return stripMarkdown(value)
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();
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

function extractSectionBulletLines(section: string) {
  return section
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim());
}

function extractBulletExamples(section: string, source: ParsedExample["source"]) {
  return extractSectionBulletLines(section).map((line) => {
    const formatted = line.replace(/\*\*/g, "");
    const [first, ...rest] = formatted.split("：");
    if (rest.length > 0) {
      return {
        label: stripFormatting(first),
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

function parseCoreDefinitions(section: string) {
  const warnings: StructuredParseWarning[] = [];
  const lines = section
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .filter((line) => line.startsWith("**"));

  const parsed = lines
    .map((line) => {
      const match = /^\*\*([^*]+?)\.\*\*\s*(.+)$/.exec(line);
      if (!match) {
        return null;
      }

      const [, rawPartOfSpeech, rawSenses] = match;
      const senseMatches = [...rawSenses.matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]\s*([^；;]+)/g)];
      const senses =
        senseMatches.length > 0
          ? senseMatches.map((item) => stripFormatting(item[1]))
          : rawSenses
              .split(/[；;]/)
              .map(stripFormatting)
              .filter(Boolean);

      if (senses.length === 0) {
        return null;
      }

      return {
        partOfSpeech: stripFormatting(rawPartOfSpeech),
        senses,
      } satisfies CoreDefinition;
    })
    .filter((value): value is CoreDefinition => Boolean(value));

  if (section.trim() && parsed.length === 0) {
    warnings.push({
      errorMessage: "Failed to extract structured core definitions.",
      errorStage: "extract_structured_fields",
      rawExcerpt: section.slice(0, 300),
    });
  }

  return { parsed, warnings };
}

function parsePrototypeText(section: string) {
  return matchFirst(section, /\*\*原型义\*\*：(.+)/)?.trim() ?? null;
}

function parseCollocations(section: string) {
  return extractSectionBulletLines(section).map((line) => {
    const match = /^\*\*(.+?)\*\*[：:]\s*(.+)$/.exec(line);
    if (match) {
      return {
        note: stripFormatting(match[2]),
        phrase: stripFormatting(match[1]),
      } satisfies CollocationItem;
    }

    return {
      note: null,
      phrase: stripFormatting(line),
    } satisfies CollocationItem;
  });
}

function parseCorpusItems(section: string) {
  return extractSectionBulletLines(section).map((line) => {
    const [text, note] = line.split(/——|—/, 2);
    return {
      note: note ? stripFormatting(note) : null,
      text: stripFormatting(text),
    } satisfies CorpusItem;
  });
}

function parseMarkdownTable(section: string) {
  const tableLines = section
    .split("\n")
    .map((line) => line.replace(/^(\s*>\s*)+/, "").trim())
    .filter((line) => line.startsWith("|"));

  if (tableLines.length < 2) {
    return null;
  }

  const headerRow = tableLines[0]
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  const dataRows = tableLines
    .slice(2)
    .map((line) =>
      line
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .filter((cells) => cells.length === headerRow.length);

  return {
    dataRows,
    headerRow,
  };
}

function parseSynonymItems(section: string) {
  const warnings: StructuredParseWarning[] = [];
  const table = parseMarkdownTable(section);
  if (!table) {
    if (section.trim()) {
      warnings.push({
        errorMessage: "Failed to parse synonym table.",
        errorStage: "extract_structured_fields",
        rawExcerpt: section.slice(0, 400),
      });
    }

    return { parsed: [] as SynonymItem[], warnings };
  }

  const headerIndex = new Map(table.headerRow.map((header, index) => [header, index]));
  const delta = matchFirst(section, /\*\*"增"标记\*\*：(.+)/)?.trim() ?? null;
  const parsed = table.dataRows.map((row) => ({
    delta,
    object: stripFormatting(row[headerIndex.get("常见对象") ?? -1] ?? ""),
    semanticDiff: stripFormatting(row[headerIndex.get("核心语义差异") ?? -1] ?? ""),
    tone: stripFormatting(row[headerIndex.get("情感色彩") ?? -1] ?? ""),
    usage: stripFormatting(row[headerIndex.get("方式特点") ?? -1] ?? ""),
    word: stripFormatting(row[headerIndex.get("词") ?? -1] ?? ""),
  }));

  return {
    parsed: parsed.filter((item) => item.word.length > 0),
    warnings,
  };
}

function parseAntonymItems(section: string) {
  return extractSectionBulletLines(section).map((line) => {
    const [word, note] = line.split(/[：:]/, 2);
    return {
      note: note ? stripFormatting(note) : null,
      word: stripFormatting(word),
    } satisfies AntonymItem;
  });
}

export function parseWordMarkdown(markdown: string, sourcePath: string): ParsedWord {
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
  const synonymSection = getSection(content, "同义词辨析");
  const antonymSection = getSection(content, "反义词");
  const examples = [
    ...extractBulletExamples(collocationSection, "collocation"),
    ...extractBulletExamples(corpusSection, "corpus"),
  ];

  const structuredFields = createEmptyStructuredWordFields();
  const warnings: StructuredParseWarning[] = [];

  const coreDefinitionsResult = parseCoreDefinitions(definitionMd);
  structuredFields.coreDefinitions = coreDefinitionsResult.parsed;
  warnings.push(...coreDefinitionsResult.warnings);

  structuredFields.prototypeText =
    parsePrototypeText(definitionMd) ??
    (typeof data.prototype === "string" ? data.prototype : null);
  structuredFields.collocations = parseCollocations(collocationSection);
  structuredFields.corpusItems = parseCorpusItems(corpusSection);

  const synonymResult = parseSynonymItems(synonymSection);
  structuredFields.synonymItems = synonymResult.parsed;
  warnings.push(...synonymResult.warnings);

  structuredFields.antonymItems = parseAntonymItems(antonymSection);

  return {
    aliases: Array.isArray(data.aliases)
      ? data.aliases.filter((alias): alias is string => typeof alias === "string")
      : [],
    antonymItems: structuredFields.antonymItems,
    bodyMd: content.trim(),
    collocations: structuredFields.collocations,
    contentHash: sha256(markdown),
    coreDefinitions: structuredFields.coreDefinitions,
    corpusItems: structuredFields.corpusItems,
    definitionMd,
    examples,
    ipa: extractIpa(content),
    langCode: "en",
    lemma,
    metadata: {
      ...castStructuredWordJson(structuredFields),
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
    prototypeText: structuredFields.prototypeText,
    shortDefinition,
    slug,
    sourcePath,
    sourceUpdatedAt:
      typeof data.date === "string" && !Number.isNaN(new Date(data.date).getTime())
        ? new Date(data.date).toISOString()
        : null,
    synonymItems: structuredFields.synonymItems,
    tags,
    title,
    warnings,
  };
}

export function inferWordTitle(markdown: string) {
  return stripMarkdown(extractTitle(markdown));
}
