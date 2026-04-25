"use client";

import Link from "next/link";
import type { Route } from "next";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface MobileNavProps {
  items: Array<{ href: Route; label: string }>;
}

export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  // lock body scroll when open
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

  // close on route change (link click)
  function handleLinkClick() {
    close();
  }

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
        aria-label={open ? "关闭菜单" : "打开菜单"}
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={close}
          aria-hidden="true"
        />
      ) : null}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 z-50 h-full w-72 transform border-l border-[var(--color-border)] bg-[var(--color-panel-strong)] backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="导航菜单"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <p className="section-title text-lg font-semibold">导航</p>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] transition hover:bg-[var(--color-surface-glass-hover)]"
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleLinkClick}
              className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
