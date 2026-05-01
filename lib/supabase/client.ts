"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { requireSupabasePublicEnv } from "@/lib/env";

// Use the default PKCE flow from @supabase/ssr. The previous "implicit"
// override was inconsistent with AuthCallbackClient, which calls
// exchangeCodeForSession(code) on the ?code=... URL Supabase actually
// returns — that path requires a code_verifier and only PKCE produces
// one. With PKCE, @supabase/ssr stores the verifier in cookies that both
// the browser client (signInWithOtp) and the same browser client
// (exchangeCodeForSession on /auth/callback) can read; server components
// share the same cookie jar for session reads. Implicit flow stored
// nothing matching, which is why magic-link sign-in failed with
// "PKCE code verifier not found in storage".
export function createBrowserSupabaseClient() {
  const credentials = requireSupabasePublicEnv();
  return createBrowserClient<Database>(credentials.url, credentials.key);
}
