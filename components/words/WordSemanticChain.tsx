import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { SemanticChain } from "@/lib/structured-word";

function getSummary(chain: SemanticChain) {
  if (chain.oneWord) {
    return chain.oneWord;
  }
  if (chain.centerExtension) {
    return chain.centerExtension;
  }
  return chain.chain ? "查看词义链路展开" : "暂无词义链路";
}

/**
 * Renders the 词义链路 (semantic chain) section. Surfaces the high-level
 * "一字一词概括" / "延伸中心" summaries first since they're the cognitive
 * anchors readers want, with the full chain narrative + 链路验证 collapsed
 * inside the panel for deeper study.
 */
export function WordSemanticChain({
  semanticChain,
}: {
  semanticChain: SemanticChain | null;
}) {
  if (
    !semanticChain ||
    (!semanticChain.chain &&
      !semanticChain.oneWord &&
      !semanticChain.centerExtension &&
      !semanticChain.validation)
  ) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="词义链路"
      defaultOpen={false}
      summary={getSummary(semanticChain)}
    >
      <div className="space-y-4">
        {semanticChain.oneWord ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <span className="pill text-[11px] uppercase tracking-[0.2em]">一字一词</span>
            <p className="mt-2 text-base font-medium leading-7">{semanticChain.oneWord}</p>
          </div>
        ) : null}

        {semanticChain.centerExtension ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <span className="pill text-[11px] uppercase tracking-[0.2em]">延伸中心</span>
            <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
              {semanticChain.centerExtension}
            </p>
          </div>
        ) : null}

        {semanticChain.chain ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4">
            <span className="pill text-[11px] uppercase tracking-[0.2em]">链路展开</span>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--color-ink)]">
              {semanticChain.chain}
            </pre>
          </div>
        ) : null}

        {semanticChain.validation ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <span className="pill text-[11px] uppercase tracking-[0.2em]">链路验证</span>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--color-ink-soft)]">
              {semanticChain.validation}
            </pre>
          </div>
        ) : null}
      </div>
    </CollapsiblePanel>
  );
}
