import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { CorpusItem } from "@/lib/structured-word";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";

interface DisplayCorpusItem {
  note: string | null;
  text: string;
}

function fromLegacyExamples(examples: ParsedExample[]): DisplayCorpusItem[] {
  return examples
    .filter((entry) => entry.source === "corpus")
    .map((entry) => ({
      note: entry.label ? entry.text : null,
      text: entry.label ?? entry.text,
    }));
}

function getSummary(items: DisplayCorpusItem[]) {
  if (items.length === 0) {
    return "暂无语料";
  }

  return `共 ${items.length} 条 · ${excerpt(items[0]?.text ?? "", 40)}`;
}

export function WordCorpus({
  corpusItems,
  legacyExamples = [],
}: {
  corpusItems: CorpusItem[];
  legacyExamples?: ParsedExample[];
}) {
  const displayItems =
    corpusItems.length > 0
      ? corpusItems.map((item) => ({
          note: item.note,
          text: item.text,
        }))
      : fromLegacyExamples(legacyExamples);

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="语料"
      defaultOpen={false}
      summary={getSummary(displayItems)}
    >
      <div className="space-y-3">
        {displayItems.map((item, index) => (
          <div
            key={`${item.text}-${index}`}
            className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
          >
            <p className="font-semibold">{item.text}</p>
            {item.note ? (
              <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{item.note}</p>
            ) : null}
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}
