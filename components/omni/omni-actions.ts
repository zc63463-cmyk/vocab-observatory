import type { OmniItem } from "./types";

/* ─── Theme cycling (mirrors ThemeToggle.cycleTheme logic) ─── */

type Theme = "light" | "dark" | "system";
const THEMES: Theme[] = ["light", "dark", "system"];

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

function cycleTheme() {
  const stored = localStorage.getItem("theme");
  const current: Theme = THEMES.includes(stored as Theme)
    ? (stored as Theme)
    : "system";
  const next: Record<Theme, Theme> = {
    light: "dark",
    dark: "system",
    system: "light",
  };
  const newTheme = next[current];
  localStorage.setItem("theme", newTheme);
  applyTheme(newTheme);
}

/* ─── Static actions ─── */

export const omniActions: OmniItem[] = [
  {
    id: "action:go-home",
    type: "action",
    title: "回到仪表盘",
    href: "/",
    icon: "LayoutDashboard",
    keywords: ["dashboard", "home", "首页", "仪表盘"],
  },
  {
    id: "action:start-review",
    type: "action",
    title: "开始复习",
    href: "/review",
    icon: "Brain",
    keywords: ["review", "复习", "fsrs", "间隔重复"],
  },
  {
    id: "action:open-words",
    type: "action",
    title: "打开词条列表",
    href: "/words",
    icon: "BookOpen",
    keywords: ["words", "词条", "词汇", "列表"],
  },
  {
    id: "action:open-plaza",
    type: "action",
    title: "打开词汇广场",
    href: "/plaza",
    icon: "Grid3X3",
    keywords: ["plaza", "广场", "语义场", "集合"],
  },
  {
    id: "action:toggle-theme",
    type: "action",
    title: "切换深色模式",
    icon: "SunMoon",
    keywords: ["theme", "主题", "深色", "浅色", "dark", "light"],
    action: cycleTheme,
  },
];

/* ─── Scoring ─── */

export function scoreOmniItem(item: OmniItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const title = item.title.toLowerCase();
  const subtitle = item.subtitle?.toLowerCase() ?? "";
  const keywords = item.keywords?.join(" ").toLowerCase() ?? "";

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (keywords.includes(q)) return 40;
  if (subtitle.includes(q)) return 20;
  return 0;
}
