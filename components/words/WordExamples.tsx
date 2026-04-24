import type { ParsedExample } from "@/lib/sync/parseMarkdown";

export function WordExamples({ examples }: { examples: ParsedExample[] }) {
  if (examples.length === 0) {
    return null;
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <h2 className="section-title text-2xl font-semibold">搭配与语料</h2>
      <div className="mt-4 space-y-3">
        {examples.map((example, index) => (
          <div
            key={`${example.source}-${example.label ?? "line"}-${index}`}
            className="rounded-[1.25rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
              {example.source === "collocation" ? "Collocation" : "Corpus"}
            </p>
            {example.label ? <p className="mt-2 font-semibold">{example.label}</p> : null}
            <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">{example.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
