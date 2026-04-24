import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { requireSupabasePublicEnv } from "@/lib/env";

export function createRouteHandlerSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  const credentials = requireSupabasePublicEnv();
  let cookieCache = request.cookies.getAll();

  return createServerClient<Database>(credentials.url, credentials.key, {
    cookies: {
      getAll() {
        return cookieCache;
      },
      setAll(cookiesToSet) {
        const nextCookies = new Map(cookieCache.map((cookie) => [cookie.name, cookie]));
        cookiesToSet.forEach(({ name, value }) => {
          nextCookies.set(name, { name, value });
        });
        cookieCache = [...nextCookies.values()];

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
