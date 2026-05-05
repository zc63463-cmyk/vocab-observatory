import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import type { Morphology, MorphologyPart } from "@/lib/structured-word";

const KIND_LABEL: Record<MorphologyPart["kind"], string> = {
  prefix: "前缀",
  root: "词根",
  suffix: "后缀",
  unknown: "构词",
};

const KIND_TONE: Record<MorphologyPart["kind"], string> = {
  prefix: "bg-amber-50 text-amber-900 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800/60",
  root: "bg-sky-50 text-sky-900 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800/60",
  suffix: "bg-emerald-50 text-emerald-900 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800/60",
  unknown: "bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] ring-[var(--color-border)]",
};

function getSummary(morphology: Morphology) {
  if (morphology.parts.length === 0) {
    // Narrative-only fallback (older fixtures): show a short excerpt of the raw text.
    const trimmed = morphology.raw.replace(/\s+/gu, " ").trim();
    return trimmed.length > 56 ? `${trimmed.slice(0, 56)}…` : trimmed || "暂无词根词缀";
  }
  return morphology.parts.map((part) => part.text).join(" + ");
}

/**
 * Renders the 词根词缀 (morphology) section as a row of colored chips, one
 * per part. Each chip shows the morpheme text (e.g. "ab", "dic", "ate") with
 * its kind label and gloss directly underneath. Falls back to a simple raw
 * paragraph when the parser couldn't structure the source line (e.g. legacy
 * narrative entries).
 */
export function WordMorphology({ morphology }: { morphology: Morphology | null }) {
  if (!morphology || (!morphology.parts.length && !morphology.raw.trim())) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="词根词缀"
      defaultOpen={true}
      summary={getSummary(morphology)}
    >
      {morphology.parts.length > 0 ? (
        <div className="flex flex-wrap items-stretch gap-3">
          {morphology.parts.map((part, index) => (
            <div
              key={`${part.text}-${index}`}
              className={`flex min-w-[7rem] flex-col gap-1 rounded-[1rem] px-4 py-3 ring-1 ${KIND_TONE[part.kind]}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-base font-semibold tracking-wide">
                  {part.text}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">
                  {KIND_LABEL[part.kind]}
                </span>
              </div>
              {part.gloss ? (
                <p className="text-xs leading-6 opacity-90">{part.gloss}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-7 text-[var(--color-ink-soft)]">{morphology.raw}</p>
      )}
    </CollapsiblePanel>
  );
}
