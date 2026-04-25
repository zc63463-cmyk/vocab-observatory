"use client";

import Link from "next/link";
import type { Route } from "next";
import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddToReviewButton } from "@/components/words/AddToReviewButton";
import { WordNotes } from "@/components/words/WordNotes";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { OwnerWordProgressSummary } from "@/lib/words";

interface NoteSnapshot {
  contentMd: string;
  updatedAt: string | null;
  version: number;
}

interface NoteRevision {
  content_md: string;
  created_at: string;
  id: string;
  version: number;
}

interface SidebarPayload {
  history: NoteRevision[];
  note: NoteSnapshot;
  progress: OwnerWordProgressSummary | null;
}

type SidebarState =
  | { status: "checking" | "loading" }
  | { status: "guest" }
  | {
      history: NoteRevision[];
      note: NoteSnapshot;
      progress: OwnerWordProgressSummary | null;
      status: "ready";
    }
  | { message: string; status: "error" };

type IdleCallbackHandle = number;
type IdleCallbackFn = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

function readJson<T>(url: string, signal?: AbortSignal) {
  return fetch(url, {
    credentials: "same-origin",
    signal,
  }).then(async (response) => {
    const payload = (await response.json()) as T & { error?: string };

    if (response.status === 401) {
      return {
        authorized: false as const,
        payload,
      };
    }

    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed.");
    }

    return {
      authorized: true as const,
      payload,
    };
  });
}

function LoadingCard() {
  return (
    <div className="animate-pulse rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.48)] p-5">
      <div className="h-4 w-24 rounded-full bg-[rgba(15,111,98,0.12)]" />
      <div className="mt-4 h-10 rounded-2xl bg-[rgba(15,111,98,0.08)]" />
      <div className="mt-4 space-y-2">
        <div className="h-3 rounded-full bg-[rgba(15,111,98,0.08)]" />
        <div className="h-3 rounded-full bg-[rgba(15,111,98,0.08)]" />
      </div>
    </div>
  );
}

function scheduleIdleTask(callback: IdleCallbackFn) {
  if ("requestIdleCallback" in window && typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 500 });

    return {
      cancel() {
        window.cancelIdleCallback?.(handle);
      },
      handle,
    };
  }

  const handle = window.setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 0,
    });
  }, 120);

  return {
    cancel() {
      window.clearTimeout(handle);
    },
    handle,
  };
}

export function OwnerWordSidebar({ wordId }: { wordId: string }) {
  const pathname = usePathname();
  const [sidebarState, setSidebarState] = useState<SidebarState>({ status: "checking" });
  const abortRef = useRef<AbortController | null>(null);
  const idleHandleRef = useRef<IdleCallbackHandle | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    function clearPendingWork() {
      abortRef.current?.abort();
      abortRef.current = null;

      if (idleHandleRef.current !== null) {
        if ("cancelIdleCallback" in window && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandleRef.current);
        } else {
          window.clearTimeout(idleHandleRef.current);
        }
        idleHandleRef.current = null;
      }
    }

    async function loadSidebar(user: User | null) {
      if (!active) {
        return;
      }

      clearPendingWork();

      if (!user) {
        setSidebarState({ status: "guest" });
        return;
      }

      setSidebarState({ status: "loading" });

      const scheduled = scheduleIdleTask(async () => {
        idleHandleRef.current = null;

        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const result = await readJson<SidebarPayload>(
            `/api/words/${wordId}/owner-sidebar`,
            controller.signal,
          );

          if (!active || controller.signal.aborted) {
            return;
          }

          if (!result.authorized) {
            setSidebarState({ status: "guest" });
            return;
          }

          setSidebarState({
            history: result.payload.history ?? [],
            note: {
              contentMd: result.payload.note?.contentMd ?? "",
              updatedAt: result.payload.note?.updatedAt ?? null,
              version: result.payload.note?.version ?? 0,
            },
            progress: result.payload.progress ?? null,
            status: "ready",
          });
        } catch (error) {
          if (!active || controller.signal.aborted) {
            return;
          }

          setSidebarState({
            message: error instanceof Error ? error.message : "Failed to load owner tools.",
            status: "error",
          });
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      });

      idleHandleRef.current = scheduled.handle;
    }

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await loadSidebar(user);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadSidebar(session?.user ?? null);
    });

    return () => {
      active = false;
      clearPendingWork();
      subscription.unsubscribe();
    };
  }, [wordId]);

  if (sidebarState.status === "checking" || sidebarState.status === "loading") {
    return (
      <div className="space-y-6">
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  if (sidebarState.status === "guest") {
    const nextHref = pathname ? `/auth/login?next=${encodeURIComponent(pathname)}` : "/auth/login";

    return (
      <div className="panel rounded-[1.75rem] p-6 text-sm leading-7 text-[var(--color-ink-soft)]">
        <p>登录 owner 账号后，你可以在这里保存个人笔记，并把词条加入复习。</p>
        <Link
          href={nextHref as Route}
          className="mt-4 inline-flex rounded-full border border-[rgba(15,111,98,0.2)] bg-[rgba(15,111,98,0.08)] px-4 py-2 font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
        >
          Owner 登录
        </Link>
      </div>
    );
  }

  if (sidebarState.status === "error") {
    return (
      <div className="panel rounded-[1.75rem] p-6 text-sm leading-7 text-[var(--color-accent-2)]">
        {sidebarState.message}
      </div>
    );
  }

  if (sidebarState.status !== "ready") {
    return null;
  }

  return (
    <div className="space-y-6">
      <AddToReviewButton
        wordId={wordId}
        initialProgress={sidebarState.progress}
      />
      <WordNotes
        wordId={wordId}
        initialContent={sidebarState.note.contentMd}
        initialHistory={sidebarState.history}
        initialUpdatedAt={sidebarState.note.updatedAt}
        initialVersion={sidebarState.note.version}
      />
    </div>
  );
}
