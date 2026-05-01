import { NextResponse, type NextRequest } from "next/server";
import { hasSupabasePublicEnv } from "@/lib/env";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

function sanitizeNext(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/dashboard";
  }
  return value;
}

// Server-side auth callback. The previous design used a Client Component
// (AuthCallbackClient) that called supabase.auth.exchangeCodeForSession
// from the browser, which depended on the PKCE code_verifier cookie
// surviving the gmail → supabase.co → vercel.app redirect chain in the
// browser's document.cookie. That round-trip was failing in practice
// (probably due to SameSite/cookie-store quirks across the email link
// click), leaving the verifier missing and producing the "PKCE code
// verifier not found in storage" error. Doing the exchange here means
// the server reads the verifier directly from request.cookies (Set-Cookie
// from /api/auth/magic-link) and writes the resulting session via
// response.cookies — both reliable HTTP-level operations.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const supabaseError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const next = sanitizeNext(searchParams.get("next"));

  const loginUrl = new URL("/auth/login", origin);

  if (supabaseError) {
    loginUrl.searchParams.set("error", errorDescription ?? supabaseError);
    return NextResponse.redirect(loginUrl);
  }

  if (!hasSupabasePublicEnv()) {
    loginUrl.searchParams.set("error", "Supabase 未配置。");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set("error", "缺少授权码。");
    return NextResponse.redirect(loginUrl);
  }

  // Pre-create the success response so the supabase client can attach
  // the new session cookies to it via response.cookies.set inside the
  // route-handler client adapter.
  const successResponse = NextResponse.redirect(new URL(next, origin));
  const supabase = createRouteHandlerSupabaseClient(request, successResponse);

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    loginUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  return successResponse;
}
