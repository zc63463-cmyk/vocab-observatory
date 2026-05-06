"use client";

import {
  parseZenDefinition,
  type DefinitionBlock,
  type InlineSegment,
} from "@/lib/review/parse-zen-definition";

/**
 * Visual renderer for `word.definition_md` on the Zen review flashcard.
 *
 * Layout contract (as requested):
 *   1. Main-definition paragraph sits flush inside the outer 核心释义
 *      frame (owned by the caller).
 *   2. Each callout row (原型义 / 延伸维度 / 隐喻类型 ...) renders as
 *      its own small framed card so the user sees them as distinct
 *      meta-data items rather than a flowing paragraph.
 *   3. Inline grammar markers (`V N`, `V V-ing`, `a ~ of N`, ...) use
 *      a code chip rendered at `text-xs` so they sit visibly smaller
 *      than the surrounding body text — identified either from authored
 *      backticks OR the parser's whitelist heuristic for bare markers.
 */
export function ZenDefinitionRenderer({ markdown }: { markdown: string }) {
  const blocks = parseZenDefinition(markdown);

  if (blocks.length === 0) {
    return (
      <p className="text-base leading-relaxed text-[var(--color-ink-soft)]">
        暂无释义
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: DefinitionBlock }) {
  if (block.kind === "paragraph") {
    return (
      <p className="text-base leading-7 text-[var(--color-ink)]">
        <InlineSegments segments={block.segments} />
      </p>
    );
  }

  // callout: each row becomes its own framed chip. We intentionally
  // ignore the callout's own title (`[!tip] 原型义`) because the first
  // row's label almost always duplicates it in the authored vault;
  // showing it twice would add visual noise without new information.
  return (
    <div className="space-y-2">
      {block.rows.map((row, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3"
        >
          {row.label ? (
            <span className="mr-2 inline-block rounded-md bg-[var(--color-surface)] px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              {row.label}
            </span>
          ) : null}
          <span className="text-sm leading-6 text-[var(--color-ink)]">
            <InlineSegments segments={row.segments} />
          </span>
        </div>
      ))}
    </div>
  );
}

function InlineSegments({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((segment, i) => {
        switch (segment.kind) {
          case "text":
            return <span key={i}>{segment.content}</span>;
          case "code":
            // `text-xs` is deliberate: the user asked for grammar chips
            // to read visibly smaller than the surrounding prose.
            return (
              <code
                key={i}
                className="mx-0.5 inline-block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-xs leading-none text-[var(--color-ink-soft)]"
              >
                {segment.content}
              </code>
            );
          case "bold":
            return (
              <strong key={i} className="font-semibold text-[var(--color-ink)]">
                {segment.content}
              </strong>
            );
          case "highlight":
            return (
              <mark
                key={i}
                className="rounded bg-[var(--color-accent-subtle,rgba(200,160,80,0.18))] px-1 text-[var(--color-ink)]"
              >
                {segment.content}
              </mark>
            );
          default: {
            const _exhaustive: never = segment;
            return _exhaustive;
          }
        }
      })}
    </>
  );
}
