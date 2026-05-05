import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { CorpusItem } from "@/lib/structured-word";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";

interface DisplayCorpusItem {
  note: string | null;
  source: string | null;
  text: string;
  translation: string | null;
}

function fromLegacyExamples(examples: ParsedExample[]): DisplayCorpusItem[] {
  return examples
    .filter((entry) => entry.source === "corpus")
    .map((entry) => ({
      note: entry.label ? entry.text : null,
      source: null,
      text: entry.label ?? entry.text,
      translation: null,
    }));
}

function fromCorpusItems(items: CorpusItem[]): DisplayCorpusItem[] {
  return items.map((item) => ({
    note: item.note,
    source: item.source ?? null,
    text: item.text,
    translation: item.translation ?? null,
  }));
}

function getSummary(items: DisplayCorpusItem[]) {
  if (items.length === 0) {
    return "暂无语料";
  }

  return `共 ${items.length} 条 · ${excerpt(items[0]?.text ?? "", 40)}`;
}

/**
 * Try to extract a clickable URL from the source string. The corpus format
 * uses "Provider | https://link" as a soft convention; we render the URL as
 * a link and the prefix label as plain text. Falls back to plain text when
 * no URL is detected.
 */
function splitSource(source: string): { label: string; href: string | null } {
  const urlMatch = /(https?:\/\/\S+)/u.exec(source);
  if (!urlMatch) {
    return { href: null, label: source };
  }
  const url = urlMatch[1];
  const label = source.replace(url, "").replace(/[|｜]\s*$/u, "").trim();
  return { href: url, label: label || url };
}

export function WordCorpus({
  corpusItems,
  legacyExamples = [],
}: {
  corpusItems: CorpusItem[];
  legacyExamples?: ParsedExample[];
}) {
  const displayItems =
    corpusItems.length > 0 ? fromCorpusItems(corpusItems) : fromLegacyExamples(legacyExamples);

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
        {displayItems.map((item, index) => {
          const sourceParts = item.source ? splitSource(item.source) : null;
          return (
            <div
              key={`${item.text}-${index}`}
              className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
            >
              <p className="font-semibold leading-7">{item.text}</p>
              {item.translation ? (
                <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                  {item.translation}
                </p>
              ) : null}
              {item.note && !item.translation ? (
                <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{item.note}</p>
              ) : null}
              {sourceParts ? (
                <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                  <span className="opacity-70">来源</span>
                  {sourceParts.href ? (
                    <a
                      href={sourceParts.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline-offset-4 hover:text-[var(--color-accent)] hover:underline"
                    >
                      {sourceParts.label}
                    </a>
                  ) : (
                    <span>{sourceParts.label}</span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsiblePanel>
  );
}
