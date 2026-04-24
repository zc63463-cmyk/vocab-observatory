import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { hasSupabaseAdminEnv, requireSupabaseAdminEnv } from "@/lib/env";

export function createAdminSupabaseClient() {
  const credentials = requireSupabaseAdminEnv();

  return createClient<Database>(credentials.url, credentials.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getAdminSupabaseClientOrNull() {
  if (!hasSupabaseAdminEnv()) {
    return null;
  }

  return createAdminSupabaseClient();
}
