"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
        // Delegate to /api/auth/magic-link so the PKCE code_verifier is
        // written via Set-Cookie response headers rather than via
        // document.cookie from a client-side supabase singleton. The
        // server-side flow is the pattern @supabase/ssr documents and
        // is the only one that survives the email round-trip reliably
        // (browser-side document.cookie writes were vanishing between
        // form submit and /auth/callback in some browsers, leaving
        // exchangeCodeForSession with no verifier to redeem).
        const response = await fetch("/api/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, next: target }),
        });

        const data = (await response.json()) as {
          error?: string;
          success?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "发送失败");
        }

        setSuccess(data.success ?? `登录链接已发送到 ${email}。`);
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
        <Input
          required
          type="email"
          name="email"
          placeholder="owner@example.com"
        />
      </label>

      <Button
        type="submit"
        disabled={pending}
        fullWidth
      >
        {pending ? "发送中..." : "发送登录链接"}
      </Button>

      {error ? (
        <p className="mt-4 rounded-2xl bg-[var(--color-surface-muted-warm)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-2xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {success}
        </p>
      ) : null}
    </form>
  );
}
