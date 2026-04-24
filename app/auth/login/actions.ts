"use server";

import { headers } from "next/headers";
import { env, hasSupabasePublicEnv } from "@/lib/env";
import { isOwnerEmail } from "@/lib/auth";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";

export async function requestMagicLinkAction(
  _previousState: { error: string; success: string },
  formData: FormData,
) {
  if (!hasSupabasePublicEnv()) {
    return {
      error: "请先配置 Supabase 环境变量。",
      success: "",
    };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email) {
    return {
      error: "请输入邮箱。",
      success: "",
    };
  }

  if (!isOwnerEmail(email)) {
    return {
      error: env.ownerEmail
        ? "当前只允许 owner 邮箱登录。"
        : "请先配置 OWNER_EMAIL。",
      success: "",
    };
  }

  const supabase = await getServerSupabaseClientOrNull();
  if (!supabase) {
    return {
      error: "Supabase 客户端初始化失败。",
      success: "",
    };
  }

  const headersList = await headers();
  const forwardedProto = headersList.get("x-forwarded-proto");
  const forwardedHost = headersList.get("x-forwarded-host");
  const forwardedOrigin =
    forwardedProto && forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : undefined;
  const origin =
    env.siteUrl ?? headersList.get("origin") ?? forwardedOrigin ?? "http://localhost:3000";

  const redirectTo = new URL("/auth/callback", origin);
  redirectTo.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo.toString(),
    },
  });

  if (error) {
    return {
      error: error.message,
      success: "",
    };
  }

  return {
    error: "",
    success: `登录链接已发送到 ${email}。`,
  };
}
