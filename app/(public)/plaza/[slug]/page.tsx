import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { WordCard } from "@/components/words/WordCard";
import { getCollectionNoteKindLabel } from "@/lib/collection-notes";
import { getPublicCollectionNoteBySlug } from "@/lib/plaza";
import { formatDate } from "@/lib/utils";

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return typeof metadata[key] === "string" ? String(metadata[key]) : null;
}

export default async function PlazaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicCollectionNoteBySlug(slug);

  if (result.canonicalPath) {
    redirect(result.canonicalPath as Route);
  }

  if (result.configured && result.available && !result.note) {
    notFound();
  }

  if (!result.configured) {
    return (
      <EmptyState
        title="Supabase 尚未配置"
        description="先补齐公开环境变量并完成导入，词汇广场详情页才能从数据库中读取。"
      />
    );
  }

  if (!result.available) {
    return (
      <EmptyState
        title="词汇广场尚未初始化"
        description="当前还没有 collection_notes 表或公开数据。先执行 0006_collection_notes.sql，再重新跑一次导入同步。"
      />
    );
  }

  if (!result.note) {
    return null;
  }

  const note = result.note;
  const coreMeaning = getMetadataString(note.metadata as Record<string, unknown>, "coreMeaning");
  const rootType = getMetadataString(note.metadata as Record<string, unknown>, "rootType");
  const origin = getMetadataString(note.metadata as Record<string, unknown>, "origin");
  const definition = getMetadataString(note.metadata as Record<string, unknown>, "definition");

  return (
    <div className="space-y-6">
      <section className="panel-strong rounded-[2rem] p-8">
        <Link
          href="/plaza"
          className="text-sm font-semibold text-[var(--color-accent)]"
        >
          &larr; 返回词汇广场
        </Link>

        <div className="mt-5 flex flex-wrap gap-2">
          <Badge>{getCollectionNoteKindLabel(note.kind)}</Badge>
          <Badge tone="warm">最近更新 {formatDate(note.updated_at)}</Badge>
          <Badge>关联词条 {note.related_words.length}</Badge>
        </div>

        <h1 className="section-title mt-5 text-5xl font-semibold">{note.title}</h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-[var(--color-ink-soft)]">
          {note.summary || coreMeaning || definition || "这是一篇来自 Obsidian 主库的集合型词汇笔记。"}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {rootType ? <Badge>{rootType}</Badge> : null}
          {coreMeaning ? <Badge>{coreMeaning}</Badge> : null}
          {origin ? <Badge>{origin}</Badge> : null}
        </div>
      </section>

      <section className="panel rounded-[1.75rem] p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              Public Note
            </p>
            <h2 className="section-title mt-2 text-3xl font-semibold">集合笔记正文</h2>
          </div>
        </div>
        <div
          className="prose-obsidian mt-5"
          dangerouslySetInnerHTML={{ __html: note.body_html }}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              Related Words
            </p>
            <h2 className="section-title mt-2 text-3xl font-semibold">相关词条</h2>
          </div>
          <p className="text-sm text-[var(--color-ink-soft)]">{note.related_words.length} 个结果</p>
        </div>

        {note.related_words.length === 0 ? (
          <EmptyState
            title="暂未解析到相关词条"
            description="这篇集合笔记已经导入成功，但当前还没有从正文链接或语义场匹配出公开词条。"
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {note.related_words.map((word) => (
              <WordCard key={word.id} word={{ ...word, progress: null }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
