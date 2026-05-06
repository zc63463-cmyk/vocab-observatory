import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugifyLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function stripMarkdown(value: string) {
  return value
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function excerpt(value: string, length = 160) {
  const text = stripMarkdown(value);
  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length).trim()}...`;
}

// Pin display TZ so SSR (Vercel runs in UTC) and CSR (user's local TZ) emit
// byte-identical strings. Without this, any client component that SSRs a
// formatted date — e.g. PlazaSearchShell rendering note.updated_at — produces
// a different `2025-01-01` vs `2025-01-02` between server and client whenever
// the source timestamp straddles UTC midnight, triggering React #418
// (hydration text-mismatch). The app's content/audience is zh-CN, so we lock
// to Asia/Shanghai. If this ever needs to vary per user, switch to a
// post-mount client-only render path instead of relaxing this constant.
const DISPLAY_TIME_ZONE = "Asia/Shanghai";

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "未记录";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "未记录";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

/**
 * Returns the UTC ISO timestamp for "today at 00:00 in Asia/Shanghai".
 *
 * Previous implementation (`new Date(); setHours(0,0,0,0); toISOString()`)
 * resolved "today" in the runtime's local TZ — UTC on Vercel SSR, the user's
 * local TZ on CSR. Consumers (`@/lib/review/session.ts` session-day cutoff,
 * `@/lib/dashboard.ts:516,773` dashboard "today" filters) then saw a
 * different window between server and client, which in the worst case meant
 * an 8-hour gap where the server would surface "yesterday's" data to a
 * Shanghai user.
 *
 * Fix: read the calendar date in `Asia/Shanghai` via Intl, then reconstruct
 * the UTC instant using the explicit `+08:00` offset. Anchors every consumer
 * to the audience's civil day regardless of where the process runs.
 */
export function startOfTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  // Fall back to the old behavior if Intl somehow fails to deliver parts —
  // better to return *something* valid than crash a server route.
  if (!year || !month || !day) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  return new Date(`${year}-${month}-${day}T00:00:00+08:00`).toISOString();
}

export function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export function chunkArray<T>(items: T[], chunkSize: number) {
  // Guard against non-positive, NaN, or Infinity chunk sizes. Without this
  // the for-loop below never advances (0 / negative / NaN) and spins the
  // event loop forever — a latent hang that's easy to introduce when the
  // size is derived from user input or a config value. Infinity would
  // instead build a single chunk of everything, but falling back to the
  // same "empty chunks" answer keeps the contract predictable.
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function escapePostgrestLike(value: string) {
  return value.replace(/[%_,]/g, "");
}
