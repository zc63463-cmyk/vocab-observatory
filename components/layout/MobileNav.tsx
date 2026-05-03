"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  BookOpen,
  LayoutGrid,
  Menu,
  Notebook,
  Repeat,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/* ── Icon mapping ── */
const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/words": BookOpen,
  "/plaza": LayoutGrid,
  "/review": Repeat,
  "/dashboard": Notebook,
  "/notes": Notebook,
};

interface MobileNavProps {
  items: Array<{ href: Route; label: string }>;
}

export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  /* ── Portal target only available client-side. Reuses the same
        useSyncExternalStore helpers defined below for MobileThemeToggle. ── */
  const portalReady = useSyncExternalStore(
    subscribeToMount,
    getClientMounted,
    getServerMounted,
  );

  const close = useCallback(() => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    setClosing(true);
    // Wait for animation to finish before unmounting
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimeoutRef.current = null;
    }, 280);
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
    } else {
      setOpen(true);
    }
  }, [open, close]);

  /* ── Escape key ── */
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  /* ── Lock body scroll ── */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* ── Close on route change ── */
  useEffect(() => {
    if (!open) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    const routeChangeTimer = window.setTimeout(() => {
      close();
    }, 0);

    return () => {
      window.clearTimeout(routeChangeTimer);
    };
  }, [close, open, pathname]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  /* ── Swipe-to-close gesture ── */
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = touchStartX.current;
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchCurrentX.current = e.touches[0].clientX;
  }

  function handleTouchEnd() {
    const delta = touchCurrentX.current - touchStartX.current;
    // Swipe right (positive delta) means closing the right drawer
    if (delta > 60) {
      close();
    }
  }

  /* ── Determine if a nav item is active ── */
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  /* ── Split nav items into groups ── */
  const publicItems = items.filter((item) =>
    ["/words", "/plaza"].includes(item.href),
  );
  const privateItems = items.filter((item) =>
    ["/review", "/dashboard", "/notes"].includes(item.href),
  );

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        type="button"
        onClick={toggle}
        data-testid="mobile-nav-toggle"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] transition-colors duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)] active:scale-[0.92]"
        aria-label={open ? "关闭菜单" : "打开菜单"}
        aria-expanded={open}
      >
        {open && !closing ? (
          <X className="h-[18px] w-[18px]" />
        ) : (
          <Menu className="h-[18px] w-[18px]" />
        )}
      </button>

      {/* Backdrop + Drawer rendered via portal to <body> so SiteHeader's
          backdrop-filter doesn't capture them in its containing block. */}
      {portalReady && open &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
                closing ? "opacity-0" : "opacity-100"
              }`}
              onClick={close}
              aria-hidden="true"
            />

            {/* Drawer */}
            <div
              ref={drawerRef}
              className={`fixed right-0 top-0 z-50 flex h-full w-[280px] flex-col border-l border-[var(--color-border)] bg-[var(--color-panel-strong)] backdrop-blur-xl shadow-2xl transition-transform duration-[280ms] ${
                closing
                  ? "translate-x-full ease-[cubic-bezier(0.4,0,0.2,1)]"
                  : "translate-x-0 ease-[cubic-bezier(0.16,1,0.3,1)]"
              }`}
              role="dialog"
              aria-modal="true"
              aria-label="导航菜单"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <p className="section-title text-base font-semibold">Vocab Observatory</p>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-glass-hover)] active:scale-[0.92]"
              aria-label="关闭菜单"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {/* Public section */}
            <div className="mb-1">
              <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                浏览
              </p>
              {publicItems.map((item) => {
                const Icon = NAV_ICONS[item.href];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                      active
                        ? "bg-[var(--color-surface-muted)] text-[var(--color-accent)]"
                        : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {Icon ? (
                      <Icon
                        className={`h-[18px] w-[18px] flex-shrink-0 transition-colors duration-150 ${
                          active
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-ink-soft)] group-hover:text-[var(--color-ink)]"
                        }`}
                      />
                    ) : null}
                    {item.label}
                    {active ? (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                    ) : null}
                  </Link>
                );
              })}
            </div>

            {/* Divider */}
            <div className="my-2 h-px bg-[var(--color-border)]" />

            {/* Private section */}
            <div className="mb-1">
              <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                学习
              </p>
              {privateItems.map((item) => {
                const Icon = NAV_ICONS[item.href];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                      active
                        ? "bg-[var(--color-surface-muted)] text-[var(--color-accent)]"
                        : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {Icon ? (
                      <Icon
                        className={`h-[18px] w-[18px] flex-shrink-0 transition-colors duration-150 ${
                          active
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-ink-soft)] group-hover:text-[var(--color-ink)]"
                        }`}
                      />
                    ) : null}
                    {item.label}
                    {active ? (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Footer with ThemeToggle */}
          <div className="border-t border-[var(--color-border)] px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-ink-soft)]">外观模式</span>
              <MobileThemeToggle />
            </div>
          </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

/* ── Inline theme toggle for drawer ── */
type Theme = "light" | "dark" | "system";
const THEMES: Theme[] = ["light", "dark", "system"];

function subscribeToMount() {
  return () => {};
}

function getClientMounted() {
  return true;
}

function getServerMounted() {
  return false;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = localStorage.getItem("theme");
  return THEMES.includes(stored as Theme) ? (stored as Theme) : "system";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

function MobileThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const mounted = useSyncExternalStore(
    subscribeToMount,
    getClientMounted,
    getServerMounted,
  );

  function cycleTheme() {
    const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
    const newTheme = next[theme];
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  }

  if (!mounted) return null;

  const labels: Record<Theme, string> = {
    light: "浅色",
    dark: "暗色",
    system: "跟随系统",
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)] active:scale-[0.95]"
    >
      {labels[theme]}
    </button>
  );
}
