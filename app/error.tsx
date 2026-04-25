"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="panel-strong max-w-lg rounded-[2.25rem] px-8 py-10 text-center sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-2)]">
          出错了
        </p>
        <h1 className="section-title mt-4 text-5xl font-semibold">页面加载失败</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
          加载这个页面时遇到了问题。你可以尝试重新加载，或者返回首页浏览其他内容。
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            重新加载
          </button>
          <Link
            href="/"
            className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
