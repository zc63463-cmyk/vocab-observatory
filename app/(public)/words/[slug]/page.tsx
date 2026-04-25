import { notFound } from "next/navigation";
import { OwnerWordSidebar } from "@/components/words/OwnerWordSidebar";
import { WordAntonyms } from "@/components/words/WordAntonyms";
import { WordDefinitions } from "@/components/words/WordDefinitions";
import { WordExamples } from "@/components/words/WordExamples";
import { WordHeader } from "@/components/words/WordHeader";
import { WordSynonyms } from "@/components/words/WordSynonyms";
import { getPublicWordBySlug } from "@/lib/words";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";

export default async function WordDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicWordBySlug(slug);

  if (result.configured && !result.word) {
    notFound();
  }

  if (!result.word) {
    return (
      <div className="panel rounded-[2rem] p-8 text-sm text-[var(--color-ink-soft)]">
        当前还没有可显示的词条，请先完成 Supabase 配置与导入同步。
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <WordHeader word={result.word} />
        <WordDefinitions
          definitions={result.word.core_definitions}
          fallbackHtml={result.word.definition_html}
        />

        {result.word.prototype_text ? (
          <section className="panel rounded-[1.75rem] p-6">
            <h2 className="section-title text-2xl font-semibold">原型义</h2>
            <p className="mt-4 text-base leading-8 text-[var(--color-ink-soft)]">
              {result.word.prototype_text}
            </p>
          </section>
        ) : null}

        <WordExamples
          collocations={result.word.collocations}
          corpusItems={result.word.corpus_items}
          legacyExamples={result.word.examples as unknown as ParsedExample[]}
        />

        <WordSynonyms
          synonymItems={result.word.synonym_items}
          fallbackHtml={result.word.synonym_html}
        />
        <WordAntonyms
          antonymItems={result.word.antonym_items}
          fallbackHtml={result.word.antonym_html}
        />

        <section className="panel rounded-[1.75rem] p-6">
          <h2 className="section-title text-2xl font-semibold">词条正文</h2>
          <div
            className="prose-obsidian mt-4"
            dangerouslySetInnerHTML={{ __html: result.word.body_html }}
          />
        </section>
      </div>

      <aside className="space-y-6">
        <OwnerWordSidebar wordId={result.word.id} />
      </aside>
    </div>
  );
}
