"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { requireSupabasePublicEnv } from "@/lib/env";

export function createBrowserSupabaseClient() {
  const credentials = requireSupabasePublicEnv();
  return createBrowserClient<Database>(credentials.url, credentials.key, {
    auth: {
      flowType: "implicit",
    },
  });
}
