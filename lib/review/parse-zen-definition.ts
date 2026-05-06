/**
 * Lightweight parser for the core-definition markdown shown on the
 * Zen review flashcard. Turns `word.definition_md` into a structured
 * block list so the renderer can give each part (main definition,
 * 原型义 / 延伸维度 / 隐喻类型 rows, etc.) its own framed card.
 *
 * Scope on purpose: we only handle the subset of Obsidian-flavoured
 * markdown that actually appears in the `## 核心释义` section of the
 * vault — bold / highlight / inline code / `> [!tip] ...` callouts
 * with `**label**：value` rows. We deliberately do NOT run `marked`
 * here: shipping the full markdown pipeline just to render a
 * flashcard would bloat the client bundle, and the definition block
 * has a consistent hand-authored structure that a focused tokenizer
 * handles reliably in <2 KB of code.
 *
 * Input example (abdicate):
 *
 *   **v.** ①==**退位**== `V the throne` `[政治]`；②失职；
 *
 *   > [!tip] 原型义
 *   > **原型义**：离开权力（从王座上走下来）
 *   > **延伸维度**：社会路径
 *   > **隐喻类型**：方位隐喻（...）
 *
 * Output: [ParagraphBlock, CalloutBlock].
 */

export type InlineSegment =
  | { kind: "text"; content: string }
  | { kind: "code"; content: string }
  | { kind: "bold"; content: string }
  | { kind: "highlight"; content: string };

export interface ParagraphBlock {
  kind: "paragraph";
  segments: InlineSegment[];
}

export interface CalloutRow {
  /**
   * The `**label**` portion of a `> **label**：content` line, or null
   * for continuation text. Keeping it as the authored string (e.g.
   * "原型义", "延伸维度") so the renderer can do its own mapping to
   * short chips without hard-coding a list here.
   */
  label: string | null;
  segments: InlineSegment[];
}

export interface CalloutBlock {
  kind: "callout";
  /** The `[!tip]` / `[!info]` / ... callout type, normalised to lower-case. */
  type: string;
  /** Heading to the right of `[!type]`. Falls back to the type when absent. */
  title: string;
  rows: CalloutRow[];
}

export type DefinitionBlock = ParagraphBlock | CalloutBlock;

/**
 * Grammar-pattern whitelist. These are the tokens that appear in the
 * vault's hand-authored grammar markers. Kept intentionally small:
 * matching anything smarter here would risk false positives on real
 * English words inside the definition (e.g. "to", "of", "the" appear
 * in grammar notes AND in explanatory prose).
 *
 * We tolerate trailing `-ing` / `-ed` / `-er` etc. on `V` and `N` so
 * variants like `V-ing`, `V-ed`, `N-ing` get picked up as one token.
 */
const GRAMMAR_TOKEN_SOURCE =
  "(?:V(?:-\\w+)?|N(?:-\\w+)?|Adj|Adv|one's|oneself|sb|sth|O|~|a|an|the|of|for|to|at|in|on|with|about|from|and|or|that|prep)";

/**
 * A grammar pattern is 2+ whitelisted tokens separated by single
 * spaces, preceded by a word boundary AND followed by a word
 * boundary. That way we catch `V N`, `V V-ing`, `a ~ of N`, but NOT
 * a single stray `N` which would frequently be part of a Chinese
 * sentence. Single-token matches would have far too high a false-
 * positive rate.
 *
 * The lookaround uses `[\\s,，;；.。、]` to anchor to visible
 * separators we actually see in the vault. Plain word-boundary `\\b`
 * isn't enough because CJK punctuation isn't a word boundary in JS.
 */
const GRAMMAR_PATTERN_SOURCE =
  `(?<=^|[\\s,，;；.。、])(${GRAMMAR_TOKEN_SOURCE}(?:\\s+${GRAMMAR_TOKEN_SOURCE})+)(?=$|[\\s,，;；.。、])`;

const GRAMMAR_PATTERN_RE = new RegExp(GRAMMAR_PATTERN_SOURCE, "g");

/** Parse a single line of inline markdown into a flat segment list. */
export function parseInline(raw: string): InlineSegment[] {
  if (!raw) return [];

  const segments: InlineSegment[] = [];

  // Tokenise from left to right. Order matters because we want
  // `==bold==` and `**bold**` to win over plain text, and `` `code` ``
  // to win over grammar-pattern heuristics (authored code already has
  // the semantics baked in).
  let cursor = 0;
  const DELIMS = [
    { kind: "code" as const, open: "`", close: "`" },
    { kind: "highlight" as const, open: "==", close: "==" },
    { kind: "bold" as const, open: "**", close: "**" },
  ];

  while (cursor < raw.length) {
    // Find the next opening delimiter.
    let nextIdx = -1;
    let nextDelim: (typeof DELIMS)[number] | null = null;

    for (const delim of DELIMS) {
      const idx = raw.indexOf(delim.open, cursor);
      if (idx !== -1 && (nextIdx === -1 || idx < nextIdx)) {
        nextIdx = idx;
        nextDelim = delim;
      }
    }

    if (nextIdx === -1 || !nextDelim) {
      // No more delimiters; flush the remainder as grammar-aware text.
      pushTextWithGrammarCodes(segments, raw.slice(cursor));
      break;
    }

    // Flush any preceding plain text (still grammar-aware).
    if (nextIdx > cursor) {
      pushTextWithGrammarCodes(segments, raw.slice(cursor, nextIdx));
    }

    const closeIdx = raw.indexOf(nextDelim.close, nextIdx + nextDelim.open.length);
    if (closeIdx === -1) {
      // Unclosed delimiter: treat rest as plain text and bail.
      pushTextWithGrammarCodes(segments, raw.slice(nextIdx));
      break;
    }

    const inner = raw.slice(nextIdx + nextDelim.open.length, closeIdx);
    // `bold` and `highlight` can nest inline formatting; recurse so
    // `==**foo**==` renders the inner bold correctly. `code` is
    // verbatim per CommonMark.
    if (nextDelim.kind === "code") {
      segments.push({ kind: "code", content: inner });
    } else {
      const nested = parseInline(inner);
      if (nested.length === 1 && nested[0].kind === "text") {
        segments.push({ kind: nextDelim.kind, content: nested[0].content });
      } else {
        // Flatten nested segments by marking them with the outer style.
        // Rendering side handles nested `bold > code` etc. via the
        // segment order — we just preserve text content correctly.
        segments.push({ kind: nextDelim.kind, content: inner });
      }
    }

    cursor = closeIdx + nextDelim.close.length;
  }

  return mergeAdjacentText(segments);
}

/**
 * Split a run of plain text on grammar-pattern matches, emitting
 * `{kind: "code", ...}` for each match and `{kind: "text", ...}` for
 * the gaps. This is what automatically turns bare `V N; V V-ing` into
 * the small-font code chips the user asked for without requiring the
 * vault author to add backticks.
 */
function pushTextWithGrammarCodes(into: InlineSegment[], text: string) {
  if (!text) return;

  GRAMMAR_PATTERN_RE.lastIndex = 0;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = GRAMMAR_PATTERN_RE.exec(text)) !== null) {
    if (match.index > lastEnd) {
      into.push({ kind: "text", content: text.slice(lastEnd, match.index) });
    }
    into.push({ kind: "code", content: match[1] });
    lastEnd = match.index + match[1].length;
  }
  if (lastEnd < text.length) {
    into.push({ kind: "text", content: text.slice(lastEnd) });
  }
}

function mergeAdjacentText(segments: InlineSegment[]): InlineSegment[] {
  const out: InlineSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (seg.kind === "text" && last && last.kind === "text") {
      last.content += seg.content;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/**
 * Top-level block parser. Splits on blank lines, then classifies each
 * block as a callout (leading `>`) or paragraph.
 */
export function parseZenDefinition(md: string): DefinitionBlock[] {
  if (!md || !md.trim()) return [];

  const blocks: DefinitionBlock[] = [];
  const chunks = md
    .replace(/\r\n/g, "\n")
    // Collapse 3+ newlines to 2 so the block split is stable regardless
    // of how the author spaces things.
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n{2,}/);

  for (const rawChunk of chunks) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;

    if (chunk.startsWith(">")) {
      blocks.push(parseCallout(chunk));
    } else {
      // Paragraphs flatten internal single newlines into spaces. The
      // vault sometimes wraps a single logical sentence across two
      // lines for readability; rendering them as `<br>` on a 4:3
      // flashcard would break layout.
      const flat = chunk.replace(/\s*\n\s*/g, " ");
      blocks.push({ kind: "paragraph", segments: parseInline(flat) });
    }
  }

  return blocks;
}

/**
 * Parse an Obsidian-style callout chunk. Expected shape:
 *
 *   > [!tip] 原型义
 *   > **原型义**：离开权力（...）
 *   > **延伸维度**：社会路径
 *
 * We tolerate the occasional trailing `-` / `+` after the type (the
 * Obsidian fold-state marker) and missing titles.
 */
function parseCallout(chunk: string): CalloutBlock {
  const lines = chunk
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trimEnd());

  let type = "note";
  let title = "";
  let startIdx = 0;

  const headerMatch = lines[0]?.match(/^\[!([a-zA-Z]+)\][-+]?\s*(.*)$/);
  if (headerMatch) {
    type = headerMatch[1].toLowerCase();
    title = headerMatch[2].trim();
    startIdx = 1;
  }

  const rows: CalloutRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // `**label**：content` or `**label**:content`. We accept both CJK
    // and ASCII colons because the vault mixes them.
    const labelMatch = line.match(/^\*\*([^*]+)\*\*\s*[：:]\s*(.*)$/);
    if (labelMatch) {
      rows.push({
        label: labelMatch[1].trim(),
        segments: parseInline(labelMatch[2]),
      });
    } else {
      // Continuation line (no `**label**：` prefix) — append to the
      // previous row if one exists, otherwise promote to a bare row.
      const prev = rows[rows.length - 1];
      if (prev) {
        prev.segments.push({ kind: "text", content: " " });
        prev.segments.push(...parseInline(line));
      } else {
        rows.push({ label: null, segments: parseInline(line) });
      }
    }
  }

  return { kind: "callout", type, title: title || defaultTitleForType(type), rows };
}

function defaultTitleForType(type: string): string {
  switch (type) {
    case "tip":
      return "提示";
    case "info":
      return "信息";
    case "warning":
      return "注意";
    case "note":
      return "笔记";
    case "example":
      return "示例";
    case "quote":
      return "引用";
    case "abstract":
      return "摘要";
    case "check":
      return "核对";
    case "success":
      return "已完成";
    default:
      return type;
  }
}
