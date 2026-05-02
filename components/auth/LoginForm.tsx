"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OTP_TOKEN_LENGTH } from "@/lib/auth/verify-otp-validation";

// Two-step login flow.
//
// Step 1 ("email"): user enters their email; we POST /api/auth/magic-link
//   which triggers Supabase to send the email containing BOTH a magic link
//   AND a 6-digit OTP token.
//
// Step 2 ("otp"): user types the 6-digit code from the email back into the
//   original browser; we POST /api/auth/verify-otp which mints the session
//   cookie on this same browser via Set-Cookie. This sidesteps the
//   "Gmail in-app browser kills the PKCE verifier cookie" failure mode
//   that breaks the link-only path on mobile devices.
//
// Desktop users with one browser can still use the magic link (handled by
// /auth/callback) — both paths land at /dashboard in the end.
type Step = "email" | "otp";

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({
  initialError,
  next,
}: {
  initialError?: string;
  next?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [info, setInfo] = useState("");
  const [pending, startTransition] = useTransition();
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const target = next ?? "/dashboard";

  // Tick the resend cooldown once a second. We only run the interval while
  // there's something to count down — no idle ticking when at zero.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  // Auto-focus the OTP input the moment we transition to step 2 so users
  // can type or paste the code without an extra tap on mobile.
  useEffect(() => {
    if (step === "otp") {
      otpInputRef.current?.focus();
    }
  }, [step]);

  function sendCode(targetEmail: string) {
    startTransition(async () => {
      setError("");
      setInfo("");

      try {
        const response = await fetch("/api/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: targetEmail, next: target }),
        });

        const data = (await response.json()) as {
          error?: string;
          success?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "发送失败");
        }

        setEmail(targetEmail);
        setStep("otp");
        setToken("");
        setInfo(`验证码已发送到 ${targetEmail}，60 分钟内有效。`);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error ? submissionError.message : "发送失败",
        );
      }
    });
  }

  function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    sendCode(submittedEmail);
  }

  function handleResend() {
    if (resendCooldown > 0 || !email) return;
    sendCode(email);
  }

  function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token.length !== OTP_TOKEN_LENGTH) return;

    startTransition(async () => {
      setError("");
      setInfo("");
      try {
        const response = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token }),
        });
        const data = (await response.json()) as { error?: string; ok?: boolean };
        if (!response.ok) {
          throw new Error(data.error ?? "验证失败");
        }
        setInfo("登录成功，正在跳转…");
        // Cast through Route because `target` is a runtime string (could be
        // any internal path) and Next 16 typed routes can't infer it. The
        // /api/auth/magic-link route only accepts paths starting with `/`,
        // so the cast doesn't widen the safety contract.
        router.replace(target as Route);
        router.refresh();
      } catch (verifyError) {
        setError(
          verifyError instanceof Error ? verifyError.message : "验证失败",
        );
        setToken("");
      }
    });
  }

  function backToEmail() {
    setStep("email");
    setToken("");
    setError("");
    setInfo("");
  }

  return (
    <div className="panel-strong rounded-[2rem] p-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Owner Access
        </p>
        <h1 className="section-title text-4xl font-semibold">
          {step === "email" ? "登录" : "输入邮件验证码"}
        </h1>
        <p className="max-w-xl text-sm leading-7 text-[var(--color-ink-soft)]">
          {step === "email"
            ? "访客可以公开浏览词条；复习、笔记与导入同步只对 owner 开放。"
            : `验证码已发送到 ${email}。在邮件中查看 6 位数字，回到此页面输入即可登录——无需在邮件里点击链接。`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleEmailSubmit} className="mt-8">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">邮箱</span>
            <Input
              required
              autoFocus
              type="email"
              name="email"
              placeholder="owner@example.com"
              defaultValue={email}
            />
          </label>

          <Button type="submit" disabled={pending} fullWidth>
            {pending ? "发送中…" : "发送验证码"}
          </Button>

          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            邮件里同时附有桌面端一键登录链接；移动端建议直接读取验证码回填。
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="mt-8">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">6 位验证码</span>
            <Input
              ref={otpInputRef}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={OTP_TOKEN_LENGTH}
              placeholder="••••••"
              value={token}
              onChange={(e) => {
                // Strip non-digits so paste of "code: 123 456" still lands cleanly.
                const cleaned = e.target.value.replace(/\D+/g, "").slice(0, OTP_TOKEN_LENGTH);
                setToken(cleaned);
              }}
              className="text-center text-2xl tracking-[0.4em]"
            />
          </label>

          <Button
            type="submit"
            disabled={pending || token.length !== OTP_TOKEN_LENGTH}
            fullWidth
          >
            {pending ? "验证中…" : "登录"}
          </Button>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={handleResend}
              disabled={pending || resendCooldown > 0}
              className="text-[var(--color-accent)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-[var(--color-ink-soft)] disabled:no-underline"
            >
              {resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : "重新发送验证码"}
            </button>
            <button
              type="button"
              onClick={backToEmail}
              disabled={pending}
              className="text-[var(--color-ink-soft)] underline-offset-4 hover:underline"
            >
              换个邮箱
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p className="mt-4 rounded-2xl bg-[var(--color-surface-muted-warm)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-4 rounded-2xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {info}
        </p>
      ) : null}
    </div>
  );
}
