import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { OwnerWordSidebar } from "@/components/words/OwnerWordSidebar";
import { WordAntonyms } from "@/components/words/WordAntonyms";
import { WordCollocations } from "@/components/words/WordCollocations";
import { WordCorpus } from "@/components/words/WordCorpus";
import { WordDefinitions } from "@/components/words/WordDefinitions";
import { WordHeader } from "@/components/words/WordHeader";
import { WordSynonyms } from "@/components/words/WordSynonyms";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";
import { getAllPublicWordIndexEntries, getPublicWordBySlug } from "@/lib/words";

export const dynamic = "force-static";
export const revalidate = 300;
const STATIC_WORD_PARAM_LIMIT = 200;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicWordBySlug(slug);

  if (!result.word) {
    return { title: "词条未找到" };
  }

  const word = result.word;
  const title = `${word.title} - 词汇知识库`;
  const description =
    word.short_definition
      ? `${word.title}${word.lemma !== word.title ? ` (${word.lemma})` : ""}：${word.short_definition}`
      : `查看 ${word.title} 的释义、搭配、语料与同反义词。`;

  return {
    description,
    openGraph: {
      description,
      title,
      type: "article",
    },
    title,
  };
}

export async function generateStaticParams() {
  const words = await getAllPublicWordIndexEntries();

  return words.slice(0, STATIC_WORD_PARAM_LIMIT).map((word) => ({
    slug: word.slug,
  }));
}

function WordDetailFallback() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="panel-strong rounded-[2rem] p-8">
          <div className="h-4 w-20 animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
          <div className="mt-4 h-14 w-48 animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
          <div className="mt-4 h-5 w-40 animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
        </section>
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <div className="h-8 w-36 animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
            <div className="mt-5 h-4 w-full animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
            <div className="mt-3 h-4 w-5/6 animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
          </section>
        ))}
      </div>
      <aside className="space-y-6">
        {Array.from({ length: 2 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <div className="h-8 w-32 animate-pulse rounded-full bg-[rgba(15,111,98,0.08)]" />
            <div className="mt-5 h-10 w-full animate-pulse rounded-2xl bg-[rgba(15,111,98,0.08)]" />
          </section>
        ))}
      </aside>
    </div>
  );
}

export default function WordDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<WordDetailFallback />}>
      <WordDetailContent params={params} />
    </Suspense>
  );
}

async function WordDetailContent({
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

  // examples is stored as Json but is actually ParsedExample[] at runtime
  const legacyExamples = result.word.examples as unknown as ParsedExample[];
  const bodySummary = excerpt(result.word.body_md, 180) || "展开查看完整词条正文";

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

        <WordCollocations collocations={result.word.collocations} legacyExamples={legacyExamples} />
        <WordCorpus corpusItems={result.word.corpus_items} legacyExamples={legacyExamples} />

        <WordSynonyms
          resolvedSynonymItems={result.word.resolved_synonym_items}
          fallbackHtml={result.word.synonym_html}
        />
        <WordAntonyms
          resolvedAntonymItems={result.word.resolved_antonym_items}
          fallbackHtml={result.word.antonym_html}
        />

        {result.word.body_md.trim() ? (
          <CollapsiblePanel
            title="词条正文"
            defaultOpen={false}
            summary={bodySummary}
            subtitle="结构化区块优先展示；展开后查看完整原文。"
          >
            <div
              className="prose-obsidian"
              dangerouslySetInnerHTML={{ __html: result.word.body_html }}
            />
          </CollapsiblePanel>
        ) : null}
      </div>

      <aside className="space-y-6">
        <OwnerWordSidebar wordId={result.word.id} />
      </aside>
    </div>
  );
}
