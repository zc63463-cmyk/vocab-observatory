import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { WordCard } from "@/components/words/WordCard";
import { getPublicWords } from "@/lib/words";

export default async function WordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    freq?: string;
    q?: string;
    review?: "all" | "tracked" | "due" | "untracked";
    semantic?: string;
  }>;
}) {
  const { freq, q, review, semantic } = await searchParams;
  const result = await getPublicWords({ freq, q, review, semantic });

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Public Lexicon
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">词条库</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          搜索公开词条。内容来自 Obsidian 主库，复习与个人笔记保持在登录态私有层。
        </p>

        <form action="/words" className="mt-6 space-y-3">
          <div className="flex max-w-3xl flex-col gap-3 sm:flex-row">
            <input
              type="search"
              name="q"
              defaultValue={result.filters.q}
              placeholder="搜索单词、释义、语义场..."
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-5 py-4 text-sm outline-none transition focus:border-[var(--color-accent)]"
            />
            <button className="rounded-2xl bg-[var(--color-accent)] px-6 py-4 text-sm font-semibold text-white transition hover:opacity-90">
              搜索
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select
              name="semantic"
              defaultValue={result.filters.semantic}
              className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
            >
              <option value="">全部语义场</option>
              {result.filterOptions.semanticFields.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              name="freq"
              defaultValue={result.filters.freq}
              className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
            >
              <option value="">全部词频</option>
              {result.filterOptions.frequencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            {result.isOwner ? (
              <select
                name="review"
                defaultValue={result.filters.review}
                className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
              >
                <option value="all">全部词条</option>
                <option value="tracked">已加入复习</option>
                <option value="due">今天到期</option>
                <option value="untracked">未加入复习</option>
              </select>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-sm text-[var(--color-ink-soft)]">
            <span>
              共 {result.counts.total} 条，当前显示 {result.counts.showing} 条
            </span>
            {result.truncated ? <Badge tone="warm">已截断显示</Badge> : null}
            <Link href="/words" className="font-semibold text-[var(--color-accent)]">
              清除筛选
            </Link>
          </div>
        </form>
      </section>

      {!result.configured ? (
        <EmptyState
          title="Supabase 尚未配置"
          description="请先配置环境变量并运行导入接口，随后这里会显示公开词条列表。"
        />
      ) : result.words.length === 0 ? (
        <EmptyState
          title="没有匹配词条"
          description="试试更短的关键词，或者先运行导入同步把 Obsidian 内容写入数据库。"
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.words.map((word) => (
            <WordCard key={word.id} word={word} />
          ))}
        </div>
      )}
    </div>
  );
}
