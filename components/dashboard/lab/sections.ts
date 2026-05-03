/**
 * Dashboard Lab — Section & Pattern Registry
 *
 * Single source of truth for:
 *   - what sections exist on the lab dashboard
 *   - which gesture pattern unlocks each section
 *   - reverse map (section → pattern) used by PatternLegend
 *
 * Pattern key encoding:
 *   The 3×3 dot grid is numbered 1..9 left-to-right, top-to-bottom:
 *     1 2 3
 *     4 5 6
 *     7 8 9
 *   A pattern is the *canonical* (auto-include-aware) sequence of dots
 *   joined by "-". e.g. dragging from dot 1 to 9 implicitly passes through
 *   5, so the canonical key is "1-5-9", NOT "1-9".
 *
 *   This matches Android's screen-unlock convention. The runtime gesture
 *   recogniser in PasswordPatternLock applies the same auto-include rule
 *   when normalising user input before lookup.
 */

export type SectionId =
  | "today-snapshot"
  | "review-load"
  | "rating-mix"
  | "review-7d"
  | "review-30d"
  | "retention-gap"
  | "plan-vs-actual"
  | "preset-forecast"
  | "recent-reviews"
  | "recent-notes"
  | "forecast-calendar"
  | "mastery-network"
  | "fsrs-training"
  | "import-run";

export interface PatternDef {
  /** Canonical (auto-include-expanded) dot sequence joined by "-". */
  key: string;
  /** Single-glyph visual hint shown in the legend. */
  glyph: string;
  /** Short Chinese name for the pattern shape. */
  name: string;
  /** Plain-language description of how to draw it. */
  description: string;
  /** Which section this pattern unlocks. */
  sectionId: SectionId;
}

/**
 * Pattern catalogue.
 *
 * Tier hierarchy:
 *   - 4 L-rotations (corner-anchored, 5 dots) — most decision-driving sections
 *   - 2 diagonals (3 dots) — strategic overview
 *   - 6 lines (3 dots, edge or middle) — quick-glance secondaries
 *
 * Adding more patterns later is trivial: pick an unused canonical key and
 * append. Recommended candidates for future expansion: Z (1-2-3-5-7-8-9),
 * U (1-4-7-8-9-6-3), N (7-4-1-5-3-6-9), arrow (5-1, 5-3, 5-7, 5-9), etc.
 */
export const PATTERNS: readonly PatternDef[] = [
  // ── Tier 1: 4 L-rotations (5 dots each, corner-anchored) ────────────────
  {
    key: "1-4-7-8-9",
    glyph: "┗",
    name: "正 L",
    description: "左上 → 左下 → 右下",
    sectionId: "review-load",
  },
  {
    key: "1-2-3-6-9",
    glyph: "┓",
    name: "顺 L",
    description: "左上 → 右上 → 右下",
    sectionId: "plan-vs-actual",
  },
  {
    key: "7-4-1-2-3",
    glyph: "┏",
    name: "上 L",
    description: "左下 → 左上 → 右上",
    sectionId: "preset-forecast",
  },
  {
    key: "3-6-9-8-7",
    glyph: "┛",
    name: "反 L",
    description: "右上 → 右下 → 左下",
    sectionId: "retention-gap",
  },

  // ── Tier 2: 2 diagonals ─────────────────────────────────────────────────
  {
    key: "1-5-9",
    glyph: "╲",
    name: "正对角",
    description: "左上 → 中 → 右下",
    sectionId: "today-snapshot",
  },
  {
    key: "3-5-7",
    glyph: "╱",
    name: "反对角",
    description: "右上 → 中 → 左下",
    sectionId: "rating-mix",
  },

  // ── Tier 3: 6 lines (rows + columns) ────────────────────────────────────
  {
    key: "1-2-3",
    glyph: "─",
    name: "顶横",
    description: "顶部一条横线",
    sectionId: "review-7d",
  },
  {
    key: "7-8-9",
    glyph: "─",
    name: "底横",
    description: "底部一条横线",
    sectionId: "review-30d",
  },
  {
    key: "1-4-7",
    glyph: "│",
    name: "左竖",
    description: "左边一条竖线",
    sectionId: "recent-reviews",
  },
  {
    key: "3-6-9",
    glyph: "│",
    name: "右竖",
    description: "右边一条竖线",
    sectionId: "recent-notes",
  },
  {
    key: "2-5-8",
    glyph: "│",
    name: "中竖",
    description: "中间一条竖线",
    sectionId: "fsrs-training",
  },
  {
    key: "4-5-6",
    glyph: "─",
    name: "中横",
    description: "中间一条横线",
    sectionId: "import-run",
  },
];

export interface SectionMeta {
  id: SectionId;
  /** Chinese title shown in modal header & legend. */
  title: string;
  /** Lowercase eyebrow shown above the title in the modal (editorial flavour). */
  eyebrow: string;
  /** One-line description shown under the title. */
  subtitle: string;
}

/**
 * Static metadata for each section. Body components are wired in
 * `bodyRegistry.tsx` (separate file so sections.ts stays as a pure data
 * module that can be imported by both server and client code without
 * pulling in React).
 */
export const SECTION_META: Record<SectionId, SectionMeta> = {
  "today-snapshot": {
    id: "today-snapshot",
    title: "今日快照",
    eyebrow: "Today · Snapshot",
    subtitle: "今天的核心指标一览",
  },
  "review-load": {
    id: "review-load",
    title: "复习负载与校准",
    eyebrow: "Review Load · Calibration",
    subtitle: "目标 retention、活跃队列、FSRS 偏差",
  },
  "rating-mix": {
    id: "rating-mix",
    title: "评分分布",
    eyebrow: "Rating Mix",
    subtitle: "Again / Hard / Good / Easy 占比",
  },
  "review-7d": {
    id: "review-7d",
    title: "7 日复习量",
    eyebrow: "7-day Volume",
    subtitle: "本周复习节奏与高低",
  },
  "review-30d": {
    id: "review-30d",
    title: "30 日深入",
    eyebrow: "30-day Deep Dive",
    subtitle: "更长尺度的复习量与最弱语义场",
  },
  "retention-gap": {
    id: "retention-gap",
    title: "Retention Gap 趋势",
    eyebrow: "Retention Gap · 14d",
    subtitle: "观测遗忘率 vs 容忍遗忘率的偏差",
  },
  "plan-vs-actual": {
    id: "plan-vs-actual",
    title: "计划 vs 实际",
    eyebrow: "Plan vs Actual · 14d",
    subtitle: "每日预计到期量与实际完成量并排",
  },
  "preset-forecast": {
    id: "preset-forecast",
    title: "预设负载对比",
    eyebrow: "Preset Forecast",
    subtitle: "Sprint / Balanced / Conservative 负载差异",
  },
  "recent-reviews": {
    id: "recent-reviews",
    title: "近期复习",
    eyebrow: "Recent Reviews",
    subtitle: "最近的复习日志",
  },
  "recent-notes": {
    id: "recent-notes",
    title: "近期笔记",
    eyebrow: "Recent Notes",
    subtitle: "最近编辑过的词条笔记",
  },
  "forecast-calendar": {
    id: "forecast-calendar",
    title: "复习预测日历",
    eyebrow: "Forecast Calendar · 14d",
    subtitle: "未来两周每日到期量与负载等级",
  },
  "mastery-network": {
    id: "mastery-network",
    title: "词汇网络图",
    eyebrow: "Mastery Network",
    subtitle: "记忆概率分布 + 近义反义词根关联",
  },
  "fsrs-training": {
    id: "fsrs-training",
    title: "FSRS 训练",
    eyebrow: "FSRS Training",
    subtitle: "个性化权重训练与状态",
  },
  "import-run": {
    id: "import-run",
    title: "最近 Import 运行",
    eyebrow: "Latest Import",
    subtitle: "Vault 同步管线的最新运行结果",
  },
};

/**
 * Reverse lookup: pattern key → section id.
 * Built once at module load.
 */
export const PATTERN_KEY_TO_SECTION: Map<string, SectionId> = new Map(
  PATTERNS.map((p) => [p.key, p.sectionId]),
);

/**
 * Reverse lookup: section id → pattern (if any).
 * Featured-only sections (not in PATTERNS) return undefined.
 */
export const SECTION_TO_PATTERN: Map<SectionId, PatternDef> = new Map(
  PATTERNS.map((p) => [p.sectionId, p]),
);
