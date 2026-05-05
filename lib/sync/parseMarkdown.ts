import matter from "gray-matter";
import type { Json } from "@/types/database.types";
import {
  castStructuredWordJson,
  createEmptyStructuredWordFields,
  createEmptyWordExtendedFields,
  type AntonymItem,
  type CollocationExample,
  type CollocationItem,
  type CoreDefinition,
  type CorpusItem,
  type DerivedWord,
  type Mnemonic,
  type Morphology,
  type MorphologyPart,
  type PosConversion,
  type SemanticChain,
  type StructuredParseWarning,
  type StructuredWordFields,
  type SynonymItem,
  type WordExtendedFields,
} from "@/lib/structured-word";
import { getSection } from "@/lib/markdown";
import { sha256 } from "@/lib/sync/hash";
import { excerpt, slugifyLabel, stripMarkdown, unique } from "@/lib/utils";

export interface ParsedExample {
  label: string | null;
  source: "collocation" | "corpus";
  text: string;
}

export interface ParsedWord extends StructuredWordFields, WordExtendedFields {
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

// Maps each `Wiki/L0_<dir>` directory name to the human-readable `word_freq` label.
// New directories should be added here so path-derived word_freq stays accurate
// when the source file's frontmatter omits `word_freq`.
const WORD_FREQ_LABEL_MAP: Record<string, string> = {
  L0_超纲词: "超纲词",
  L0_基础词: "基础词",
  L0_单词集合: "必备词",
};

function deriveFreqFromSourcePath(sourcePath: string): string | null {
  // sourcePath looks like "Wiki/L0_超纲词/abdicate.md"
  const segments = sourcePath.split("/");
  for (const segment of segments) {
    if (segment in WORD_FREQ_LABEL_MAP) {
      return WORD_FREQ_LABEL_MAP[segment];
    }
  }
  return null;
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

function normalizeFrontmatterStringList(value: unknown) {
  if (typeof value === "string") {
    return value
      .split(/[,;，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFrontmatterStringList(
  data: Record<string, Json>,
  keys: string[],
) {
  for (const key of keys) {
    if (key in data) {
      return normalizeFrontmatterStringList(data[key]);
    }
  }

  return [];
}

function buildGraphRelationMetadata(data: Record<string, Json>): Record<string, Json> {
  const relationFields = {
    antonyms: readFrontmatterStringList(data, ["antonyms", "antonymWords", "antonym_words"]),
    roots: readFrontmatterStringList(data, [
      "roots",
      "root",
      "rootFamily",
      "root_family",
      "wordRoots",
      "word_roots",
    ]),
    synonyms: readFrontmatterStringList(data, ["synonyms", "synonymWords", "synonym_words"]),
  };

  return Object.fromEntries(
    Object.entries(relationFields).filter(([, value]) => value.length > 0),
  ) as Record<string, Json>;
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

function parseExtensionDim(section: string) {
  return matchFirst(section, /\*\*延伸维度\*\*[：:]\s*(.+)/)?.trim() ?? null;
}

function parseMetaphorType(section: string) {
  // Captures the part before the first parenthesis when present, since the
  // parenthesised text is usually a long explanation rather than the type itself.
  const raw = matchFirst(section, /\*\*隐喻类型\*\*[：:]\s*(.+)/);
  if (!raw) {
    return null;
  }
  const trimmed = raw.split(/[（(]/u, 1)[0]?.trim();
  return trimmed || null;
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

function parseCorpusItems(section: string): CorpusItem[] {
  const entries = extractCorpusEntries(section);
  // No grouped entries (e.g. older fixture without nested bullets) — fall back
  // to the flat per-bullet parser to preserve historical behaviour.
  if (entries.every((entry) => entry.length === 1)) {
    return extractSectionBulletLines(section).map(parseFlatCorpusBullet);
  }

  return entries.map((entry) => {
    const [parent, ...children] = entry;
    const flat = parseFlatCorpusBullet(parent);
    let translation: string | null = null;
    let source: string | null = null;

    for (const child of children) {
      const translationMatch = /^中译[:：]\s*(.+)$/u.exec(child);
      if (translationMatch) {
        translation = stripFormatting(translationMatch[1]);
        continue;
      }
      const sourceMatch = /^来源[:：]\s*(.+)$/u.exec(child);
      if (sourceMatch) {
        source = stripFormatting(sourceMatch[1]);
      }
    }

    return {
      ...flat,
      source,
      translation,
    };
  });
}

function parseFlatCorpusBullet(line: string): CorpusItem {
  // Strip an optional `[例]` (or similar) annotation backtick used by the
  // newer corpus format so the text stays clean.
  const cleaned = line.replace(/`\[[^\]]+\]`\s*$/u, "").trim();
  const [rawText, trailingNote] = cleaned.split(/——|—/, 2);
  const quotedMatch = /^["“]?(.+?)["”]?[（(]([^()（）]+)[）)]$/.exec(rawText.trim());
  const text = quotedMatch ? stripFormatting(quotedMatch[1]) : stripFormatting(rawText);
  const noteParts = [
    quotedMatch ? stripFormatting(quotedMatch[2]) : null,
    trailingNote ? stripFormatting(trailingNote) : null,
  ].filter((value): value is string => Boolean(value));

  return {
    note: noteParts.length > 0 ? noteParts.join("；") : null,
    text,
  };
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

// ---------------------------------------------------------------------------
// New Obsidian sections (词根词缀 / 词义链路 / 词性转换 / 记忆锚点 / 派生词链接)
// All extended structured fields land in metadata only — no dedicated columns.
// ---------------------------------------------------------------------------

function stripQuotePrefix(line: string) {
  return line.replace(/^>\s?/, "");
}

function dewikilink(value: string) {
  return value.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");
}

/**
 * Extract the body lines of an Obsidian callout, e.g. for marker `[!quote]-`
 * captures every following `> ...` line until the callout ends.
 */
function extractCalloutBody(section: string, markerPattern: RegExp): string | null {
  const lines = section.split("\n");
  const startIndex = lines.findIndex((line) => markerPattern.test(line));
  if (startIndex === -1) {
    return null;
  }

  const body: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(">")) {
      // The first non-quoted line ends the callout (matches Obsidian semantics).
      break;
    }
    body.push(stripQuotePrefix(line));
  }
  return body.join("\n").trim() || null;
}

function parseMorphology(section: string): Morphology | null {
  const trimmed = section.trim();
  if (!trimmed) {
    return null;
  }

  // Take the first non-empty, non-callout line (the structured one-liner).
  // The narrative format used by older fixtures lacks the inline pattern, so
  // we still return a `raw` payload for them.
  const firstLine = trimmed
    .split("\n")
    .map((line) => stripQuotePrefix(line).trim())
    .find((line) => line && !line.startsWith("---") && !line.startsWith("**词源关联**"));

  const raw = stripMarkdown(dewikilink(trimmed));
  if (!firstLine) {
    return { parts: [], raw };
  }

  const segments = firstLine.split(/\s*\+\s*/u).map((segment) => segment.trim()).filter(Boolean);
  const parts: MorphologyPart[] = [];

  for (const segment of segments) {
    const match = /^(.+?)\s*[（(]([^()（）]+)[)）]\s*$/u.exec(dewikilink(segment));
    if (!match) {
      continue;
    }
    const rawText = stripFormatting(match[1]);
    const gloss = stripFormatting(match[2]) || null;

    const startsWithDash = /^[-‐‑‒–—―]/u.test(rawText);
    const endsWithDash = /[-‐‑‒–—―]$/u.test(rawText);
    const cleanedText = rawText.replace(/^[-‐‑‒–—―]+|[-‐‑‒–—―]+$/gu, "").trim();

    let kind: MorphologyPart["kind"] = "unknown";
    if (startsWithDash && !endsWithDash) {
      kind = "suffix";
    } else if (!startsWithDash && endsWithDash) {
      kind = "prefix";
    } else if (!startsWithDash && !endsWithDash) {
      kind = "root";
    }

    parts.push({ gloss, kind, text: cleanedText || rawText });
  }

  return { parts, raw };
}

function extractBoldField(body: string, label: string): string | null {
  // Matches `**label**：value` or `**label**(qualifier)：value`, returning value.
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\*\\*${escaped}\\*\\*(?:[\\uFF08(][^()（）]*[\\uFF09)])?\\s*[：:]\\s*(.+)`,
  );
  const match = pattern.exec(body);
  return match ? stripFormatting(dewikilink(match[1])) : null;
}

function parseSemanticChain(section: string): SemanticChain | null {
  const trimmed = section.trim();
  if (!trimmed) {
    return null;
  }

  const chain = extractCalloutBody(trimmed, /\[!abstract\][-+]?\s*词义链路法/);
  const validation = extractCalloutBody(trimmed, /\[!check\][-+]?\s*链路验证/);
  const oneWord = extractBoldField(trimmed, "一字一词概括");
  const centerExtension = extractBoldField(trimmed, "延伸中心");

  if (!chain && !validation && !oneWord && !centerExtension) {
    return null;
  }

  return { centerExtension, chain, oneWord, validation };
}

function parseMnemonic(section: string): Mnemonic | null {
  const body = extractCalloutBody(section, /\[!quote\][-+]?\s*记忆方式/);
  if (!body) {
    return null;
  }

  const etymology = extractBoldField(body, "叙事化词源");
  const breakdown = extractBoldField(body, "词拆分记忆");

  if (!etymology && !breakdown) {
    return null;
  }

  return { breakdown, etymology };
}

function parseDerivedWords(section: string): DerivedWord[] {
  const table = parseMarkdownTable(section);
  if (!table) {
    return [];
  }

  const headerIndex = new Map(table.headerRow.map((header, index) => [header, index]));
  const wordIdx = headerIndex.get("派生词") ?? -1;
  const formIdx = headerIndex.get("构词分析") ?? -1;
  const meaningIdx = headerIndex.get("释义") ?? -1;
  const relationIdx = headerIndex.get("链接关系") ?? -1;

  return table.dataRows
    .map((row) => ({
      formation: stripFormatting(dewikilink(row[formIdx] ?? "")),
      meaning: stripFormatting(dewikilink(row[meaningIdx] ?? "")),
      relation: stripFormatting(dewikilink(row[relationIdx] ?? "")),
      word: stripFormatting(dewikilink(row[wordIdx] ?? "")),
    }))
    .filter((item) => item.word.length > 0);
}

function parsePosConversions(section: string): PosConversion[] {
  const table = parseMarkdownTable(section);
  if (!table) {
    return [];
  }

  const headerIndex = new Map(table.headerRow.map((header, index) => [header, index]));
  const posIdx = headerIndex.get("词性") ?? -1;
  const meaningIdx = headerIndex.get("释义") ?? -1;
  const pathIdx = headerIndex.get("转换路径") ?? -1;

  return table.dataRows
    .map((row) => ({
      meaning: stripFormatting(row[meaningIdx] ?? ""),
      path: stripFormatting(row[pathIdx] ?? ""),
      pos: stripFormatting(row[posIdx] ?? ""),
    }))
    .filter((item) => item.pos.length > 0);
}

/**
 * Newer corpus format groups each example with its `中译` and `来源` lines as
 * indented bullets. Returns groups: `[parent, ...children]` per example.
 */
function extractCorpusEntries(section: string): string[][] {
  const lines = section.split("\n").map(stripQuotePrefix);
  const entries: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const isTopBullet = /^- /.test(line);
    const isNestedBullet = /^\s+- /.test(line);

    if (isTopBullet) {
      if (current) entries.push(current);
      current = [line.replace(/^- /, "").trim()];
    } else if (isNestedBullet && current) {
      current.push(line.replace(/^\s+- /, "").trim());
    } else if (!line.trim()) {
      // blank line — keep current entry open in case nested bullet follows.
      continue;
    } else {
      // Any other content terminates the current entry.
      if (current) {
        entries.push(current);
        current = null;
      }
    }
  }
  if (current) entries.push(current);
  return entries;
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
    ].filter(Boolean),
  );

  // Word freq: prefer frontmatter, fall back to directory-name lookup so the
  // new corpus layout (`Wiki/L0_超纲词/abdicate.md`) still emits a label.
  const frontmatterWordFreq =
    typeof data.word_freq === "string" && data.word_freq.trim()
      ? data.word_freq.trim()
      : null;
  const wordFreq = frontmatterWordFreq ?? deriveFreqFromSourcePath(sourcePath);

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

  // Newer Obsidian sections — display-only, mirrored into metadata for storage.
  const morphologySection = getSection(content, "词根词缀");
  const semanticChainSection = getSection(content, "词义链路");
  const mnemonicSection = getSection(content, "记忆锚点");
  const derivedWordsSection = getSection(content, "派生词链接");
  const posConversionsSection = getSection(content, "词性转换");

  const extendedFields: WordExtendedFields = createEmptyWordExtendedFields();
  extendedFields.morphology = parseMorphology(morphologySection);
  extendedFields.semanticChain = parseSemanticChain(semanticChainSection);
  extendedFields.mnemonic = parseMnemonic(mnemonicSection);
  extendedFields.derivedWords = parseDerivedWords(derivedWordsSection);
  extendedFields.posConversions = parsePosConversions(posConversionsSection);

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
    derivedWords: extendedFields.derivedWords,
    examples,
    ipa: extractIpa(content),
    langCode: "en",
    lemma,
    metadata: {
      ...castStructuredWordJson(structuredFields),
      date: sourceUpdatedAt,
      derived_words: extendedFields.derivedWords as unknown as Json,
      extension_dim:
        typeof data.extension_dim === "string" && data.extension_dim.trim()
          ? data.extension_dim.trim()
          : parseExtensionDim(definitionMd),
      metaphor_type:
        typeof data.metaphor_type === "string" && data.metaphor_type.trim()
          ? data.metaphor_type.trim()
          : parseMetaphorType(definitionMd),
      mnemonic: extendedFields.mnemonic as unknown as Json,
      morphology: extendedFields.morphology as unknown as Json,
      network_activation: Array.isArray(data.network_activation)
        ? data.network_activation.filter(
            (item): item is string => typeof item === "string",
          )
        : null,
      pos_conversions: extendedFields.posConversions as unknown as Json,
      prototype: typeof data.prototype === "string" ? data.prototype : null,
      review_count:
        typeof data.review_count === "number" ? data.review_count : null,
      semantic_chain: extendedFields.semanticChain as unknown as Json,
      semantic_field:
        typeof data.semantic_field === "string" ? data.semantic_field : null,
      source_repo: "Obsidian-Eg",
      source_title: rawTitle ?? title,
      word_freq: wordFreq,
      word_root: typeof data.word_root === "string" ? data.word_root : null,
      ...buildGraphRelationMetadata(data),
    },
    mnemonic: extendedFields.mnemonic,
    morphology: extendedFields.morphology,
    pos: extractPrimaryPos(definitionMd),
    posConversions: extendedFields.posConversions,
    prototypeText: structuredFields.prototypeText,
    semanticChain: extendedFields.semanticChain,
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
