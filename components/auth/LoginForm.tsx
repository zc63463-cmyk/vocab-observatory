"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm({
  initialError,
  next,
}: {
  initialError?: string;
  next?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const target = String(formData.get("next") ?? "/dashboard");

    startTransition(async () => {
      setError("");
      setSuccess("");

      try {
        const supabase = createBrowserSupabaseClient();
        const origin = window.location.origin;
        const redirectTo = new URL("/auth/callback", origin);
        redirectTo.searchParams.set("next", target);

        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo.toString(),
          },
        });

        if (signInError) {
          throw new Error(signInError.message);
        }

        setSuccess(`登录链接已发送到 ${email}。`);
        router.refresh();
      } catch (submissionError) {
        setError(
          submissionError instanceof Error ? submissionError.message : "发送失败",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel-strong rounded-[2rem] p-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Owner Access
        </p>
        <h1 className="section-title text-4xl font-semibold">通过 Magic Link 登录</h1>
        <p className="max-w-xl text-sm leading-7 text-[var(--color-ink-soft)]">
          访客可以公开浏览词条；复习、笔记与导入同步只对 owner 开放。
        </p>
      </div>

      <input type="hidden" name="next" value={next ?? "/dashboard"} />

      <label className="mt-8 block">
        <span className="mb-2 block text-sm font-semibold">邮箱</span>
        <input
          required
          type="email"
          name="email"
          placeholder="owner@example.com"
          className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "发送中..." : "发送登录链接"}
      </button>

      {error ? (
        <p className="mt-4 rounded-2xl bg-[rgba(178,87,47,0.1)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-2xl bg-[rgba(15,111,98,0.1)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {success}
        </p>
      ) : null}
    </form>
  );
}
