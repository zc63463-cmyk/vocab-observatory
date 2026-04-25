import { Badge } from "@/components/ui/Badge";
import type { PublicWordDetail } from "@/lib/words";

function getMetadataValue(word: PublicWordDetail, key: string) {
  return typeof word.metadata === "object" &&
    word.metadata &&
    !Array.isArray(word.metadata) &&
    key in word.metadata
    ? String(word.metadata[key])
    : null;
}

export function WordHeader({ word }: { word: PublicWordDetail }) {
  const semanticField = getMetadataValue(word, "semantic_field");
  const wordFrequency = getMetadataValue(word, "word_freq");
  const prototype = word.prototype_text ?? getMetadataValue(word, "prototype");

  return (
    <section className="panel-strong rounded-[2rem] p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-ink-soft)]">
            {word.pos ?? "Word"}
          </p>
          <h1 className="section-title mt-3 text-5xl font-semibold">{word.lemma}</h1>
          {word.ipa ? (
            <p className="mt-3 text-lg tracking-wide text-[var(--color-ink-soft)]">{word.ipa}</p>
          ) : null}
          <p className="mt-6 text-base leading-8 text-[var(--color-ink-soft)]">
            {word.short_definition ?? "暂无摘要释义。"}
          </p>
        </div>

        <div className="flex max-w-md flex-wrap gap-2">
          {semanticField ? <Badge>{semanticField}</Badge> : null}
          {wordFrequency ? <Badge tone="warm">{wordFrequency}</Badge> : null}
          {word.tags.map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
        </div>
      </div>

      {prototype ? (
        <div className="mt-8 rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
            原型义
          </p>
          <p className="mt-2 text-lg leading-8">{prototype}</p>
        </div>
      ) : null}
    </section>
  );
}
