"use client";

import type { Route } from "next";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function sanitizeNext(value: string | null, pathname: string) {
  if (value && value.startsWith("/")) {
    return value;
  }

  if (pathname !== "/" && pathname !== "/auth/callback") {
    return pathname;
  }

  return "/dashboard";
}

export function GlobalAuthCodeHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (!code && !tokenHash && !error) {
      return;
    }

    let active = true;

    const run = async () => {
      if (error) {
        router.replace(
          `/auth/login?error=${encodeURIComponent(errorDescription ?? error)}`,
        );
        return;
      }

      try {
        const supabase = createBrowserSupabaseClient();

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "magiclink" | "recovery" | "invite" | "email_change",
          });
          if (verifyError) {
            throw verifyError;
          }
        }

        if (!active) {
          return;
        }

        const target = sanitizeNext(searchParams.get("next"), pathname);
        router.replace(target as Route);
        router.refresh();
      } catch (authError) {
        if (!active) {
          return;
        }

        const message =
          authError instanceof Error ? authError.message : "登录失败";
        router.replace(`/auth/login?error=${encodeURIComponent(message)}`);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [pathname, router, searchParams]);

  return null;
}
