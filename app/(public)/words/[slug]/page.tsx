import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  GitBranch,
  Layers3,
  MessageSquareQuote,
  Network,
  Quote,
  Scale,
  Sparkles,
  Sprout,
} from "lucide-react";
import { BentoCard } from "@/components/ui/BentoCard";
import { CollapsibleBypass } from "@/components/ui/CollapsiblePanel";
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

/**
 * One-line preview shown on the collapsed `语义链路` Bento card.
 * `SemanticChain` has four optional string fields — the cleanest
 * thumbnail is whichever is filled in first, in the order the parser
 * tends to populate them, falling back to a generic prompt.
 */
function semanticChainSummary(
  chain: import("@/lib/structured-word").SemanticChain,
): string {
  const candidate = chain.oneWord ?? chain.chain ?? chain.centerExtension ?? chain.validation;
  if (!candidate) return "";
  return excerpt(candidate, 56);
}

/**
 * Bento preview for the `搭配` card. Prefers the structured count
 * (post-importer corpus has it) but falls back to counting legacy
 * `ParsedExample` rows tagged as collocations so older entries still
 * show a meaningful chip instead of "0 项".
 */
function collocationPreview(
  structuredCount: number,
  legacyExamples: ParsedExample[],
): string {
  if (structuredCount > 0) return `${structuredCount} 项搭配`;
  const legacyCount = legacyExamples.filter(
    (example) => example.source === "collocation",
  ).length;
  if (legacyCount > 0) return `${legacyCount} 项搭配 (来自正文)`;
  return "暂无搭配";
}

/** Mirror of `collocationPreview` for the `语料` card. */
function corpusPreview(
  structuredCount: number,
  legacyExamples: ParsedExample[],
): string {
  if (structuredCount > 0) return `${structuredCount} 条语料`;
  const legacyCount = legacyExamples.filter(
    (example) => example.source === "corpus",
  ).length;
  if (legacyCount > 0) return `${legacyCount} 条语料 (来自正文)`;
  return "暂无语料";
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

  // hasData flags mirror the null-return guards inside each leaf
  // component (WordCollocations / WordCorpus / WordSynonyms /
  // WordAntonyms). Lifting the check up to the page level lets us
  // skip the entire BentoCard — otherwise users would tap a card
  // only to open an empty modal, which is a regression vs. the old
  // page where empty sections collapsed silently.
  const hasCollocations =
    result.word.collocations.length > 0 ||
    legacyExamples.some((example) => example.source === "collocation");
  const hasCorpus =
    result.word.corpus_items.length > 0 ||
    legacyExamples.some((example) => example.source === "corpus");
  const hasSynonyms =
    result.word.resolved_synonym_items.length > 0 || Boolean(result.word.synonym_html);
  const hasAntonyms =
    result.word.resolved_antonym_items.length > 0 || Boolean(result.word.antonym_html);

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
          {/*
            ──── Main strip (always SSR, full panels) ─────────────────
            The four blocks the user always wants in front of them:
            identity (Header), the structured definitions, the
            morphology breakdown, and the mnemonic anchor. Everything
            else is demoted to the Bento grid below to keep first
            paint cheap.
          */}
          <WordHeader word={result.word} />

          <section id="word-definitions" className={sectionScrollMt}>
            <RevealSection delay={0.05}>
              <WordDefinitions
                definitions={result.word.core_definitions}
                fallbackHtml={result.word.definition_html}
              />
            </RevealSection>
          </section>

          {/*
            CollapsibleBypass mode="flat" tells the inner
            CollapsiblePanel (which both WordMorphology and
            WordMnemonic self-wrap in) to drop its chevron toggle and
            render content unconditionally. These two sections were
            promoted to the always-visible main strip; keeping the
            chevron would make users click again to see what we just
            promised them.
          */}
          <CollapsibleBypass mode="flat">
            {result.word.morphology ? (
              <section id="word-morphology" className={sectionScrollMt}>
                <RevealSection delay={0.08}>
                  <WordMorphology morphology={result.word.morphology} />
                </RevealSection>
              </section>
            ) : null}

            {result.word.mnemonic ? (
              <section id="word-mnemonic" className={sectionScrollMt}>
                <RevealSection delay={0.1}>
                  <WordMnemonic mnemonic={result.word.mnemonic} />
                </RevealSection>
              </section>
            ) : null}
          </CollapsibleBypass>

          {/*
            ──── Bento grid (lazy-mounted, click to expand) ───────────
            Each BentoCard renders only its preview chrome (icon +
            title + count) up front; the heavier React subtree inside
            `children` mounts into the DOM exclusively while the
            modal is open. That makes the vocab topology graph (60
            nodes of d3-style force layout, the single most expensive
            client island on this page), the markdown body (often
            multi-KB sanitized HTML), and ~7 other structured
            sections completely free at first paint.

            Card ids match the existing TOC chip ids 1:1 so the chip
            bar's `scrollIntoView` and any external deep link
            (/words/foo#word-collocations) still land on the right
            target — they just land on the card, and the user taps
            the card itself to expand the section.
          */}
          <RevealSection delay={0.12}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.word.prototype_text ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-prototype"
                  icon={<Sparkles size={16} strokeWidth={2.25} />}
                  preview={excerpt(result.word.prototype_text, 56) || "查看原型描述"}
                  subtitle="prototype"
                  title="原型"
                >
                  <PrototypeReveal text={result.word.prototype_text} />
                </BentoCard>
              ) : null}

              {result.word.semantic_chain ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-semantic-chain"
                  icon={<GitBranch size={16} strokeWidth={2.25} />}
                  preview={
                    semanticChainSummary(result.word.semantic_chain) || "展开语义链路"
                  }
                  subtitle="semantic chain"
                  title="语义链路"
                >
                  <WordSemanticChain semanticChain={result.word.semantic_chain} />
                </BentoCard>
              ) : null}

              {result.word.pos_conversions.length > 0 ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-pos-conversions"
                  icon={<ArrowLeftRight size={16} strokeWidth={2.25} />}
                  preview={`${result.word.pos_conversions.length} 项词性转换`}
                  subtitle="part-of-speech"
                  title="词性转换"
                >
                  <WordPosConversions posConversions={result.word.pos_conversions} />
                </BentoCard>
              ) : null}

              {hasCollocations ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-collocations"
                  icon={<MessageSquareQuote size={16} strokeWidth={2.25} />}
                  preview={collocationPreview(
                    result.word.collocations.length,
                    legacyExamples,
                  )}
                  subtitle="collocations"
                  title="搭配"
                >
                  <WordCollocations
                    collocations={result.word.collocations}
                    legacyExamples={legacyExamples}
                  />
                </BentoCard>
              ) : null}

              {hasCorpus ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-corpus"
                  icon={<Quote size={16} strokeWidth={2.25} />}
                  preview={corpusPreview(
                    result.word.corpus_items.length,
                    legacyExamples,
                  )}
                  subtitle="corpus"
                  title="语料"
                >
                  <WordCorpus
                    corpusItems={result.word.corpus_items}
                    legacyExamples={legacyExamples}
                  />
                </BentoCard>
              ) : null}

              {hasSynonyms ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-synonyms"
                  icon={<Layers3 size={16} strokeWidth={2.25} />}
                  preview={
                    result.word.resolved_synonym_items.length > 0
                      ? `${result.word.resolved_synonym_items.length} 个同义/近义`
                      : "查看同义辨析"
                  }
                  subtitle="synonyms"
                  title="同义辨析"
                >
                  <WordSynonyms
                    resolvedSynonymItems={result.word.resolved_synonym_items}
                    fallbackHtml={result.word.synonym_html}
                  />
                </BentoCard>
              ) : null}

              {hasAntonyms ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-antonyms"
                  icon={<Scale size={16} strokeWidth={2.25} />}
                  preview={
                    result.word.resolved_antonym_items.length > 0
                      ? `${result.word.resolved_antonym_items.length} 个反义`
                      : "查看反义对照"
                  }
                  subtitle="antonyms"
                  title="反义"
                >
                  <WordAntonyms
                    resolvedAntonymItems={result.word.resolved_antonym_items}
                    fallbackHtml={result.word.antonym_html}
                  />
                </BentoCard>
              ) : null}

              {result.word.derived_words.length > 0 ? (
                <BentoCard
                  className={sectionScrollMt}
                  id="word-derived-words"
                  icon={<Sprout size={16} strokeWidth={2.25} />}
                  preview={`${result.word.derived_words.length} 个派生词族`}
                  subtitle="derived"
                  title="派生词"
                >
                  <WordDerivedWords derivedWords={result.word.derived_words} />
                </BentoCard>
              ) : null}

              <BentoCard
                className={sectionScrollMt}
                gridSpan={3}
                id="word-topology"
                icon={<Network size={16} strokeWidth={2.25} />}
                preview={`${graphData.nodes.length} 节点 · ${graphData.edges.length} 关联`}
                subtitle="vocab topology"
                title="词汇拓扑图谱"
                variant="accent"
              >
                <VocabTopologyGraphIsland data={graphData} maxNodes={60} />
              </BentoCard>

              {result.word.body_md.trim() ? (
                <BentoCard
                  className={sectionScrollMt}
                  gridSpan={3}
                  id="word-body"
                  icon={<BookOpen size={16} strokeWidth={2.25} />}
                  preview={bodySummary}
                  subtitle="full markdown body"
                  title="词条正文"
                >
                  <div
                    className="prose-obsidian"
                    dangerouslySetInnerHTML={{ __html: result.word.body_html }}
                  />
                </BentoCard>
              ) : null}
            </div>
          </RevealSection>
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
