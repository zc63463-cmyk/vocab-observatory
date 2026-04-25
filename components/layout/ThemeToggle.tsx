"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && ["light", "dark", "system"].includes(stored)) {
      setTheme(stored);
      applyTheme(stored);
    } else {
      applyTheme("system");
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      if (theme === "system") {
        applyTheme("system");
      }
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, mounted]);

  function cycleTheme() {
    const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
    const newTheme = next[theme];
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  }

  if (!mounted) {
    return (
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
        aria-label="Toggle theme"
      >
        <Sun className="h-4 w-4 opacity-50" />
      </button>
    );
  }

  const label = theme === "light" ? "浅色模式" : theme === "dark" ? "暗色模式" : "跟随系统";

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
      aria-label={label}
      title={label}
    >
      {theme === "light" ? (
        <Sun className="h-4 w-4 text-[var(--color-accent-2)]" />
      ) : theme === "dark" ? (
        <Moon className="h-4 w-4 text-[var(--color-accent)]" />
      ) : (
        <div className="relative h-4 w-4">
          <Sun className="absolute h-4 w-4 rotate-0 scale-100 text-[var(--color-accent-2)] transition-all dark:rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 text-[var(--color-accent)] transition-all dark:rotate-0 dark:scale-100" />
        </div>
      )}
    </button>
  );
}
