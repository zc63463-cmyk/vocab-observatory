"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { createCollectionNotePath, getCollectionNoteSummaryText } from "@/lib/collection-notes";
import type { PlazaFilterKind, PlazaOverviewResponse } from "@/lib/plaza";
import { formatDate } from "@/lib/utils";

type PlazaFilters = PlazaOverviewResponse["filters"];

function normalizePlazaFilters(filters?: Partial<PlazaFilters>): PlazaFilters {
  return {
    kind:
      filters?.kind === "root_affix" || filters?.kind === "semantic_field"
        ? filters.kind
        : "all",
    q: filters?.q?.trim() ?? "",
  };
}

function arePlazaFiltersEqual(left: PlazaFilters, right: PlazaFilters) {
  return left.kind === right.kind && left.q === right.q;
}

function buildPlazaHref(pathname: string, filters: PlazaFilters) {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.kind !== "all") {
    params.set("kind", filters.kind);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function readPlazaResponse(response: Response) {
  return response.json() as Promise<PlazaOverviewResponse & { error?: string }>;
}

export function PlazaSearchShell({ initialResult }: { initialResult: PlazaOverviewResponse }) {
  const pathname = usePathname() ?? "/plaza";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState(initialResult);
  const [draftFilters, setDraftFilters] = useState<PlazaFilters>(initialResult.filters);
  const [draftSourceKey, setDraftSourceKey] = useState(searchParams.toString());
  const [debouncedQ, setDebouncedQ] = useState(initialResult.filters.q);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRouting, startTransition] = useTransition();
  const initialResultRef = useRef(initialResult);
  const hasHydratedFetchRef = useRef(false);
  const searchParamsString = searchParams.toString();

  const urlFilters = useMemo(
    () => {
      const params = new URLSearchParams(searchParamsString);

      return normalizePlazaFilters({
        kind: (params.get("kind") as PlazaFilterKind | null) ?? undefined,
        q: params.get("q") ?? undefined,
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
    const nextFilters = normalizePlazaFilters({
      ...activeFilters,
      q: committedQ,
    });

    if (arePlazaFiltersEqual(nextFilters, urlFilters)) {
      return;
    }

    startTransition(() => {
      router.replace(buildPlazaHref(pathname, nextFilters) as Route, { scroll: false });
    });
  }, [activeFilters, committedQ, pathname, router, urlFilters]);

  useEffect(() => {
    const shouldSkipInitialFetch =
      !hasHydratedFetchRef.current &&
      arePlazaFiltersEqual(urlFilters, initialResultRef.current.filters);

    if (shouldSkipInitialFetch) {
      hasHydratedFetchRef.current = true;
      return;
    }

    const controller = new AbortController();
    const apiHref = buildPlazaHref("/api/plaza", urlFilters);

    setIsFetching(true);
    setFetchError(null);

    void fetch(apiHref, { signal: controller.signal })
      .then(async (response) => {
        const payload = await readPlazaResponse(response);

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load plaza.");
        }

        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        hasHydratedFetchRef.current = true;
        setResult(payload);

        if (!arePlazaFiltersEqual(payload.filters, urlFilters)) {
          startTransition(() => {
            router.replace(buildPlazaHref(pathname, payload.filters) as Route, { scroll: false });
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setFetchError(error instanceof Error ? error.message : "Failed to load plaza.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFetching(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [pathname, router, urlFilters]);

  const hasActiveFilters = result.filters.kind !== "all" || result.filters.q.length > 0;
  const isUpdating = isFetching || isRouting;

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Public Collections
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">词汇广场</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          这里单独展示 Obsidian 主库里的集合型词汇笔记，目前公开两类内容：词根词缀与语义场。
          词条页负责单词本身，这里负责看整组知识。
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Badge>集合笔记 {result.counts.total}</Badge>
          <Badge tone="warm">公开浏览</Badge>
          <Link
            href="/words"
            className="inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(255,255,255,0.5)]"
          >
            返回词条库
          </Link>
        </div>

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
              placeholder="搜索词根词缀、语义场、摘要..."
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-5 py-4 text-sm outline-none transition focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="grid gap-3 md:max-w-xs">
            <select
              value={activeFilters.kind}
              onChange={(event) => {
                const value = normalizePlazaFilters({
                  kind: event.target.value as PlazaFilterKind,
                }).kind;

                setDraftSourceKey(searchParamsString);
                setDraftFilters((current) => ({ ...current, kind: value }));
              }}
              className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
            >
              <option value="all">全部类型</option>
              <option value="root_affix">词根词缀</option>
              <option value="semantic_field">语义场</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-ink-soft)]">
            <span>
              共 {result.counts.total} 篇，当前命中 {result.counts.showing} 篇
            </span>
            {isUpdating ? <Badge tone="warm">更新中</Badge> : null}
            {hasActiveFilters ? (
              <Link href="/plaza" className="font-semibold text-[var(--color-accent)]">
                清除筛选
              </Link>
            ) : null}
            {fetchError ? (
              <span className="text-[var(--color-accent-2)]">{fetchError}</span>
            ) : null}
          </div>
        </div>
      </section>

      {!result.configured ? (
        <EmptyState
          title="Supabase 尚未配置"
          description="先补齐公开环境变量并完成导入，词汇广场的数据才能从数据库公开读取。"
        />
      ) : !result.available ? (
        <EmptyState
          title="词汇广场尚未初始化"
          description="当前还没有 collection_notes 表或公开数据。先执行 0006_collection_notes.sql，再重新跑一次导入同步。"
        />
      ) : result.counts.total === 0 ? (
        <EmptyState
          title="还没有集合笔记"
          description="导入完成后，这里会按词根词缀和语义场两类展示集合型 Obsidian 笔记。"
        />
      ) : result.groups.length === 0 ? (
        <EmptyState
          title="没有匹配的集合笔记"
          description="当前筛选条件下没有命中结果，试试更短的关键词，或切回全部类型。"
        />
      ) : (
        result.groups.map((group) => (
          <section key={group.kind} className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
                  {group.kind.replace("_", " ")}
                </p>
                <h2 className="section-title mt-2 text-3xl font-semibold">{group.label}</h2>
              </div>
              <p className="text-sm text-[var(--color-ink-soft)]">{group.count} 篇笔记</p>
            </div>

            <div
              aria-busy={isUpdating}
              className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
            >
              {group.notes.map((note) => (
                <Link
                  key={note.id}
                  href={createCollectionNotePath(note.slug) as Route}
                  className="panel group flex h-full flex-col rounded-[1.75rem] p-6 transition duration-200 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-[0_22px_54px_rgba(71,50,20,0.14)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <Badge>{group.label}</Badge>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {formatDate(note.updated_at)}
                    </span>
                  </div>

                  <h3 className="section-title mt-5 text-3xl font-semibold">{note.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
                    {getCollectionNoteSummaryText(note)}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {note.related_word_slugs.length > 0 ? (
                      <Badge tone="warm">关联词条 {note.related_word_slugs.length}</Badge>
                    ) : null}
                    {note.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>

                  <p className="mt-6 text-sm font-semibold text-[var(--color-accent)]">
                    查看集合笔记 -&gt;
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
