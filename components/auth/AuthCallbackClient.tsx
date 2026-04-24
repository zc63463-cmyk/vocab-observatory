"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function sanitizeNext(value?: string) {
  if (!value || !value.startsWith("/")) {
    return "/dashboard";
  }

  return value;
}

export function AuthCallbackClient({
  code,
  error,
  errorDescription,
  next,
}: {
  code?: string;
  error?: string;
  errorDescription?: string;
  next?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("正在验证登录状态...");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const supabase = createBrowserSupabaseClient();

      if (error) {
        const redirectError = errorDescription ?? error;
        router.replace(`/auth/login?error=${encodeURIComponent(redirectError)}`);
        return;
      }

      try {
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session) {
            throw new Error("未检测到有效登录会话。");
          }
        }

        const target = sanitizeNext(next);
        router.replace(target as Route);
        router.refresh();
      } catch (callbackError) {
        if (!active) {
          return;
        }

        const messageText =
          callbackError instanceof Error ? callbackError.message : "登录失败";
        setMessage(messageText);
        router.replace(`/auth/login?error=${encodeURIComponent(messageText)}`);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [code, error, errorDescription, next, router]);

  return (
    <div className="panel-strong rounded-[2rem] p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
        Auth Callback
      </p>
      <h1 className="section-title mt-3 text-4xl font-semibold">正在完成登录</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">{message}</p>
    </div>
  );
}
