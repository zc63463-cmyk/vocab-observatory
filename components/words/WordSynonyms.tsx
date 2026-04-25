import type { SynonymItem } from "@/lib/structured-word";

function getSharedDelta(items: SynonymItem[]) {
  const values = [...new Set(items.map((item) => item.delta).filter(Boolean))];
  return values.length === 1 ? values[0] : null;
}

export function WordSynonyms({
  synonymItems,
  fallbackHtml,
}: {
  synonymItems: SynonymItem[];
  fallbackHtml?: string | null;
}) {
  if (synonymItems.length === 0 && !fallbackHtml) {
    return null;
  }

  const sharedDelta = getSharedDelta(synonymItems);

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title text-2xl font-semibold">同义词辨析</h2>
        {sharedDelta ? (
          <span className="pill text-[11px] uppercase tracking-[0.2em]">{sharedDelta}</span>
        ) : null}
      </div>
      {synonymItems.length > 0 ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {synonymItems.map((item) => (
            <article
              key={`${item.word}-${item.semanticDiff}-${item.usage}`}
              className="rounded-[1.25rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{item.word}</h3>
                {item.delta && item.delta !== sharedDelta ? (
                  <span className="pill-warm text-[11px] uppercase tracking-[0.2em]">
                    {item.delta}
                  </span>
                ) : null}
              </div>
              <dl className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-ink-soft)]">
                {item.semanticDiff ? (
                  <div>
                    <dt className="font-semibold text-[var(--color-ink)]">核心差异</dt>
                    <dd>{item.semanticDiff}</dd>
                  </div>
                ) : null}
                {item.usage ? (
                  <div>
                    <dt className="font-semibold text-[var(--color-ink)]">方式特点</dt>
                    <dd>{item.usage}</dd>
                  </div>
                ) : null}
                {item.object ? (
                  <div>
                    <dt className="font-semibold text-[var(--color-ink)]">常见对象</dt>
                    <dd>{item.object}</dd>
                  </div>
                ) : null}
                {item.tone ? (
                  <div>
                    <dt className="font-semibold text-[var(--color-ink)]">情感色彩</dt>
                    <dd>{item.tone}</dd>
                  </div>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div
          className="prose-obsidian mt-4 rounded-[1.25rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-5"
          dangerouslySetInnerHTML={{ __html: fallbackHtml ?? "" }}
        />
      )}
    </section>
  );
}
