import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/types/database.types";
import { hasSupabasePublicEnv, requireSupabasePublicEnv } from "@/lib/env";

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
