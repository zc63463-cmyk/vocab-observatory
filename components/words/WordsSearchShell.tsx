"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { WordCard } from "@/components/words/WordCard";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { PublicWordsResponse, ReviewFilter } from "@/lib/words";

type WordFilters = PublicWordsResponse["filters"];
type AuthState = "checking" | "guest" | "owner";

function normalizeWordFilters(filters?: Partial<WordFilters>): WordFilters {
  const review = filters?.review;

  return {
    freq: filters?.freq?.trim() ?? "",
    q: filters?.q?.trim() ?? "",
    review:
      review === "tracked" || review === "due" || review === "untracked" || review === "all"
        ? review
        : "all",
    semantic: filters?.semantic?.trim() ?? "",
  };
}

function areWordFiltersEqual(left: WordFilters, right: WordFilters) {
  return (
    left.freq === right.freq &&
    left.q === right.q &&
    left.review === right.review &&
    left.semantic === right.semantic
  );
}

function buildWordsHref(pathname: string, filters: WordFilters) {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.semantic) {
    params.set("semantic", filters.semantic);
  }

  if (filters.freq) {
    params.set("freq", filters.freq);
  }

  if (filters.review !== "all") {
    params.set("review", filters.review);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function readWordsResponse(response: Response) {
  return response.json() as Promise<PublicWordsResponse & { error?: string }>;
}

export function WordsSearchShell({ initialResult }: { initialResult: PublicWordsResponse }) {
  const pathname = usePathname() ?? "/words";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState(initialResult);
  const [draftFilters, setDraftFilters] = useState<WordFilters>(initialResult.filters);
  const [draftSourceKey, setDraftSourceKey] = useState(searchParams.toString());
  const [debouncedQ, setDebouncedQ] = useState(initialResult.filters.q);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [isRouting, startTransition] = useTransition();
  const initialResultRef = useRef(initialResult);
  const hasHydratedFetchRef = useRef(false);
  const searchParamsString = searchParams.toString();

  const urlFilters = useMemo(
    () => {
      const params = new URLSearchParams(searchParamsString);

      return normalizeWordFilters({
        freq: params.get("freq") ?? undefined,
        q: params.get("q") ?? undefined,
        review: (params.get("review") as ReviewFilter | null) ?? undefined,
        semantic: params.get("semantic") ?? undefined,
      });
    },
    [searchParamsString],
  );

  const activeFilters = useMemo(
    () => (draftSourceKey === searchParamsString ? draftFilters : urlFilters),
    [draftFilters, draftSourceKey, searchParamsString, urlFilters],
  );
  const committedQ = draftSourceKey === searchParamsString ? debouncedQ : activeFilters.q;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(activeFilters.q);
    }, draftSourceKey === searchParamsString ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeFilters.q, draftSourceKey, searchParamsString]);

  useEffect(() => {
    const nextFilters = normalizeWordFilters({
      ...activeFilters,
      q: committedQ,
    });

    if (areWordFiltersEqual(nextFilters, urlFilters)) {
      return;
    }

    startTransition(() => {
      router.replace(buildWordsHref(pathname, nextFilters) as Route, { scroll: false });
    });
  }, [activeFilters, committedQ, pathname, router, urlFilters]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    function setBrowserAuthState(user: User | null) {
      if (!active) {
        return;
      }

      setAuthState(user ? "owner" : "guest");
    }

    void supabase.auth.getUser().then(({ data }) => {
      setBrowserAuthState(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setBrowserAuthState(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authState === "checking") {
      return;
    }

    const shouldSkipGuestHydration =
      !hasHydratedFetchRef.current &&
      authState === "guest" &&
      !initialResultRef.current.isOwner &&
      areWordFiltersEqual(urlFilters, initialResultRef.current.filters);

    if (shouldSkipGuestHydration) {
      hasHydratedFetchRef.current = true;
      return;
    }

    const controller = new AbortController();
    const apiHref = buildWordsHref("/api/words", urlFilters);

    setIsFetching(true);
    setFetchError(null);

    void fetch(apiHref, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await readWordsResponse(response);

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load words.");
        }

        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        hasHydratedFetchRef.current = true;
        setResult(payload);

        if (!areWordFiltersEqual(payload.filters, urlFilters)) {
          startTransition(() => {
            router.replace(buildWordsHref(pathname, payload.filters) as Route, { scroll: false });
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setFetchError(error instanceof Error ? error.message : "Failed to load words.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFetching(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [authState, pathname, router, urlFilters]);

  const isUpdating = isFetching || isRouting;

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Public Lexicon
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">词条库</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          搜索公开词条。内容来自 Obsidian 主库；复习与个人笔记只在 owner 登录后显示。
        </p>

        <div className="mt-6 space-y-3">
          <div className="flex max-w-3xl flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={activeFilters.q}
              onChange={(event) => {
                const value = event.target.value;
                setDraftSourceKey(searchParamsString);
                setDraftFilters((current) => ({ ...current, q: value }));
              }}
              placeholder="搜索单词、释义、语义场..."
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-5 py-4 text-sm outline-none transition focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={activeFilters.semantic}
              onChange={(event) => {
                const value = event.target.value;
                setDraftSourceKey(searchParamsString);
                setDraftFilters((current) => ({ ...current, semantic: value }));
              }}
              className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
            >
              <option value="">全部语义场</option>
              {result.filterOptions.semanticFields.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <select
              value={activeFilters.freq}
              onChange={(event) => {
                const value = event.target.value;
                setDraftSourceKey(searchParamsString);
                setDraftFilters((current) => ({ ...current, freq: value }));
              }}
              className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
            >
              <option value="">全部词频</option>
              {result.filterOptions.frequencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            {result.isOwner ? (
              <select
                value={activeFilters.review}
                onChange={(event) => {
                  const value = normalizeWordFilters({
                    review: event.target.value as ReviewFilter,
                  }).review;

                  setDraftSourceKey(searchParamsString);
                  setDraftFilters((current) => ({ ...current, review: value }));
                }}
                className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
              >
                <option value="all">全部词条</option>
                <option value="tracked">已加入复习</option>
                <option value="due">今天到期</option>
                <option value="untracked">未加入复习</option>
              </select>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,0.42)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                Owner 登录后可按复习状态筛选
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-ink-soft)]">
            <span>
              共 {result.counts.total} 条，当前显示 {result.counts.showing} 条
            </span>
            {isUpdating ? <Badge tone="warm">更新中</Badge> : null}
            {result.truncated ? <Badge tone="warm">已截断显示</Badge> : null}
            <Link href="/words" className="font-semibold text-[var(--color-accent)]">
              清除筛选
            </Link>
            {fetchError ? (
              <span className="text-[var(--color-accent-2)]">{fetchError}</span>
            ) : null}
          </div>
        </div>
      </section>

      {!result.configured ? (
        <EmptyState
          title="Supabase 尚未配置"
          description="请先配置公开环境变量并运行导入接口，随后这里会显示公开词条列表。"
        />
      ) : result.words.length === 0 ? (
        <EmptyState
          title="没有匹配词条"
          description="试试更短的关键词，或先运行导入同步，把 Obsidian 内容写入数据库。"
        />
      ) : (
        <div
          aria-busy={isUpdating}
          className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {result.words.map((word) => (
            <WordCard key={word.id} word={word} />
          ))}
        </div>
      )}
    </div>
  );
}
