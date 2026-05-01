import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth";
import { env, hasSupabasePublicEnv } from "@/lib/env";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function POST(request: NextRequest) {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.json(
      { error: "请先配置 Supabase 环境变量。" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as { email?: string; next?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const nextPath =
    typeof body.next === "string" && body.next.startsWith("/")
      ? body.next
      : "/dashboard";

  if (!email) {
    return NextResponse.json({ error: "请输入邮箱。" }, { status: 400 });
  }

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

  const response = NextResponse.json({ success: `登录链接已发送到 ${email}。` });
  const supabase = createRouteHandlerSupabaseClient(request, response);

  // Always use the request's own origin so the email link comes back to
  // the exact host the form was submitted from. Using env.siteUrl here
  // would break Vercel preview deploys where the preview domain doesn't
  // match the configured prod URL — the verifier cookie would be set on
  // one host but the callback would land on another, killing PKCE.
  const redirectTo = new URL("/auth/callback", request.nextUrl.origin);
  redirectTo.searchParams.set("next", nextPath);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo.toString(),
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return response;
}
