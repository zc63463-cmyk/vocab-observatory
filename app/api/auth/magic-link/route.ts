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
  const origin = env.siteUrl ?? request.nextUrl.origin;
  const redirectTo = new URL("/auth/callback", origin);
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
