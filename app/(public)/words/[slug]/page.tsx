import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { OwnerWordSidebar } from "@/components/words/OwnerWordSidebar";
import { WordAntonyms } from "@/components/words/WordAntonyms";
import { WordCollocations } from "@/components/words/WordCollocations";
import { WordCorpus } from "@/components/words/WordCorpus";
import { WordDefinitions } from "@/components/words/WordDefinitions";
import { WordHeader } from "@/components/words/WordHeader";
import { WordSynonyms } from "@/components/words/WordSynonyms";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";
import { getPublicWordBySlug, getStaticPublicWordSlugs } from "@/lib/words";

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
  const slugs = await getStaticPublicWordSlugs(STATIC_WORD_PARAM_LIMIT);

  return slugs.map((slug) => ({
    slug,
  }));
}

function WordDetailFallback() {
  return (
    <>
      <div className="mb-4 flex items-center gap-1.5">
        <SkeletonLine className="h-4 w-12" />
        <SkeletonLine className="h-4 w-4" />
        <SkeletonLine className="h-4 w-16" />
        <SkeletonLine className="h-4 w-4" />
        <SkeletonLine className="h-4 w-24" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="panel-strong rounded-[2rem] p-8">
            <SkeletonLine className="h-4 w-20" />
            <SkeletonLine className="mt-4 h-14 w-48" />
            <SkeletonLine className="mt-4 h-5 w-40" />
          </section>
          {Array.from({ length: 4 }).map((_, index) => (
            <section key={index} className="panel rounded-[1.75rem] p-6">
              <SkeletonLine className="h-8 w-36" />
              <SkeletonLine className="mt-5 h-4 w-full" />
              <SkeletonLine className="mt-3 h-4 w-5/6" />
            </section>
          ))}
        </div>
        <aside className="space-y-6">
          {Array.from({ length: 2 }).map((_, index) => (
            <section key={index} className="panel rounded-[1.75rem] p-6">
              <SkeletonLine className="h-8 w-32" />
              <SkeletonLine className="mt-5 h-10 w-full" />
            </section>
          ))}
        </aside>
      </div>
    </>
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
    <>
      <Breadcrumb
        items={[
          { href: "/words", label: "词条库" },
          { label: result.word.lemma },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
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

        <aside className="lg:sticky lg:top-[calc(var(--header-height,5rem)+1.5rem)] lg:self-start">
          <div className="space-y-6">
            <OwnerWordSidebar wordId={result.word.id} />
          </div>
        </aside>
      </div>
    </>
  );
}
