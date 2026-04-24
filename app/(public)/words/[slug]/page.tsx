import { notFound } from "next/navigation";
import { AddToReviewButton } from "@/components/words/AddToReviewButton";
import { WordExamples } from "@/components/words/WordExamples";
import { WordHeader } from "@/components/words/WordHeader";
import { WordNotes } from "@/components/words/WordNotes";
import { getOwnerUser } from "@/lib/auth";
import { renderObsidianMarkdown } from "@/lib/markdown";
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
  const html = await renderObsidianMarkdown(result.word.body_md);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <WordHeader word={result.word} />
        <section className="panel rounded-[1.75rem] p-6">
          <h2 className="section-title text-2xl font-semibold">词条正文</h2>
          <div
            className="prose-obsidian mt-4"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </section>
        <WordExamples examples={result.word.examples as unknown as ParsedExample[]} />
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
