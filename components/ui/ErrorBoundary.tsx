"use client";

import { Component } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Global error boundary — catches client-side render errors to prevent white-screen crashes.
 * Provides a graceful fallback UI with a retry button.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development; replace with error reporting service in production
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[40vh] items-center justify-center p-8">
          <div className="panel-strong max-w-lg rounded-[2rem] p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
              Something went wrong
            </p>
            <h2 className="section-title mt-3 text-3xl font-semibold">页面出了点问题</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
              页面渲染时遇到了一个错误，这不影响其他页面的使用。你可以尝试刷新页面，或者返回首页。
            </p>
            {process.env.NODE_ENV === "development" ? (
              <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-[rgba(178,87,47,0.06)] p-4 text-left text-xs text-[var(--color-accent-2)]">
                {this.state.error.message}
              </pre>
            ) : null}
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold transition hover:border-[var(--color-border-strong)] hover:bg-[rgba(255,255,255,0.45)]"
              >
                重试
              </button>
              <a
                href="/"
                className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                返回首页
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
