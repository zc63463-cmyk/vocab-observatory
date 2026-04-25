"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { WordCard } from "@/components/words/WordCard";
import { useFilteredSearch } from "@/hooks/useFilteredSearch";
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

function buildWordsApiHref(filters: WordFilters) {
  return buildWordsHref("/api/words", filters);
}

function readWordsResponse(response: Response) {
  return response.json() as Promise<PublicWordsResponse & { error?: string }>;
}

export function WordsSearchShell({ initialResult }: { initialResult: PublicWordsResponse }) {
  const [authState, setAuthState] = useState<AuthState>("checking");

  const {
    activeFilters,
    fetchError,
    isUpdating,
    result,
    searchParamsString,
    setFilter,
  } = useFilteredSearch<WordFilters, PublicWordsResponse>({
    areFiltersEqual: areWordFiltersEqual,
    buildApiHref: buildWordsApiHref,
    buildHref: buildWordsHref,
    credentials: "same-origin",
    getFiltersFromResult: (r) => r.filters,
    getFiltersFromSearchParams: (params) => ({
      freq: params.get("freq") ?? undefined,
      q: params.get("q") ?? undefined,
      review: (params.get("review") as ReviewFilter | null) ?? undefined,
      semantic: params.get("semantic") ?? undefined,
    }),
    initialResult,
    normalizeFilters: normalizeWordFilters,
    readResponse: readWordsResponse,
    shouldSkipInitialFetch: (urlFilters, initial) =>
      !initial.isOwner && areWordFiltersEqual(urlFilters, initial.filters),
  });

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

  // Stable callbacks to avoid re-creating on every render
  const onQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setFilter("q", event.target.value),
    [setFilter],
  );
  const onSemanticChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => setFilter("semantic", event.target.value),
    [setFilter],
  );
  const onFreqChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => setFilter("freq", event.target.value),
    [setFilter],
  );
  const onReviewChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = normalizeWordFilters({
        review: event.target.value as ReviewFilter,
      }).review;
      setFilter("review", value);
    },
    [setFilter],
  );

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
            <Input
              type="search"
              value={activeFilters.q}
              onChange={onQueryChange}
              placeholder="搜索单词、释义、语义场..."
              inputSize="lg"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Select
              value={activeFilters.semantic}
              onChange={onSemanticChange}
            >
              <option value="">全部语义场</option>
              {result.filterOptions.semanticFields.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            <Select
              value={activeFilters.freq}
              onChange={onFreqChange}
            >
              <option value="">全部词频</option>
              {result.filterOptions.frequencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            {result.isOwner ? (
              <Select
                value={activeFilters.review}
                onChange={onReviewChange}
              >
                <option value="all">全部词条</option>
                <option value="tracked">已加入复习</option>
                <option value="due">今天到期</option>
                <option value="untracked">未加入复习</option>
              </Select>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
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
