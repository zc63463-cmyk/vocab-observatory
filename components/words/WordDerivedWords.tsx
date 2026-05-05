import Link from "next/link";
import type { Route } from "next";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { resolveWordHref } from "@/lib/words";
import type { DerivedWord } from "@/lib/structured-word";

function getSummary(items: DerivedWord[]) {
  if (items.length === 0) {
    return "暂无派生词";
  }
  const preview = items.slice(0, 3).map((item) => item.word).join(" / ");
  return `共 ${items.length} 条 · ${preview}`;
}

/**
 * Renders the 派生词链接 (derived words) section as a compact table.
 * Each `word` is linked to its own detail page when an underlying entry
 * exists in the corpus — `resolveWordHref` returns null otherwise so the
 * label degrades to plain text.
 */
export function WordDerivedWords({
  derivedWords,
}: {
  derivedWords: DerivedWord[];
}) {
  if (derivedWords.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="派生词族"
      defaultOpen={false}
      summary={getSummary(derivedWords)}
    >
      <div className="overflow-x-auto rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)]">
        <table className="min-w-[600px] w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--color-surface-glass)] text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            <tr>
              <th className="px-4 py-3 font-semibold">派生词</th>
              <th className="px-4 py-3 font-semibold">构词分析</th>
              <th className="px-4 py-3 font-semibold">释义</th>
              <th className="px-4 py-3 font-semibold">链接关系</th>
            </tr>
          </thead>
          <tbody>
            {derivedWords.map((item, index) => {
              const href = resolveWordHref(item.word);
              return (
                <tr
                  key={`${item.word}-${index}`}
                  className="border-t border-[var(--color-border)] align-top"
                >
                  <td className="px-4 py-4">
                    {href ? (
                      <Link
                        href={href as Route}
                        className="font-mono font-semibold text-[var(--color-ink)] underline-offset-4 transition hover:text-[var(--color-accent)] hover:underline"
                      >
                        {item.word}
                      </Link>
                    ) : (
                      <span className="font-mono font-semibold text-[var(--color-ink)]">
                        {item.word}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs leading-6 text-[var(--color-ink-soft)]">
                    {item.formation || "—"}
                  </td>
                  <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                    {item.meaning || "—"}
                  </td>
                  <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                    {item.relation || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}
