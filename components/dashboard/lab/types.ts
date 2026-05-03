import type { getDashboardSummary } from "@/lib/dashboard";

/**
 * Type alias for the full dashboard summary returned by `getDashboardSummary()`.
 *
 * Bodies receive this slice (or the whole thing) and pick what they need.
 * `import type` keeps the server-only `lib/dashboard.ts` module out of the
 * client bundle — this is purely a TypeScript-level alias.
 */
export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
