import Link from "next/link";
import type { Route } from "next";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { ResolvedSynonymItem } from "@/lib/words";

function getSharedDelta(items: ResolvedSynonymItem[]) {
  const values = [
    ...new Set(
      items.map((item) => item.delta?.trim()).filter((value): value is string => Boolean(value)),
    ),
  ];

  return values.length === 1 ? values[0] : null;
}

function getSummary(items: ResolvedSynonymItem[], hasFallbackHtml: boolean) {
  if (items.length === 0) {
    return hasFallbackHtml ? "按正文回退展示" : "暂无同义词辨析";
  }

  const preview = items
    .slice(0, 2)
    .map((item) => item.word)
    .join(" / ");

  return `共 ${items.length} 条 · ${preview}`;
}

export function WordSynonyms({
  resolvedSynonymItems,
  fallbackHtml,
}: {
  resolvedSynonymItems: ResolvedSynonymItem[];
  fallbackHtml?: string | null;
}) {
  if (resolvedSynonymItems.length === 0 && !fallbackHtml) {
    return null;
  }

  const sharedDelta = getSharedDelta(resolvedSynonymItems);

  return (
    <CollapsiblePanel
      title="同义词辨析"
      defaultOpen={false}
      summary={getSummary(resolvedSynonymItems, Boolean(fallbackHtml))}
      badge={
        sharedDelta ? (
          <span className="pill text-[11px] uppercase tracking-[0.2em]">{sharedDelta}</span>
        ) : undefined
      }
    >
      {resolvedSynonymItems.length > 0 ? (
        <div className="space-y-4">
          {sharedDelta ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
              <span className="pill text-[11px] uppercase tracking-[0.2em]">{sharedDelta}</span>
              <span>共享差异标签</span>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)]">
            <table className="min-w-[760px] w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--color-surface-glass)] text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">词</th>
                  <th className="px-4 py-3 font-semibold">核心差异</th>
                  <th className="px-4 py-3 font-semibold">方式特点</th>
                  <th className="px-4 py-3 font-semibold">常见对象</th>
                  <th className="px-4 py-3 font-semibold">情感色彩</th>
                </tr>
              </thead>
              <tbody>
                {resolvedSynonymItems.map((item) => (
                  <tr
                    key={`${item.word}-${item.semanticDiff}-${item.usage}`}
                    className="border-t border-[var(--color-border)] align-top"
                  >
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        {item.href ? (
                          <Link
                            href={item.href as Route}
                            className="font-semibold text-[var(--color-ink)] underline-offset-4 transition hover:text-[var(--color-accent)] hover:underline"
                          >
                            {item.word}
                          </Link>
                        ) : (
                          <span className="font-semibold text-[var(--color-ink)]">{item.word}</span>
                        )}
                        {item.delta && item.delta !== sharedDelta ? (
                          <div>
                            <span className="pill-warm text-[11px] uppercase tracking-[0.2em]">
                              {item.delta}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                      {item.semanticDiff || "—"}
                    </td>
                    <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                      {item.usage || "—"}
                    </td>
                    <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                      {item.object || "—"}
                    </td>
                    <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                      {item.tone || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
