import { Badge } from "@/components/ui/Badge";
import type { CoreDefinition } from "@/lib/structured-word";

export function WordDefinitions({
  definitions,
  fallbackHtml,
}: {
  definitions: CoreDefinition[];
  fallbackHtml?: string | null;
}) {
  if (definitions.length === 0 && !fallbackHtml) {
    return null;
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <h2 className="section-title text-2xl font-semibold">核心释义</h2>
      {definitions.length > 0 ? (
        <div className="mt-4 space-y-4">
          {definitions.map((definition) => (
            <div
              key={`${definition.partOfSpeech}-${definition.senses.join("-")}`}
              className="rounded-[1.25rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-5"
            >
              <div className="flex items-center gap-3">
                <Badge>{definition.partOfSpeech}</Badge>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {definition.senses.length} 个义项
                </p>
              </div>
              <ol className="mt-4 space-y-2 pl-5 text-sm leading-7 text-[var(--color-ink-soft)]">
                {definition.senses.map((sense, index) => (
                  <li key={`${definition.partOfSpeech}-${index}`}>{sense}</li>
                ))}
              </ol>
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
