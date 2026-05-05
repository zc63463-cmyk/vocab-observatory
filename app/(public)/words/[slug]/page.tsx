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
import { WordDerivedWords } from "@/components/words/WordDerivedWords";
import { WordHeader } from "@/components/words/WordHeader";
import { WordMnemonic } from "@/components/words/WordMnemonic";
import { WordMorphology } from "@/components/words/WordMorphology";
import { WordPosConversions } from "@/components/words/WordPosConversions";
import { PrototypeReveal } from "@/components/words/PrototypeReveal";
import { WordSectionTOC } from "@/components/words/WordSectionTOC";
import { WordSemanticChain } from "@/components/words/WordSemanticChain";
import { WordSynonyms } from "@/components/words/WordSynonyms";
import { VocabTopologyGraphIsland } from "@/components/vocab/VocabTopologyGraphIsland";
import { buildLocalVocabGraph, type VocabGraphData } from "@/lib/vocab-graph";
import { buildWordTOCSections } from "@/lib/word-section-toc";
import { buildWordsListHref } from "@/lib/words-routing";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";
import { excerpt } from "@/lib/utils";
import {
  getAllPublicWordIndexEntries,
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

function getRelatedReviewWordIds(graphData: VocabGraphData) {
  return [
    ...new Set(
      graphData.nodes
        .filter((node) => node.id !== graphData.centerId)
        .map((node) => node.wordId)
        .filter((wordId): wordId is string => Boolean(wordId)),
    ),
  ];
}

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
  const [result, allEntries] = await Promise.all([
    getPublicWordBySlug(slug),
    getAllPublicWordIndexEntries(),
  ]);
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
  const graphData = buildLocalVocabGraph(result.word, allEntries);
  const relatedReviewWordIds = getRelatedReviewWordIds(graphData);
  const bodySummary = excerpt(result.word.body_md, 180) || "展开查看完整词条正文";

  // Build the in-page TOC for mobile/tablet so readers can jump straight
  // to the personal note section instead of scrolling past every block.
  // Conditional sections (prototype, body) are only listed when the
  // underlying DOM section is rendered — otherwise the chip would be a
  // dead link. Logic lives in lib/word-section-toc.ts so it's covered
  // by `tests/word-section-toc.test.ts` without a DOM.
  const tocSections = buildWordTOCSections({
    hasBody: result.word.body_md.trim().length > 0,
    hasDerivedWords: result.word.derived_words.length > 0,
    hasMnemonic: Boolean(result.word.mnemonic),
    hasMorphology: Boolean(result.word.morphology),
    hasPosConversions: result.word.pos_conversions.length > 0,
    hasPrototype: Boolean(result.word.prototype_text),
    hasSemanticChain: Boolean(result.word.semantic_chain),
  });

  // scroll-margin-top so smooth-scroll (and direct hash links) land
  // flush below the sticky chrome instead of underneath it. The mobile
  // / tablet base reserves room for both the SiteHeader (via
  // --toc-sticky-top, default 5rem; 0 inside the intercepted modal)
  // and the chip bar (3.5rem). The lg: override drops the chip-bar
  // share because WordSectionTOC is `lg:hidden` on desktop, so a
  // shared link like `/words/foo#word-notes` doesn't open with a
  // 3.5rem white gap above the section.
  const sectionScrollMt =
    "scroll-mt-[calc(var(--toc-sticky-top,5rem)+3.5rem)] lg:scroll-mt-[var(--header-height,5rem)]";

  return (
    <>
      <Breadcrumb
        items={[
          { href: listHref, label: "词条库" },
          { label: result.word.lemma },
        ]}
      />

      <WordSectionTOC sections={tocSections} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          <WordHeader word={result.word} />

          <section id="word-definitions" className={sectionScrollMt}>
            <RevealSection delay={0.05}>
              <WordDefinitions
                definitions={result.word.core_definitions}
                fallbackHtml={result.word.definition_html}
              />
            </RevealSection>
          </section>

          {result.word.prototype_text ? (
            <section id="word-prototype" className={sectionScrollMt}>
              <RevealSection delay={0.1}>
                <PrototypeReveal text={result.word.prototype_text} />
              </RevealSection>
            </section>
          ) : null}

          {result.word.morphology ? (
            <section id="word-morphology" className={sectionScrollMt}>
              <RevealSection delay={0.12}>
                <WordMorphology morphology={result.word.morphology} />
              </RevealSection>
            </section>
          ) : null}

          {result.word.semantic_chain ? (
            <section id="word-semantic-chain" className={sectionScrollMt}>
              <RevealSection delay={0.14}>
                <WordSemanticChain semanticChain={result.word.semantic_chain} />
              </RevealSection>
            </section>
          ) : null}

          {result.word.pos_conversions.length > 0 ? (
            <section id="word-pos-conversions" className={sectionScrollMt}>
              <RevealSection delay={0.16}>
                <WordPosConversions posConversions={result.word.pos_conversions} />
              </RevealSection>
            </section>
          ) : null}

          <section id="word-collocations" className={sectionScrollMt}>
            <RevealSection delay={0.18}>
              <WordCollocations collocations={result.word.collocations} legacyExamples={legacyExamples} />
            </RevealSection>
          </section>

          <section id="word-corpus" className={sectionScrollMt}>
            <RevealSection delay={0.2}>
              <WordCorpus corpusItems={result.word.corpus_items} legacyExamples={legacyExamples} />
            </RevealSection>
          </section>

          <section id="word-topology" className={sectionScrollMt}>
            <RevealSection delay={0.25}>
              <VocabTopologyGraphIsland data={graphData} maxNodes={60} />
            </RevealSection>
          </section>

          <section id="word-synonyms" className={sectionScrollMt}>
            <RevealSection delay={0.3}>
              <WordSynonyms
                resolvedSynonymItems={result.word.resolved_synonym_items}
                fallbackHtml={result.word.synonym_html}
              />
            </RevealSection>
          </section>

          <section id="word-antonyms" className={sectionScrollMt}>
            <RevealSection delay={0.35}>
              <WordAntonyms
                resolvedAntonymItems={result.word.resolved_antonym_items}
                fallbackHtml={result.word.antonym_html}
              />
            </RevealSection>
          </section>

          {result.word.derived_words.length > 0 ? (
            <section id="word-derived-words" className={sectionScrollMt}>
              <RevealSection delay={0.37}>
                <WordDerivedWords derivedWords={result.word.derived_words} />
              </RevealSection>
            </section>
          ) : null}

          {result.word.mnemonic ? (
            <section id="word-mnemonic" className={sectionScrollMt}>
              <RevealSection delay={0.39}>
                <WordMnemonic mnemonic={result.word.mnemonic} />
              </RevealSection>
            </section>
          ) : null}

          {result.word.body_md.trim() ? (
            <section id="word-body" className={sectionScrollMt}>
              <RevealSection delay={0.4}>
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
            </section>
          ) : null}
        </div>

        <aside
          id="word-notes"
          className={`${sectionScrollMt} lg:sticky lg:top-[calc(var(--header-height,5rem)+1.5rem)] lg:self-start`}
        >
          <div className="space-y-6">
            <Suspense fallback={
              <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
                <SkeletonLine className="h-4 w-24" />
                <SkeletonLine className="mt-4 h-10 rounded-2xl" />
              </div>
            }>
              <OwnerWordSidebar
                wordId={result.word.id}
                relatedReviewWordIds={relatedReviewWordIds}
              />
            </Suspense>
          </div>
        </aside>
      </div>
    </>
  );
}
