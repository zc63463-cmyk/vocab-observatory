/**
 * Tiny formatting helpers shared across the lab dashboard.
 * Keep each pure & dependency-free so bodies stay leaf components.
 *
 * Defensive coercion: every helper falls back to an em-dash placeholder
 * for non-finite inputs (`NaN`, `±Infinity`). Without the guard a single
 * upstream divide-by-zero would surface as `"NaN%"` / `"NaNpp"` in the
 * UI; the placeholder is preferable both for users (legible "no data"
 * cue) and for downstream code (string is still a stable type).
 */

const PLACEHOLDER = "—";

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPoints(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}pp`;
}

/**
 * Map a daily review-load count to a discrete severity colour. Mirrors
 * the legend used in the legacy forecast calendar so users carrying a
 * mental model from the old dashboard see the same buckets.
 */
export function getLoadColor(count: number): string {
  if (count <= 5) return "#0f766e"; // 轻
  if (count <= 15) return "#3b82f6"; // 中
  if (count <= 30) return "#f59e0b"; // 较高
  return "#ef4444"; // 重
}

export function getLoadLabel(count: number): string {
  if (count <= 5) return "轻";
  if (count <= 15) return "中";
  if (count <= 30) return "较高";
  return "重";
}
