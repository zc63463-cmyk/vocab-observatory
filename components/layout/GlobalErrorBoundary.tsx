"use client";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

/**
 * App-level error boundary wrapper.
 * Place this at the top of the component tree to catch all client-side render errors.
 * Each route segment gets its own boundary so a crash in one section doesn't take down the rest.
 */
export function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
