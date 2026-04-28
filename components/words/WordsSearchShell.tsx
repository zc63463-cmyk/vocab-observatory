"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { WordCard } from "@/components/words/WordCard";
import { useFilteredSearch } from "@/hooks/useFilteredSearch";
import { buildWordDetailHref } from "@/lib/words-routing";
import type { PublicWordsResponse, ReviewFilter } from "@/lib/words";

type WordFilters = PublicWordsResponse["filters"];
type WordPagination = Pick<PublicWordsResponse["pageInfo"], "limit" | "offset">;

interface LoadMoreState {
  error: string | null;
  isLoading: boolean;
  key: string | null;
  pageInfo: PublicWordsResponse["pageInfo"] | null;
  words: PublicWordsResponse["words"];
}

interface BatchAddResponse {
  addedCount: number;
  alreadyTrackedCount?: number;
  error?: string;
  notFound?: string[];
  ok: boolean;
}

function createEmptyLoadMoreState(): LoadMoreState {
  return {
    error: null,
    isLoading: false,
    key: null,
    pageInfo: null,
    words: [],
  };
}

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

function createWordsSearchParams(
  filters: WordFilters,
  pagination?: Partial<WordPagination>,
) {
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

  if (typeof pagination?.offset === "number" && pagination.offset > 0) {
    params.set("offset", String(pagination.offset));
  }

  if (typeof pagination?.limit === "number" && pagination.limit > 0) {
    params.set("limit", String(pagination.limit));
  }

  return params;
}

function buildWordsHref(pathname: string, filters: WordFilters) {
  const query = createWordsSearchParams(filters).toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildWordsApiHref(
  filters: WordFilters,
  pagination?: Partial<WordPagination>,
) {
  const query = createWordsSearchParams(filters, pagination).toString();
  return query ? `/api/words?${query}` : "/api/words";
}

function readWordsResponse(response: Response) {
  return response.json() as Promise<PublicWordsResponse & { error?: string }>;
}

function mergeWordPages(
  base: PublicWordsResponse,
  extraWords: PublicWordsResponse["words"],
  pageInfo: PublicWordsResponse["pageInfo"],
): PublicWordsResponse {
  const seen = new Set(base.words.map((word) => word.id));
  const mergedWords = base.words.concat(
    extraWords.filter((word) => !seen.has(word.id)),
  );

  return {
    ...base,
    counts: {
      showing: Math.min(mergedWords.length, base.counts.total),
      total: base.counts.total,
    },
    pageInfo: {
      ...pageInfo,
      offset: 0,
    },
    truncated: pageInfo.hasMore,
    words: mergedWords,
  };
}

export function WordsSearchShell({ initialResult }: { initialResult: PublicWordsResponse }) {
  const initialPageLimit = initialResult.pageInfo.limit;
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const [loadMoreState, setLoadMoreState] = useState<LoadMoreState>(createEmptyLoadMoreState);
  const [refreshedResult, setRefreshedResult] = useState<{
    result: PublicWordsResponse;
    sourceResult: PublicWordsResponse;
  } | null>(null);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [isBatchPending, setIsBatchPending] = useState(false);
  const { addToast } = useToast();

  const buildInitialApiHref = useCallback(
    (filters: WordFilters) => buildWordsApiHref(filters, { limit: initialPageLimit }),
    [initialPageLimit],
  );

  const {
    activeFilters,
    fetchError,
    isUpdating,
    result,
    searchParamsString,
    setFilter,
  } = useFilteredSearch<WordFilters, PublicWordsResponse>({
    areFiltersEqual: areWordFiltersEqual,
    buildApiHref: buildInitialApiHref,
    buildHref: buildWordsHref,
    credentials: "same-origin",
    getFiltersFromResult: (payload) => payload.filters,
    getFiltersFromSearchParams: (params) => ({
      freq: params.get("freq") ?? undefined,
      q: params.get("q") ?? undefined,
      review: (params.get("review") as ReviewFilter | null) ?? undefined,
      semantic: params.get("semantic") ?? undefined,
    }),
    initialResult,
    normalizeFilters: normalizeWordFilters,
    readResponse: readWordsResponse,
    shouldSkipInitialFetch: (urlFilters, seededResult) =>
      areWordFiltersEqual(urlFilters, seededResult.filters),
  });

  const baseResult = refreshedResult?.sourceResult === result
    ? refreshedResult.result
    : result;
  const resultKey = useMemo(() => {
    return JSON.stringify({
      filters: baseResult.filters,
      isOwner: baseResult.isOwner,
      limit: baseResult.pageInfo.limit,
      total: baseResult.counts.total,
      words: baseResult.words.map((word) => word.id),
    });
  }, [baseResult]);

  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
  }, [resultKey]);

  useEffect(() => {
    return () => {
      loadMoreControllerRef.current?.abort();
    };
  }, []);

  const displayResult = useMemo(() => {
    if (
      loadMoreState.key !== resultKey ||
      !loadMoreState.pageInfo ||
      loadMoreState.words.length === 0
    ) {
      return baseResult;
    }

    return mergeWordPages(baseResult, loadMoreState.words, loadMoreState.pageInfo);
  }, [baseResult, loadMoreState, resultKey]);

  const isLoadingMore = loadMoreState.key === resultKey && loadMoreState.isLoading;
  const loadMoreError = loadMoreState.key === resultKey ? loadMoreState.error : null;
  const untrackedWords = useMemo(
    () => displayResult.words.filter((word) => !word.progress),
    [displayResult.words],
  );
  const visibleSelectedWordIds = useMemo(() => {
    const visibleUntrackedIds = new Set(untrackedWords.map((word) => word.id));
    return new Set(
      [...selectedWordIds].filter((wordId) => visibleUntrackedIds.has(wordId)),
    );
  }, [selectedWordIds, untrackedWords]);
  const selectedCount = visibleSelectedWordIds.size;

  const toggleWordSelect = useCallback((wordId: string) => {
    setSelectedWordIds((current) => {
      const next = new Set(current);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedWordIds(new Set());
  }, []);

  const selectAllUntracked = useCallback(() => {
    setSelectedWordIds(new Set(untrackedWords.map((word) => word.id)));
  }, [untrackedWords]);

  const refreshCurrentWords = useCallback(async () => {
    const response = await fetch(
      buildWordsApiHref(displayResult.filters, {
        limit: Math.max(displayResult.words.length, initialPageLimit),
      }),
      {
        credentials: "same-origin",
      },
    );
    const payload = await readWordsResponse(response);

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to refresh words.");
    }

    setLoadMoreState(createEmptyLoadMoreState());
    setRefreshedResult({
      result: payload,
      sourceResult: result,
    });
  }, [displayResult.filters, displayResult.words.length, initialPageLimit, result]);

  const handleBatchAdd = useCallback(() => {
    if (visibleSelectedWordIds.size === 0 || isBatchPending) {
      return;
    }

    setIsBatchPending(true);
    void (async () => {
      try {
        const response = await fetch("/api/review/add-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wordIds: [...visibleSelectedWordIds] }),
        });
        const payload = (await response.json()) as BatchAddResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "批量添加失败");
        }

        setSelectedWordIds(new Set());
        await refreshCurrentWords();
        addToast(
          payload.alreadyTrackedCount
            ? `已将 ${payload.addedCount} 个词条加入复习，${payload.alreadyTrackedCount} 个已在复习中`
            : `已将 ${payload.addedCount} 个词条加入复习`,
          "success",
        );
      } catch (error) {
        addToast(error instanceof Error ? error.message : "批量添加失败", "error");
      } finally {
        setIsBatchPending(false);
      }
    })();
  }, [visibleSelectedWordIds, isBatchPending, addToast, refreshCurrentWords]);

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

  const onLoadMore = useCallback(() => {
    if (
      isUpdating ||
      isLoadingMore ||
      !displayResult.configured ||
      !displayResult.pageInfo.hasMore
    ) {
      return;
    }

    const controller = new AbortController();
    const nextOffset = displayResult.words.length;
    const activeResultKey = resultKey;

    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setLoadMoreState((current) => ({
      error: null,
      isLoading: true,
      key: activeResultKey,
      pageInfo: current.key === activeResultKey ? current.pageInfo : null,
      words: current.key === activeResultKey ? current.words : [],
    }));

    void fetch(
      buildWordsApiHref(displayResult.filters, {
        limit: displayResult.pageInfo.limit,
        offset: nextOffset,
      }),
      {
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload = await readWordsResponse(response);

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load more words.");
        }

        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadMoreState((current) => {
          const existingWords = current.key === activeResultKey ? current.words : [];
          const seen = new Set(existingWords.map((word) => word.id));
          const mergedWords = existingWords.concat(
            payload.words.filter((word) => !seen.has(word.id)),
          );

          return {
            error: null,
            isLoading: false,
            key: activeResultKey,
            pageInfo: payload.pageInfo,
            words: mergedWords,
          };
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadMoreState((current) => ({
          error: error instanceof Error ? error.message : "Failed to load more words.",
          isLoading: false,
          key: activeResultKey,
          pageInfo: current.key === activeResultKey ? current.pageInfo : null,
          words: current.key === activeResultKey ? current.words : [],
        }));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          loadMoreControllerRef.current = null;
        }
      });
  }, [displayResult, isLoadingMore, isUpdating, resultKey]);

  const combinedFetchError = fetchError ?? loadMoreError;
  const isBusy = isUpdating || isLoadingMore;
  const shouldShowInitialLoading =
    displayResult.configured &&
    !displayResult.isOwner &&
    displayResult.words.length === 0 &&
    displayResult.counts.total === 0 &&
    displayResult.filterOptions.frequencies.length === 0 &&
    displayResult.filterOptions.semanticFields.length === 0 &&
    isUpdating &&
    !combinedFetchError;

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Public Lexicon
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">词条库</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          搜索公开词条。内容来自 Obsidian 主库；复习与个人笔记仅在 owner 登录后显示。
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
            <Select value={activeFilters.semantic} onChange={onSemanticChange}>
              <option value="">全部语义场</option>
              {displayResult.filterOptions.semanticFields.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            <Select value={activeFilters.freq} onChange={onFreqChange}>
              <option value="">全部词频</option>
              {displayResult.filterOptions.frequencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            {displayResult.isOwner ? (
              <Select value={activeFilters.review} onChange={onReviewChange}>
                <option value="all">全部词条</option>
                <option value="tracked">已加入复习</option>
                <option value="due">今天到期</option>
                <option value="untracked">未加入复习</option>
              </Select>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                Owner 登录后可按复习状态筛选。
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-ink-soft)]">
            <span>
              共 {displayResult.counts.total} 条，当前显示 {displayResult.counts.showing} 条
            </span>
            {isBusy ? <Badge tone="warm">更新中</Badge> : null}
            {displayResult.pageInfo.hasMore ? <Badge tone="warm">还有更多</Badge> : null}
            <Link href="/words" className="font-semibold text-[var(--color-accent)]">
              清除筛选
            </Link>
            {combinedFetchError ? (
              <span className="text-[var(--color-accent-2)]">{combinedFetchError}</span>
            ) : null}
          </div>
        </div>
      </section>

      {!displayResult.configured ? (
        <EmptyState
          title="Supabase 尚未配置"
          description="请先配置公开环境变量并运行导入同步，随后这里会显示公开词条列表。"
        />
      ) : shouldShowInitialLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel rounded-[1.75rem] p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <SkeletonLine className="h-8 w-28" />
                  <SkeletonLine className="h-4 w-20" />
                </div>
                <SkeletonLine className="h-6 w-16" />
              </div>
              <SkeletonBlock className="mt-5 h-20 w-full" />
              <div className="mt-6 flex gap-2">
                <SkeletonLine className="h-6 w-20" />
                <SkeletonLine className="h-6 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : displayResult.words.length === 0 ? (
        <EmptyState
          title="没有匹配词条"
          description="试试更短的关键词，或先运行导入同步，把 Obsidian 内容写入数据库。"
        />
      ) : (
        <div className="space-y-6">
          {displayResult.isOwner && untrackedWords.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3">
              {selectedCount > 0 ? (
                <>
                  <span className="text-sm text-[var(--color-ink-soft)]">
                    已选 {selectedCount} 个未追踪词条
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBatchPending}
                    onClick={handleBatchAdd}
                  >
                    {isBatchPending ? "处理中..." : `批量加入复习 (${selectedCount})`}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                    取消选择
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-[var(--color-ink-soft)]">
                    当前 {untrackedWords.length} 个词条未加入复习
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={selectAllUntracked}>
                    全选加入
                  </Button>
                </>
              )}
            </div>
          ) : null}

          <div aria-busy={isBusy} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {displayResult.words.map((word) => (
              <WordCard
                key={word.id}
                href={buildWordDetailHref(word.slug, new URLSearchParams(searchParamsString))}
                word={word}
                selectable={displayResult.isOwner}
                selected={visibleSelectedWordIds.has(word.id)}
                onToggleSelect={toggleWordSelect}
              />
            ))}
          </div>

          {displayResult.pageInfo.hasMore ? (
            <div className="flex flex-col items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={onLoadMore}
                disabled={isBusy}
                iconRight={<ChevronDown />}
              >
                {isLoadingMore ? "加载中..." : "加载更多"}
              </Button>
              <p className="text-sm text-[var(--color-ink-soft)]">
                已显示 {displayResult.counts.showing} / {displayResult.counts.total}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
