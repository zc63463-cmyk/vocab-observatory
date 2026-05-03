import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth";
import { env, hasSupabasePublicEnv } from "@/lib/env";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { validateOtpInput } from "@/lib/auth/verify-otp-validation";

// OTP code verification — companion route to /api/auth/magic-link.
//
// The magic-link route triggers Supabase's email; the email contains BOTH a
// PKCE link (handled by /auth/callback) AND a 6-digit token (handled here).
// On mobile, where Gmail's in-app browser kills the PKCE verifier cookie
// because it's not the same browser the form was submitted from, users can
// type the 6-digit token into the original page and we'll mint the session
// here — entirely on the original browser, no cross-browser cookie state.
//
// Security:
//   - Owner-email gate (mirrors magic-link route). Even with a valid token
//     for a non-owner email, we refuse before calling Supabase to keep the
//     auth surface narrow.
//   - Token shape is validated cheaply before hitting the network.
//   - Supabase enforces token expiry (default 60 minutes) and single-use
//     semantics; we don't try to re-implement those guarantees.
export async function POST(request: NextRequest) {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.json(
      { error: "请先配置 Supabase 环境变量。" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    token?: string;
  };

  const validation = validateOtpInput({ email: body.email, token: body.token });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { email, token } = validation.value;

  if (!isOwnerEmail(email)) {
    return NextResponse.json(
      {
        error: env.ownerEmail
          ? "当前只允许 owner 邮箱登录。"
          : "请先配置 OWNER_EMAIL。",
      },
      { status: 403 },
    );
  }

  // Pre-create the success response so the supabase client adapter can
  // write the session cookies to it via response.cookies.set. This mirrors
  // the pattern used in /auth/callback for PKCE — the route-handler client
  // captures every Set-Cookie call from supabase-js into our own response.
  const successResponse = NextResponse.json({ ok: true });
  const supabase = createRouteHandlerSupabaseClient(request, successResponse);

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    // Common cases: expired token, wrong code, already-consumed token.
    // We pass Supabase's message through; the LoginForm displays it as-is.
    return NextResponse.json(
      { error: error.message || "验证码无效或已过期。" },
      { status: 401 },
    );
  }

  return successResponse;
}
