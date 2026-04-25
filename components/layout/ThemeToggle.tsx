"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { springs } from "@/components/motion";

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

  // Pick the icon key for AnimatePresence
  const iconKey = theme === "system"
    ? `system-${getSystemTheme()}`
    : theme;

  return (
    <motion.button
      type="button"
      onClick={cycleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)]"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.85, rotate: 15 }}
      transition={{ type: "spring", ...springs.bouncy }}
    >
      <div className="relative h-4 w-4">
        <AnimatePresence mode="wait" initial={false}>
          {theme === "light" ? (
            <motion.div
              key="sun"
              initial={{ rotate: -90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0, opacity: 0 }}
              transition={{ type: "spring", ...springs.snappy }}
              className="absolute inset-0"
            >
              <Sun className="h-4 w-4 text-[var(--color-accent-2)]" />
            </motion.div>
          ) : theme === "dark" ? (
            <motion.div
              key="moon"
              initial={{ rotate: -90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0, opacity: 0 }}
              transition={{ type: "spring", ...springs.snappy }}
              className="absolute inset-0"
            >
              <Moon className="h-4 w-4 text-[var(--color-accent)]" />
            </motion.div>
          ) : (
            <motion.div
              key={iconKey}
              initial={{ rotate: -90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0, opacity: 0 }}
              transition={{ type: "spring", ...springs.snappy }}
              className="absolute inset-0"
            >
              {getSystemTheme() === "dark" ? (
                <Moon className="h-4 w-4 text-[var(--color-accent)]" />
              ) : (
                <Sun className="h-4 w-4 text-[var(--color-accent-2)]" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}
