import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { Mnemonic } from "@/lib/structured-word";
import { excerpt } from "@/lib/utils";

function getSummary(mnemonic: Mnemonic) {
  const text = mnemonic.etymology ?? mnemonic.breakdown ?? "";
  return excerpt(text, 56) || "暂无记忆锚点";
}

/**
 * Renders the 记忆锚点 (mnemonic) section: 叙事化词源 (etymology
 * narrative, the preferred mnemonic) on top, 词拆分记忆 (decomposition
 * mnemonic, secondary) underneath with dimmer typography. Either or both
 * may be missing — the panel only renders when at least one is set.
 */
export function WordMnemonic({ mnemonic }: { mnemonic: Mnemonic | null }) {
  if (!mnemonic || (!mnemonic.etymology && !mnemonic.breakdown)) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="记忆锚点"
      defaultOpen={false}
      summary={getSummary(mnemonic)}
    >
      <div className="space-y-3">
        {mnemonic.etymology ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
            <div className="flex items-center gap-2">
              <span className="pill text-[11px] uppercase tracking-[0.2em]">叙事化词源</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                优先
              </span>
            </div>
            <p className="mt-3 text-sm leading-8">{mnemonic.etymology}</p>
          </div>
        ) : null}

        {mnemonic.breakdown ? (
          <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4">
            <div className="flex items-center gap-2">
              <span className="pill text-[11px] uppercase tracking-[0.2em]">词拆分记忆</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                辅助
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--color-ink-soft)]">
              {mnemonic.breakdown}
            </p>
          </div>
        ) : null}
      </div>
    </CollapsiblePanel>
  );
}
