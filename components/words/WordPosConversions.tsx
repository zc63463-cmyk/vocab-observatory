import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { PosConversion } from "@/lib/structured-word";

function getSummary(items: PosConversion[]) {
  if (items.length === 0) {
    return "暂无词性映射";
  }
  const distinctPos = [...new Set(items.map((item) => item.pos))];
  return `共 ${items.length} 项 · ${distinctPos.join(" / ")}`;
}

/**
 * Renders the 词性转换 (POS conversions) section. Compact 3-column table
 * mapping each part of speech to its meaning and the conversion path that
 * connects it back to the prototype.
 */
export function WordPosConversions({
  posConversions,
}: {
  posConversions: PosConversion[];
}) {
  if (posConversions.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="词性转换"
      defaultOpen={false}
      summary={getSummary(posConversions)}
    >
      <div className="overflow-x-auto rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)]">
        <table className="min-w-[520px] w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--color-surface-glass)] text-xs uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            <tr>
              <th className="px-4 py-3 font-semibold">词性</th>
              <th className="px-4 py-3 font-semibold">释义</th>
              <th className="px-4 py-3 font-semibold">转换路径</th>
            </tr>
          </thead>
          <tbody>
            {posConversions.map((item, index) => (
              <tr
                key={`${item.pos}-${index}`}
                className="border-t border-[var(--color-border)] align-top"
              >
                <td className="px-4 py-4 font-mono font-semibold text-[var(--color-ink)]">
                  {item.pos}
                </td>
                <td className="px-4 py-4 leading-7 text-[var(--color-ink)]">
                  {item.meaning || "—"}
                </td>
                <td className="px-4 py-4 leading-7 text-[var(--color-ink-soft)]">
                  {item.path || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}
