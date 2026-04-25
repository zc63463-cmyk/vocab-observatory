import type { AntonymItem } from "@/lib/structured-word";

export function WordAntonyms({
  antonymItems,
  fallbackHtml,
}: {
  antonymItems: AntonymItem[];
  fallbackHtml?: string | null;
}) {
  if (antonymItems.length === 0 && !fallbackHtml) {
    return null;
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <h2 className="section-title text-2xl font-semibold">反义词</h2>
      {antonymItems.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {antonymItems.map((item) => (
            <div
              key={`${item.word}-${item.note ?? ""}`}
              className="rounded-[1.2rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-4"
            >
              <p className="font-semibold">{item.word}</p>
              {item.note ? (
                <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{item.note}</p>
              ) : null}
            </div>
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
