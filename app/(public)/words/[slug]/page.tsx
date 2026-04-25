import { notFound } from "next/navigation";
import { AddToReviewButton } from "@/components/words/AddToReviewButton";
import { WordAntonyms } from "@/components/words/WordAntonyms";
import { WordDefinitions } from "@/components/words/WordDefinitions";
import { WordExamples } from "@/components/words/WordExamples";
import { WordHeader } from "@/components/words/WordHeader";
import { WordNotes } from "@/components/words/WordNotes";
import { WordSynonyms } from "@/components/words/WordSynonyms";
import { getOwnerUser } from "@/lib/auth";
import { getSection, renderObsidianMarkdown } from "@/lib/markdown";
import { isNoteRevisionsRelationMissing } from "@/lib/notes";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
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

  const owner = await getOwnerUser();
  const synonymSection = getSection(result.word.body_md, "同义词辨析");
  const antonymSection = getSection(result.word.body_md, "反义词");
  const [bodyHtml, definitionHtml, synonymHtml, antonymHtml] = await Promise.all([
    renderObsidianMarkdown(result.word.body_md),
    result.word.definition_md
      ? renderObsidianMarkdown(result.word.definition_md)
      : Promise.resolve(""),
    synonymSection ? renderObsidianMarkdown(synonymSection) : Promise.resolve(""),
    antonymSection ? renderObsidianMarkdown(antonymSection) : Promise.resolve(""),
  ]);

  let noteHistory: Array<{
    content_md: string;
    created_at: string;
    id: string;
    version: number;
  }> = [];

  if (owner) {
    const supabase = await getServerSupabaseClientOrNull();
    const { data, error } = await supabase!
      .from("note_revisions")
      .select("id, version, content_md, created_at")
      .eq("word_id", result.word.id)
      .eq("user_id", owner.id)
      .order("version", { ascending: false })
      .limit(8);

    if (!isNoteRevisionsRelationMissing(error) && error) {
      throw error;
    }

    noteHistory = data ?? [];
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <WordHeader word={result.word} />
        <WordDefinitions
          definitions={result.word.core_definitions}
          fallbackHtml={definitionHtml}
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
          fallbackHtml={synonymHtml}
        />
        <WordAntonyms
          antonymItems={result.word.antonym_items}
          fallbackHtml={antonymHtml}
        />

        <section className="panel rounded-[1.75rem] p-6">
          <h2 className="section-title text-2xl font-semibold">词条正文</h2>
          <div
            className="prose-obsidian mt-4"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </section>
      </div>

      <aside className="space-y-6">
        {owner ? (
          <AddToReviewButton
            wordId={result.word.id}
            initialProgress={result.word.progress}
          />
        ) : null}
        {owner ? (
          <WordNotes
            wordId={result.word.id}
            initialContent={result.note?.content_md ?? ""}
            initialHistory={noteHistory}
            initialUpdatedAt={result.note?.updated_at ?? null}
            initialVersion={result.note?.version ?? 0}
          />
        ) : (
          <div className="panel rounded-[1.75rem] p-6 text-sm leading-7 text-[var(--color-ink-soft)]">
            登录 owner 账号后，你可以在这里保存个人笔记并把词条加入复习。
          </div>
        )}
      </aside>
    </div>
  );
}
