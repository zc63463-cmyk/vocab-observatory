import Link from "next/link";
import type { Route } from "next";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { ResolvedAntonymItem } from "@/lib/words";

function getSummary(items: ResolvedAntonymItem[], hasFallbackHtml: boolean) {
  if (items.length === 0) {
    return hasFallbackHtml ? "按正文回退展示" : "暂无反义词";
  }

  const preview = items
    .slice(0, 2)
    .map((item) => item.word)
    .join(" / ");

  return `共 ${items.length} 条 · ${preview}`;
}

export function WordAntonyms({
  resolvedAntonymItems,
  fallbackHtml,
}: {
  resolvedAntonymItems: ResolvedAntonymItem[];
  fallbackHtml?: string | null;
}) {
  if (resolvedAntonymItems.length === 0 && !fallbackHtml) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="反义词"
      defaultOpen={false}
      summary={getSummary(resolvedAntonymItems, Boolean(fallbackHtml))}
    >
      {resolvedAntonymItems.length > 0 ? (
        <div className="grid gap-3">
          {resolvedAntonymItems.map((item) => (
            <div
              key={`${item.word}-${item.note ?? ""}`}
              className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
            >
              {item.href ? (
                <Link
                  href={item.href as Route}
                  className="font-semibold text-[var(--color-ink)] underline-offset-4 transition hover:text-[var(--color-accent)] hover:underline"
                >
                  {item.word}
                </Link>
              ) : (
                <p className="font-semibold">{item.word}</p>
              )}
              {item.note ? (
                <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{item.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="prose-obsidian rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5"
          dangerouslySetInnerHTML={{ __html: fallbackHtml ?? "" }}
        />
      )}
    </CollapsiblePanel>
  );
}
