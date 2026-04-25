import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="panel-strong relative overflow-hidden max-w-lg rounded-[2.25rem] px-8 py-10 text-center sm:px-12">
        {/* Decorative accent blob */}
        <div
          className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full opacity-[0.08] blur-3xl"
          style={{ background: "var(--color-accent)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "var(--color-accent-2)" }}
        />

        {/* Status badge */}
        <p className="relative inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          <span className="inline-block h-[2px] w-6 bg-[var(--color-accent)]" />
          Error 404
          <span className="inline-block h-[2px] w-6 bg-[var(--color-accent)]" />
        </p>

        {/* Large number */}
        <p className="section-title mt-6 select-none text-[7rem] leading-none tracking-tighter text-[var(--color-surface-muted)]">
          404
        </p>

        <h1 className="section-title mt-2 text-3xl font-semibold">页面未找到</h1>

        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-[var(--color-ink-soft)]">
          你访问的页面不存在或已被移走。也许它去了别的宇宙，或者只是换了个名字。
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--color-accent)]/15 transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-[var(--color-accent)]/25 active:translate-y-0 active:scale-[0.98]"
          >
            返回首页
            <svg
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/words"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-7 py-3 text-sm font-semibold text-[var(--color-ink-soft)] transition-all duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)] active:scale-[0.98]"
          >
            浏览词条库
          </Link>
        </div>
      </div>
    </div>
  );
}
