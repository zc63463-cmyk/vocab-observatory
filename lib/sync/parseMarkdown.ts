import matter from "gray-matter";
import type { Json } from "@/types/database.types";
import {
  castStructuredWordJson,
  createEmptyStructuredWordFields,
  type AntonymItem,
  type CollocationExample,
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

function trimTrailingSensePunctuation(value: string) {
  return value.replace(/[；;]+$/g, "").trim();
}

function normalizePartOfSpeech(value: string) {
  return value.trim().replace(/\.$/, "");
}

function extractTitle(body: string, fallbackTitle?: string) {
  return matchFirst(body, /^#\s+(.+)$/m) ?? fallbackTitle ?? "untitled";
}

function extractIpa(body: string) {
  return matchFirst(body, /\*\*音标\*\*\s*([^|\n]+)/m);
}

function extractPrimaryPos(definitionMd: string) {
  const boldMatch = matchFirst(
    definitionMd,
    /\*\*([a-z]+\.?(?:\/[a-z]+\.?)*)\*\*/i,
  );
  if (boldMatch) {
    return normalizePartOfSpeech(boldMatch);
  }

  const plainMatch = matchFirst(
    definitionMd,
    /^([a-z]+\.?(?:\/[a-z]+\.?)*)\s+/im,
  );

  return plainMatch ? normalizePartOfSpeech(plainMatch) : null;
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

function parseCoreDefinitions(section: string) {
  const warnings: StructuredParseWarning[] = [];
  const lines = section
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .filter((line) =>
      /^(?:\*\*)?[a-z]+\.?(?:\/[a-z]+\.?)*(?:\*\*)?\s+/i.test(
        line,
      ),
    );

  const parsed = lines
    .map((line) => {
      const match =
        /^(?:\*\*)?([a-z]+\.?(?:\/[a-z]+\.?)*)(?:\*\*)?\s+(.+)$/i.exec(
          line,
        );
      if (!match) {
        return null;
      }

      const [, rawPartOfSpeech, rawSenses] = match;
      const senseMatches = [
        ...rawSenses.matchAll(
          /([①②③④⑤⑥⑦⑧⑨⑩])\s*([\s\S]*?)(?=(?:[①②③④⑤⑥⑦⑧⑨⑩]\s*)|$)/g,
        ),
      ];
      const senses =
        senseMatches.length > 0
          ? senseMatches
              .map((item) => trimTrailingSensePunctuation(stripFormatting(item[2])))
              .filter(Boolean)
          : rawSenses
              .split(/[；;]/)
              .map((sense) => trimTrailingSensePunctuation(stripFormatting(sense)))
              .filter(Boolean);

      if (senses.length === 0) {
        return null;
      }

      return {
        partOfSpeech: normalizePartOfSpeech(stripFormatting(rawPartOfSpeech)),
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

function looksLikeEnglishExample(value: string) {
  return /[A-Za-z]/.test(value);
}

function splitExampleTranslation(value: string) {
  const trimmed = stripFormatting(value).replace(/^例[:：]\s*/u, "");
  if (!trimmed || !/^["'“]?[A-Za-z]/u.test(trimmed) || !looksLikeEnglishExample(trimmed)) {
    return null;
  }

  const bilingualMatch = /^(.+?)\s*[\uFF08(]([^()（）]+)[\uFF09)]$/u.exec(trimmed);
  if (bilingualMatch && looksLikeEnglishExample(bilingualMatch[1])) {
    return {
      text: stripFormatting(bilingualMatch[1]),
      translation: stripFormatting(bilingualMatch[2]) || null,
    } satisfies CollocationExample;
  }

  const firstHanIndex = [...trimmed].findIndex((char) => /\p{Script=Han}/u.test(char));
  if (firstHanIndex > 0) {
    return {
      text: trimmed.slice(0, firstHanIndex).trim(),
      translation: trimmed.slice(firstHanIndex).trim() || null,
    } satisfies CollocationExample;
  }

  return {
    text: trimmed,
    translation: null,
  } satisfies CollocationExample;
}

function parseCollocationDetails(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      examples: [] as CollocationExample[],
      gloss: null as string | null,
    };
  }

  const directExample = splitExampleTranslation(trimmed);
  if (directExample) {
    return {
      examples: [directExample],
      gloss: null,
    };
  }

  const glossPlusExampleMatch = /^(.*?)\s*[\uFF08(]([^()（）]+)[\uFF09)]$/u.exec(trimmed);
  if (glossPlusExampleMatch) {
    const inlineExample = splitExampleTranslation(glossPlusExampleMatch[2]);
    if (inlineExample) {
      return {
        examples: [inlineExample],
        gloss: stripFormatting(glossPlusExampleMatch[1]) || null,
      };
    }
  }

  return {
    examples: [] as CollocationExample[],
    gloss: stripFormatting(trimmed) || null,
  };
}

function parseCollocationEntry(line: string) {
  const match = /^\*\*(.+?)\*\*(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  const phrase = stripFormatting(match[1]);
  let remainder = match[2].trim();
  let leadingGloss: string | null = null;

  const leadingGlossMatch = /^[\uFF08(]([^()（）]+)[\uFF09)]\s*[：:]\s*(.+)$/u.exec(remainder);
  if (leadingGlossMatch && !looksLikeEnglishExample(leadingGlossMatch[1])) {
    leadingGloss = stripFormatting(leadingGlossMatch[1]) || null;
    remainder = leadingGlossMatch[2].trim();
  } else {
    remainder = remainder.replace(/^[：:]\s*/u, "");
  }

  const details = parseCollocationDetails(remainder);
  const gloss = leadingGloss ?? details.gloss;

  return {
    examples: details.examples,
    gloss,
    note: gloss,
    phrase,
  } satisfies CollocationItem;
}

function parseCollocations(section: string) {
  const items: CollocationItem[] = [];

  for (const line of extractSectionBulletLines(section)) {
    const entry = parseCollocationEntry(line);
    if (entry) {
      items.push(entry);
      continue;
    }

    const trailingExample = splitExampleTranslation(line);
    if (trailingExample && items.length > 0) {
      items[items.length - 1].examples.push(trailingExample);
      continue;
    }

    items.push({
      examples: [],
      gloss: null,
      note: null,
      phrase: stripFormatting(line),
    });
  }

  return items;
}

function parseCorpusItems(section: string) {
  return extractSectionBulletLines(section).map((line) => {
    const [rawText, trailingNote] = line.split(/——|—/, 2);
    const quotedMatch = /^["“]?(.+?)["”]?[（(]([^()（）]+)[）)]$/.exec(rawText.trim());
    const text = quotedMatch ? stripFormatting(quotedMatch[1]) : stripFormatting(rawText);
    const noteParts = [
      quotedMatch ? stripFormatting(quotedMatch[2]) : null,
      trailingNote ? stripFormatting(trailingNote) : null,
    ].filter((value): value is string => Boolean(value));

    return {
      note: noteParts.length > 0 ? noteParts.join("；") : null,
      text,
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
    const match = /^(.+?)[：:]\s*(.+)$/.exec(line);
    const word = match ? match[1] : line;
    const note = match ? match[2] : null;

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
  const sourceUpdatedAt = parseFrontmatterDate(data.date);
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
      date: sourceUpdatedAt,
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
    sourceUpdatedAt,
    synonymItems: structuredFields.synonymItems,
    tags,
    title,
    warnings,
  };
}

export function inferWordTitle(markdown: string) {
  return stripMarkdown(extractTitle(markdown));
}
