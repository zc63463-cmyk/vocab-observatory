import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { RevealSection } from "@/components/motion/RevealSection";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { OwnerWordSidebar } from "@/components/words/OwnerWordSidebar";
import { WordAntonyms } from "@/components/words/WordAntonyms";
import { WordCollocations } from "@/components/words/WordCollocations";
import { WordCorpus } from "@/components/words/WordCorpus";
import { WordDefinitions } from "@/components/words/WordDefinitions";
import { WordHeader } from "@/components/words/WordHeader";
import { PrototypeReveal } from "@/components/words/PrototypeReveal";
import { WordSynonyms } from "@/components/words/WordSynonyms";
import { buildWordsListHref } from "@/lib/words-routing";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";
import {
  getPublicWordBySlug,
  getPublicWordMetadataBySlug,
  getStaticPublicWordSlugs,
} from "@/lib/words";

export const dynamic = "force-static";
export const revalidate = 300;
const STATIC_WORD_PARAM_LIMIT = 48;

type WordDetailSearchParams = Promise<{
  freq?: string | string[];
  q?: string | string[];
  review?: string | string[];
  semantic?: string | string[];
}>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicWordMetadataBySlug(slug);

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

export function WordDetailFallback() {
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: WordDetailSearchParams;
}) {
  return (
    <Suspense fallback={<WordDetailFallback />}>
      <WordDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export async function WordDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: WordDetailSearchParams;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const result = await getPublicWordBySlug(slug);
  const listHref = buildWordsListHref(resolvedSearchParams) as Route;

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
          { href: listHref, label: "词条库" },
          { label: result.word.lemma },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          <WordHeader word={result.word} />

          <RevealSection delay={0.05}>
            <WordDefinitions
              definitions={result.word.core_definitions}
              fallbackHtml={result.word.definition_html}
            />
          </RevealSection>

          {result.word.prototype_text ? (
            <RevealSection delay={0.1}>
              <PrototypeReveal text={result.word.prototype_text} />
            </RevealSection>
          ) : null}

          <RevealSection delay={0.15}>
            <WordCollocations collocations={result.word.collocations} legacyExamples={legacyExamples} />
          </RevealSection>

          <RevealSection delay={0.2}>
            <WordCorpus corpusItems={result.word.corpus_items} legacyExamples={legacyExamples} />
          </RevealSection>

          <RevealSection delay={0.25}>
            <WordSynonyms
              resolvedSynonymItems={result.word.resolved_synonym_items}
              fallbackHtml={result.word.synonym_html}
            />
          </RevealSection>

          <RevealSection delay={0.3}>
            <WordAntonyms
              resolvedAntonymItems={result.word.resolved_antonym_items}
              fallbackHtml={result.word.antonym_html}
            />
          </RevealSection>

          {result.word.body_md.trim() ? (
            <RevealSection delay={0.35}>
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
            </RevealSection>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--header-height,5rem)+1.5rem)] lg:self-start">
          <div className="space-y-6">
            <Suspense fallback={
              <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
                <SkeletonLine className="h-4 w-24" />
                <SkeletonLine className="mt-4 h-10 rounded-2xl" />
              </div>
            }>
              <OwnerWordSidebar wordId={result.word.id} />
            </Suspense>
          </div>
        </aside>
      </div>
    </>
  );
}
