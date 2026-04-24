import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { hasSupabasePublicEnv, requireSupabasePublicEnv } from "@/lib/env";

export async function createServerSupabaseClient() {
  const credentials = requireSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(credentials.url, credentials.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components may call this in a read-only context.
        }
      },
    },
  });
}

export async function getServerSupabaseClientOrNull() {
  if (!hasSupabasePublicEnv()) {
    return null;
  }

  return createServerSupabaseClient();
}
