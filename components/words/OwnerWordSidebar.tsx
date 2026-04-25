"use client";

import Link from "next/link";
import type { Route } from "next";
import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

async function readJson<T>(url: string) {
  const response = await fetch(url, {
    credentials: "same-origin",
  });
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

export function OwnerWordSidebar({ wordId }: { wordId: string }) {
  const pathname = usePathname();
  const [sidebarState, setSidebarState] = useState<SidebarState>({ status: "checking" });

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    async function loadOwnerData(user: User | null) {
      if (!active) {
        return;
      }

      if (!user) {
        setSidebarState({ status: "guest" });
        return;
      }

      setSidebarState({ status: "loading" });

      try {
        const [progressResult, noteResult, historyResult] = await Promise.all([
          readJson<{ progress: OwnerWordProgressSummary | null }>(
            `/api/review/progress/${wordId}`,
          ),
          readJson<NoteSnapshot>(`/api/notes/${wordId}`),
          readJson<{ revisions: NoteRevision[] }>(`/api/notes/${wordId}/history`),
        ]);

        if (!active) {
          return;
        }

        if (!progressResult.authorized || !noteResult.authorized || !historyResult.authorized) {
          setSidebarState({ status: "guest" });
          return;
        }

        setSidebarState({
          history: historyResult.payload.revisions ?? [],
          note: {
            contentMd: noteResult.payload.contentMd ?? "",
            updatedAt: noteResult.payload.updatedAt ?? null,
            version: noteResult.payload.version ?? 0,
          },
          progress: progressResult.payload.progress ?? null,
          status: "ready",
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setSidebarState({
          message: error instanceof Error ? error.message : "Failed to load owner tools.",
          status: "error",
        });
      }
    }

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await loadOwnerData(user);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadOwnerData(session?.user ?? null);
    });

    return () => {
      active = false;
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
        <p>登录 owner 账号后，你可以在这里保存个人笔记并把词条加入复习。</p>
        <Link
          href={nextHref as Route}
          className="mt-4 inline-flex rounded-full border border-[rgba(15,111,98,0.2)] bg-[rgba(15,111,98,0.08)] px-4 py-2 font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
        >
          Owner login
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

  const readyState = sidebarState;

  return (
    <div className="space-y-6">
      <AddToReviewButton
        wordId={wordId}
        initialProgress={readyState.progress}
      />
      <WordNotes
        wordId={wordId}
        initialContent={readyState.note.contentMd}
        initialHistory={readyState.history}
        initialUpdatedAt={readyState.note.updatedAt}
        initialVersion={readyState.note.version}
      />
    </div>
  );
}
