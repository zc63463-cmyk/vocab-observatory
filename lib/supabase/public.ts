import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/types/database.types";
import { hasSupabasePublicEnv, requireSupabasePublicEnv } from "@/lib/env";

const TRANSIENT_PUBLIC_READ_MAX_ATTEMPTS = 2;
const TRANSIENT_PUBLIC_READ_RETRY_DELAY_MS = 250;

const getCachedPublicSupabaseClient = cache(() => {
  const credentials = requireSupabasePublicEnv();

  return createClient<Database>(credentials.url, credentials.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
});

export function getPublicSupabaseClientOrNull() {
  if (!hasSupabasePublicEnv()) {
    return null;
  }

  return getCachedPublicSupabaseClient();
}

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    const causeText =
      typeof error.cause === "string"
        ? error.cause
        : error.cause instanceof Error
          ? `${error.cause.name} ${error.cause.message}`
          : "";
    return `${error.name} ${error.message} ${causeText}`.toLowerCase();
  }

  if (typeof error === "object" && error !== null) {
    const message = "message" in error ? String(error.message ?? "") : "";
    const details = "details" in error ? String(error.details ?? "") : "";
    const code = "code" in error ? String(error.code ?? "") : "";
    return `${message} ${details} ${code}`.toLowerCase();
  }

  return String(error ?? "").toLowerCase();
}

function isTransientPublicReadError(error: unknown) {
  const text = getErrorText(error);
  return (
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("socket hang up") ||
    text.includes("fetch failed") ||
    text.includes("network error") ||
    text.includes("typeerror: terminated") ||
    text.includes("terminated")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientPublicReadRetry<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  let attempt = 1;

  while (attempt <= TRANSIENT_PUBLIC_READ_MAX_ATTEMPTS) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= TRANSIENT_PUBLIC_READ_MAX_ATTEMPTS ||
        !isTransientPublicReadError(error)
      ) {
        throw error;
      }

      const nextAttempt = attempt + 1;
      console.warn(
        `[public] Transient read failure for ${label}; retrying (${nextAttempt}/${TRANSIENT_PUBLIC_READ_MAX_ATTEMPTS}).`,
        error,
      );
      await sleep(TRANSIENT_PUBLIC_READ_RETRY_DELAY_MS * attempt);
      attempt = nextAttempt;
    }
  }

  throw new Error(`Unreachable retry state for ${label}.`);
}
