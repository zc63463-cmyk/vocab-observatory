import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { CollocationItem } from "@/lib/structured-word";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";

interface LegacyCollocationItem {
  note: string | null;
  phrase: string;
}

function fromLegacyExamples(examples: ParsedExample[]): LegacyCollocationItem[] {
  return examples
    .filter((entry) => entry.source === "collocation")
    .map((entry) => ({
      note: entry.label ? entry.text : null,
      phrase: entry.label ?? entry.text,
    }));
}

function getSummary(
  collocations: CollocationItem[],
  fallbackItems: LegacyCollocationItem[],
) {
  const count = collocations.length > 0 ? collocations.length : fallbackItems.length;
  const firstLabel =
    collocations[0]?.phrase ??
    fallbackItems[0]?.phrase ??
    null;

  if (count === 0) {
    return "暂无搭配";
  }

  return `共 ${count} 条 · ${excerpt(firstLabel ?? "", 28)}`;
}

export function WordCollocations({
  collocations,
  legacyExamples = [],
}: {
  collocations: CollocationItem[];
  legacyExamples?: ParsedExample[];
}) {
  const fallbackItems = collocations.length === 0 ? fromLegacyExamples(legacyExamples) : [];

  if (collocations.length === 0 && fallbackItems.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="搭配"
      defaultOpen={false}
      summary={getSummary(collocations, fallbackItems)}
    >
      <div className="space-y-3">
        {collocations.length > 0
          ? collocations.map((item, index) => (
              <div
                key={`${item.phrase}-${index}`}
                className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
              >
                <p className="font-semibold">{item.phrase}</p>
                {item.gloss ? (
                  <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                    {item.gloss}
                  </p>
                ) : null}
                {item.examples.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-3">
                    {item.examples.map((example, exampleIndex) => (
                      <div key={`${item.phrase}-example-${exampleIndex}`} className="space-y-1">
                        <p className="text-sm leading-7">{example.text}</p>
                        {example.translation ? (
                          <p className="text-sm leading-7 text-[var(--color-ink-soft)]">
                            {example.translation}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          : fallbackItems.map((item, index) => (
              <div
                key={`${item.phrase}-${index}`}
                className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
              >
                <p className="font-semibold">{item.phrase}</p>
                {item.note ? (
                  <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                    {item.note}
                  </p>
                ) : null}
              </div>
            ))}
      </div>
    </CollapsiblePanel>
  );
}
