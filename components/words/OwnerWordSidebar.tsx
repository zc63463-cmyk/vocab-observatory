"use client";

import Link from "next/link";
import type { Route } from "next";
import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { AddToReviewButton } from "@/components/words/AddToReviewButton";
import { LeechPanel } from "@/components/words/LeechPanel";
import { WordNotes } from "@/components/words/WordNotes";
import { WordReviewTimeline } from "@/components/words/WordReviewTimeline";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { OwnerWordReviewLogEntry } from "@/lib/owner-word-sidebar";
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
  reviewLogs: OwnerWordReviewLogEntry[];
}

interface BatchAddResponse {
  addedCount: number;
  alreadyTrackedCount?: number;
  error?: string;
  ok: boolean;
}

type SidebarState =
  | { status: "guest" | "loading" }
  | {
      history: NoteRevision[];
      note: NoteSnapshot;
      progress: OwnerWordProgressSummary | null;
      reviewLogs: OwnerWordReviewLogEntry[];
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
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="mt-4 h-10 rounded-2xl" />
      <div className="mt-4 space-y-2">
        <SkeletonBlock className="h-3" />
        <SkeletonBlock className="h-3" />
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

function RelatedWordsReviewBatchButton({ wordIds }: { wordIds: string[] }) {
  const [pending, setPending] = useState(false);
  const [processed, setProcessed] = useState(false);
  const { addToast } = useToast();

  if (wordIds.length === 0) {
    return null;
  }

  function handleAddRelated() {
    if (pending || processed) {
      return;
    }

    setPending(true);
    void (async () => {
      try {
        const response = await fetch("/api/review/add-batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ wordIds }),
        });
        const payload = (await response.json()) as BatchAddResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "批量添加失败");
        }

        setProcessed(true);
        addToast(
          payload.alreadyTrackedCount
            ? `已将 ${payload.addedCount} 个相关词加入复习，${payload.alreadyTrackedCount} 个已在复习中`
            : `已将 ${payload.addedCount} 个相关词加入复习`,
          "success",
        );
      } catch (error) {
        addToast(error instanceof Error ? error.message : "批量添加失败", "error");
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-soft-deep)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
        Related Review
      </p>
      <h3 className="section-title mt-2 text-2xl font-semibold">相关词复习</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--color-ink-soft)]">
        将当前拓扑中的近义词、反义词和同根词加入复习队列。
      </p>
      <Button
        type="button"
        className="mt-5"
        disabled={pending || processed}
        fullWidth
        onClick={handleAddRelated}
      >
        {processed
          ? "相关词已处理"
          : pending
            ? "处理中..."
            : `加入相关词复习 (${wordIds.length})`}
      </Button>
    </div>
  );
}

export function OwnerWordSidebar({
  relatedReviewWordIds = [],
  wordId,
}: {
  relatedReviewWordIds?: string[];
  wordId: string;
}) {
  const pathname = usePathname();
  const uniqueRelatedReviewWordIds = useMemo(
    () => [...new Set(relatedReviewWordIds)].filter((id) => id !== wordId),
    [relatedReviewWordIds, wordId],
  );
  const [sidebarState, setSidebarState] = useState<SidebarState>({ status: "guest" });
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
            reviewLogs: result.payload.reviewLogs ?? [],
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

  if (sidebarState.status === "loading") {
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
          className="mt-4 inline-flex rounded-full border border-[rgba(15,111,98,0.2)] bg-[var(--color-surface-muted)] px-4 py-2 font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
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

  // Optimistically reflect a successful suspend without re-fetching the
  // whole sidebar payload — the LeechPanel hides itself when state === suspended.
  function handleSuspended() {
    setSidebarState((prev) => {
      if (prev.status !== "ready" || !prev.progress) return prev;
      return {
        ...prev,
        progress: { ...prev.progress, state: "suspended" },
      };
    });
  }

  return (
    <div className="space-y-6">
      <AddToReviewButton
        wordId={wordId}
        initialProgress={sidebarState.progress}
      />
      {sidebarState.progress ? (
        <LeechPanel progress={sidebarState.progress} onSuspended={handleSuspended} />
      ) : null}
      <WordReviewTimeline
        logs={sidebarState.reviewLogs}
        progressId={sidebarState.progress?.id ?? null}
      />
      <RelatedWordsReviewBatchButton wordIds={uniqueRelatedReviewWordIds} />
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
