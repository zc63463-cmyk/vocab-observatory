"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="panel-strong relative overflow-hidden max-w-lg rounded-[2.25rem] px-8 py-10 text-center sm:px-12">
        {/* Decorative accent blob */}
        <div
          className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full opacity-[0.08] blur-3xl"
          style={{ background: "var(--color-accent-2)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "var(--color-accent)" }}
        />

        {/* Status badge */}
        <p className="relative inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-2)]">
          <span className="inline-block h-[2px] w-6 bg-[var(--color-accent-2)]" />
          出错了
          <span className="inline-block h-[2px] w-6 bg-[var(--color-accent-2)]" />
        </p>

        {/* Icon + Title */}
        <div className="mt-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(178,87,47,0.08)]">
            <AlertTriangle className="h-7 w-7 text-[var(--color-accent-2)]" />
          </div>
        </div>

        <h1 className="section-title mt-5 text-3xl font-semibold">页面加载失败</h1>

        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-[var(--color-ink-soft)]">
          加载这个页面时遇到了问题。这通常是暂时的，重新加载通常可以解决。
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onClick={reset}
            className="group shadow-md shadow-[var(--color-accent)]/15 hover:-translate-y-px hover:shadow-lg hover:shadow-[var(--color-accent)]/25 active:translate-y-0 active:scale-[0.98]"
            icon={
              <svg
                className="h-3.5 w-3.5 transition-transform group-hover:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            重新加载
          </Button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-7 py-3 text-sm font-semibold text-[var(--color-ink-soft)] transition-all duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)] active:scale-[0.98]"
          >
            返回首页
          </Link>
        </div>

        {/* Error detail (collapsible) */}
        {error?.digest ? (
          <div className="mt-8 border-t border-[var(--color-border)] pt-5">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="mx-auto inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
            >
              {showDetail ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {showDetail ? "隐藏" : "查看"} 错误详情
            </button>

            {showDetail && (
              <div className="mt-3 mx-auto max-w-xs overflow-auto rounded-xl bg-[var(--color-surface-muted)] p-3 text-left">
                <p className="text-xs font-mono leading-relaxed text-[var(--color-ink-soft)] break-all">
                  {error.message || "未知错误"}
                  {error.digest && (
                    <>
                      <br />
                      <span className="text-[var(--color-ink-soft)] opacity-60">Digest: {error.digest}</span>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
