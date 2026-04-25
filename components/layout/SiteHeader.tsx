import Link from "next/link";
import type { Route } from "next";
import { HeaderAuthStatus } from "@/components/layout/HeaderAuthStatus";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileNav } from "@/components/layout/MobileNav";
import { env, hasSupabasePublicEnv } from "@/lib/env";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/words", label: "词条库" },
  { href: "/plaza", label: "词汇广场" },
  { href: "/review", label: "复习" },
  { href: "/dashboard", label: "仪表盘" },
  { href: "/notes", label: "笔记" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-header-border-b)] bg-[var(--color-header-bg)] backdrop-blur-xl transition-colors duration-300">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <div className="soft-grid flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)]">
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
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {hasSupabasePublicEnv() ? (
            <HeaderAuthStatus />
          ) : (
            <Link
              href="/auth/login"
              className="hidden rounded-full border border-[rgba(15,111,98,0.2)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)] sm:inline-flex"
            >
              配置 Supabase
            </Link>
          )}
          <MobileNav items={navItems} />
        </div>
      </div>

      {!env.ownerEmail ? (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted-warm)] px-4 py-2 text-center text-xs text-[var(--color-accent-2)]">
          尚未配置 `OWNER_EMAIL`，登录与受保护页面会保持不可用。
        </div>
      ) : null}
    </header>
  );
}
