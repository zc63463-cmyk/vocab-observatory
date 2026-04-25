import type { CollocationItem, CorpusItem } from "@/lib/structured-word";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";

function fromLegacyExamples(
  examples: ParsedExample[],
  source: ParsedExample["source"],
): Array<{ note: string | null; text: string }> {
  return examples
    .filter((entry) => entry.source === source)
    .map((entry) => ({
      note: entry.label ? entry.text : null,
      text: entry.label ?? entry.text,
    }));
}

function renderCards(
  items: Array<{ note: string | null; text: string }>,
  label: string,
) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="pill text-[11px] uppercase tracking-[0.2em]">{label}</span>
        <p className="text-sm text-[var(--color-ink-soft)]">{items.length} 条</p>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${label}-${item.text}-${index}`}
            className="rounded-[1.25rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-4"
          >
            <p className="font-semibold">{item.text}</p>
            {item.note ? (
              <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{item.note}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WordExamples({
  collocations,
  corpusItems,
  legacyExamples = [],
}: {
  collocations: CollocationItem[];
  corpusItems: CorpusItem[];
  legacyExamples?: ParsedExample[];
}) {
  const displayCollocations =
    collocations.length > 0
      ? collocations.map((item) => ({
          note: item.note,
          text: item.phrase,
        }))
      : fromLegacyExamples(legacyExamples, "collocation");

  const displayCorpus =
    corpusItems.length > 0
      ? corpusItems.map((item) => ({
          note: item.note,
          text: item.text,
        }))
      : fromLegacyExamples(legacyExamples, "corpus");

  if (displayCollocations.length === 0 && displayCorpus.length === 0) {
    return null;
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <h2 className="section-title text-2xl font-semibold">搭配与语料</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {displayCollocations.length > 0 ? renderCards(displayCollocations, "搭配") : null}
        {displayCorpus.length > 0 ? renderCards(displayCorpus, "语料") : null}
      </div>
    </section>
  );
}
