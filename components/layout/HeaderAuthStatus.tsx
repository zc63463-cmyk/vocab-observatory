"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/Badge";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AuthState = "checking" | "guest" | "owner";

export function HeaderAuthStatus() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    const syncUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setUser(currentUser);
      setAuthState(currentUser ? "owner" : "guest");
    };

    void syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      setUser(session?.user ?? null);
      setAuthState(session?.user ? "owner" : "guest");
      router.refresh();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      setUser(null);
      setAuthState("guest");
      router.replace("/");
      router.refresh();
    });
  }

  if (authState === "owner" && user) {
    return (
      <>
        <div className="hidden items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-2 sm:flex">
          <Badge>Owner active</Badge>
          <div className="text-right">
            <p className="text-sm font-semibold">{user.email}</p>
            <p className="text-xs text-[var(--color-ink-soft)]">Private study layer active</p>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={handleSignOut}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-glass-hover)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Signing out..." : "Sign out"}
        </button>
      </>
    );
  }

  return (
    <Link
      href="/auth/login"
      className="rounded-full border border-[rgba(15,111,98,0.2)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
    >
      {authState === "checking" ? "Owner" : "Owner login"}
    </Link>
  );
}
