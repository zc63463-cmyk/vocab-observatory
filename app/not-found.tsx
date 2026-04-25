import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="panel-strong max-w-lg rounded-[2.25rem] px-8 py-10 text-center sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          404
        </p>
        <h1 className="section-title mt-4 text-5xl font-semibold">页面未找到</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
          你访问的页面不存在或已被移动。试试从首页重新浏览，或者使用搜索查找你需要的词条。
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            返回首页
          </Link>
          <Link
            href="/words"
            className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
          >
            浏览词条库
          </Link>
        </div>
      </div>
    </div>
  );
}
