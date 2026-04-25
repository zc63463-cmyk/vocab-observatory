import Link from "next/link";
import type { Route } from "next";
import { HeaderAuthStatus } from "@/components/layout/HeaderAuthStatus";
import { env, hasSupabasePublicEnv } from "@/lib/env";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/words", label: "词条库" },
  { href: "/review", label: "复习" },
  { href: "/dashboard", label: "仪表盘" },
  { href: "/notes", label: "笔记" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[rgba(246,241,231,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <div className="soft-grid flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.55)]">
              <span className="section-title text-lg font-semibold text-[var(--color-accent)]">
                词
              </span>
            </div>
            <div>
              <p className="section-title text-xl font-semibold">Vocab Observatory</p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                Obsidian 主库 / Web 复习前台
              </p>
            </div>
          </Link>
        </div>

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[rgba(255,255,255,0.5)] hover:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {hasSupabasePublicEnv() ? (
            <HeaderAuthStatus />
          ) : (
            <Link
              href="/auth/login"
              className="rounded-full border border-[rgba(15,111,98,0.2)] bg-[rgba(15,111,98,0.08)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
            >
              配置 Supabase
            </Link>
          )}
        </div>
      </div>

      {!env.ownerEmail ? (
        <div className="border-t border-[var(--color-border)] bg-[rgba(178,87,47,0.08)] px-4 py-2 text-center text-xs text-[var(--color-accent-2)]">
          尚未配置 `OWNER_EMAIL`，登录与受保护页面会保持不可用。
        </div>
      ) : null}
    </header>
  );
}
