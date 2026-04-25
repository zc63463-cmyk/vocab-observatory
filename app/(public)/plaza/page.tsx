import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCollectionNoteSummaryText, getPlazaOverview } from "@/lib/plaza";
import { formatDate } from "@/lib/utils";

export default async function PlazaPage() {
  const result = await getPlazaOverview();

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Public Collections
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">词汇广场</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          这里单独展示 Obsidian 主库里的集合型词汇笔记，当前先公开两类内容：词根词缀与语义场。
          词条页继续负责单词本身，这里负责看“整组内容”。
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Badge>集合笔记 {result.total}</Badge>
          <Badge tone="warm">公开浏览</Badge>
          <Link
            href="/words"
            className="inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(255,255,255,0.5)]"
          >
            返回词条库
          </Link>
        </div>
      </section>

      {!result.configured ? (
        <EmptyState
          title="Supabase 尚未配置"
          description="先补齐公开环境变量并完成导入，词汇广场的数据才能从数据库里公开读取。"
        />
      ) : !result.available ? (
        <EmptyState
          title="词汇广场尚未初始化"
          description="当前还没有 collection_notes 表或公开数据。先执行 0006_collection_notes.sql，再重新跑一次导入同步。"
        />
      ) : result.groups.length === 0 ? (
        <EmptyState
          title="还没有集合笔记"
          description="导入完成后，这里会按词根词缀和语义场两类展示集合型 Obsidian 笔记。"
        />
      ) : (
        result.groups.map((group) => (
          <section key={group.kind} className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                  {group.kind.replace("_", " ")}
                </p>
                <h2 className="section-title mt-2 text-3xl font-semibold">{group.label}</h2>
              </div>
              <p className="text-sm text-[var(--color-ink-soft)]">{group.count} 篇笔记</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {group.notes.map((note) => (
                <Link
                  key={note.id}
                  href={`/plaza/${note.slug}`}
                  className="panel group flex h-full flex-col rounded-[1.75rem] p-6 transition duration-200 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-[0_22px_54px_rgba(71,50,20,0.14)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <Badge>{group.label}</Badge>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {formatDate(note.updated_at)}
                    </span>
                  </div>

                  <h3 className="section-title mt-5 text-3xl font-semibold">{note.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
                    {getCollectionNoteSummaryText(note)}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {note.related_word_slugs.length > 0 ? (
                      <Badge tone="warm">关联词条 {note.related_word_slugs.length}</Badge>
                    ) : null}
                    {note.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>

                  <p className="mt-6 text-sm font-semibold text-[var(--color-accent)]">
                    查看集合笔记 -&gt;
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
