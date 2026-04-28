/**
 * Shared utility functions for the Omni-Search palette.
 * Exported so that tests can import the real production implementations
 * instead of re-declaring local copies.
 */

/** Encode a slug for safe use in URL path segments; returns "" for falsy input. */
export function safeSlug(slug: string | undefined | null): string {
  if (!slug) return "";
  return encodeURIComponent(slug);
}

/** Check whether an href points to an internal app route (starts with "/" but not "//"). */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Guard used by useOmniSearch to prevent stale async tasks from
 * overwriting state that belongs to a newer request.
 *
 * Returns true only when `controller` is still the current one
 * referenced by `abortRef` AND has not been aborted.
 */
export function shouldUpdateFromController(
  controller: { signal: { aborted: boolean } },
  abortRef: { current: object | null },
): boolean {
  return !controller.signal.aborted && abortRef.current === controller;
}
