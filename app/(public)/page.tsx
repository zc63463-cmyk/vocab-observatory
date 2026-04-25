import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { WordCard } from "@/components/words/WordCard";
import { getLandingSnapshot } from "@/lib/words";

export default async function HomePage() {
  const snapshot = await getLandingSnapshot();

  return (
    <div className="space-y-10">
      <section className="panel-strong overflow-hidden rounded-[2.25rem] px-8 py-10 sm:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <Badge>Obsidian -&gt; Supabase -&gt; Vercel</Badge>
            <h1 className="section-title mt-6 max-w-4xl text-5xl font-semibold leading-tight sm:text-6xl">
              把 Obsidian 词库变成可公开浏览、可私有复习的词汇知识站点。
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--color-ink-soft)]">
              公开层负责词条搜索与浏览，登录层负责你的复习记录、笔记与学习统计。第一版默认以
              GitHub 上的 Obsidian 仓库为唯一内容主库。
            </p>

            <form action="/words" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                placeholder="搜索单词、释义、语义场..."
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-5 py-4 text-sm outline-none transition focus:border-[var(--color-accent)]"
              />
              <button className="rounded-2xl bg-[var(--color-accent)] px-6 py-4 text-sm font-semibold text-white transition hover:opacity-90">
                搜索词条
              </button>
            </form>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="panel rounded-[1.6rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                当前状态
              </p>
              <p className="section-title mt-4 text-4xl font-semibold">
                {snapshot.totalWords}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-soft)]">
                已准备公开浏览的词条数量。内容源默认来自 `{snapshot.repoName}`。
              </p>
            </div>
            <div className="panel rounded-[1.6rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                同步策略
              </p>
              <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
                通过 GitHub 仓库压缩包定时导入，避免在 Vercel 运行时依赖本地磁盘。
              </p>
              <Link
                href="/words"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-accent)]"
              >
                查看公开词条 -&gt;
              </Link>
              <Link
                href="/plaza"
                className="mt-3 inline-flex text-sm font-semibold text-[var(--color-accent)]"
              >
                浏览词汇广场 -&gt;
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              Featured Entries
            </p>
            <h2 className="section-title mt-2 text-3xl font-semibold">最近同步的词条</h2>
          </div>
          <Link href="/words" className="text-sm font-semibold text-[var(--color-accent)]">
            查看全部 -&gt;
          </Link>
        </div>

        {snapshot.featuredWords.length === 0 ? (
          <div className="panel rounded-[1.75rem] p-8 text-sm leading-7 text-[var(--color-ink-soft)]">
            {snapshot.configured
              ? "尚未导入词条。配置好 Supabase 后，调用 /api/imports/github 即可开始同步。"
              : "当前尚未配置 Supabase，因此页面先以骨架模式运行。"}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.featuredWords.map((word) => (
              <WordCard key={word.id} word={word} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
