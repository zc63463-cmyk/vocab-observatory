"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

/**
 * Generic filtered search hook — extracts the shared state-management pattern
 * used by both WordsSearchShell and PlazaSearchShell.
 *
 * Type parameters:
 *  F — the filter shape (e.g. WordFilters / PlazaFilters)
 *  R — the API response shape (e.g. PublicWordsResponse / PlazaOverviewResponse)
 */

interface UseFilteredSearchConfig<F extends { q: string }, R> {
  /** Parse raw search-params into the canonical filter object */
  normalizeFilters: (partial: Partial<F>) => F;
  /** Equality check to avoid redundant navigations */
  areFiltersEqual: (left: F, right: F) => boolean;
  /** Serialize filters into a relative URL path (used for router.replace) */
  buildHref: (pathname: string, filters: F) => string;
  /** Parse the JSON response from the API */
  readResponse: (response: Response) => Promise<R & { error?: string }>;
  /** Build the API endpoint href from filters */
  buildApiHref: (filters: F) => string;
  /** The initial server-rendered result */
  initialResult: R;
  /** Access the filters field from the result */
  getFiltersFromResult: (result: R) => F;
  /** Access the filters field from the URL params */
  getFiltersFromSearchParams: (params: URLSearchParams) => Partial<F>;
  /** Optional: whether to pass credentials (for authenticated endpoints) */
  credentials?: RequestCredentials;
  /** Optional: skip the initial hydration fetch under certain conditions */
  shouldSkipInitialFetch?: (urlFilters: F, initialResult: R) => boolean;
}

export interface FilteredSearchState<F, R> {
  /** Current API result */
  result: R;
  /** The "active" filters — draft if user is typing, URL-synced otherwise */
  activeFilters: F;
  /** The committed (debounced) query string */
  committedQ: string;
  /** Whether a fetch or router transition is in progress */
  isUpdating: boolean;
  /** Any fetch error message */
  fetchError: string | null;
  /** Update a single filter key */
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  /** The raw search-params string (for draft source tracking) */
  searchParamsString: string;
}

export function useFilteredSearch<F extends { q: string }, R>(
  config: UseFilteredSearchConfig<F, R>,
): FilteredSearchState<F, R> {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [result, setResult] = useState(config.initialResult);
  const [draftFilters, setDraftFilters] = useState<F>(config.getFiltersFromResult(config.initialResult));
  const [draftSourceKey, setDraftSourceKey] = useState(searchParams.toString());
  const [debouncedQ, setDebouncedQ] = useState(config.getFiltersFromResult(config.initialResult).q as string);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRouting, startTransition] = useTransition();

  const initialResultRef = useRef(config.initialResult);
  const hasHydratedFetchRef = useRef(false);
  const searchParamsString = searchParams.toString();

  // ── Derive URL filters from search params ──
  const urlFilters = useMemo(
    () => {
      const params = new URLSearchParams(searchParamsString);
      return config.normalizeFilters(config.getFiltersFromSearchParams(params));
    },
    [searchParamsString],
  );

  // ── Active filters: draft while typing, URL-synced otherwise ──
  const activeFilters = useMemo(
    () => (draftSourceKey === searchParamsString ? draftFilters : urlFilters),
    [draftFilters, draftSourceKey, searchParamsString, urlFilters],
  );

  const committedQ = draftSourceKey === searchParamsString ? debouncedQ : (activeFilters.q as string);

  // ── Debounce the q filter ──
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(activeFilters.q as string);
    }, draftSourceKey === searchParamsString ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeFilters.q, draftSourceKey, searchParamsString]);

  // ── Sync URL with committed filters ──
  useEffect(() => {
    const nextFilters = config.normalizeFilters({
      ...activeFilters,
      q: committedQ,
    } as Partial<F>);

    if (config.areFiltersEqual(nextFilters, urlFilters)) {
      return;
    }

    startTransition(() => {
      router.replace(config.buildHref(pathname, nextFilters) as Route, { scroll: false });
    });
  }, [activeFilters, committedQ, pathname, router, urlFilters]);

  // ── Fetch data when URL filters change ──
  useEffect(() => {
    // Skip initial hydration fetch when SSR result is still valid
    if (config.shouldSkipInitialFetch) {
      if (
        !hasHydratedFetchRef.current &&
        config.shouldSkipInitialFetch(urlFilters, initialResultRef.current)
      ) {
        hasHydratedFetchRef.current = true;
        return;
      }
    }

    const controller = new AbortController();
    const apiHref = config.buildApiHref(urlFilters);

    setIsFetching(true);
    setFetchError(null);

    void fetch(apiHref, {
      credentials: config.credentials ?? "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await config.readResponse(response);

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load data.");
        }

        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        hasHydratedFetchRef.current = true;
        setResult(payload);

        const resultFilters = config.getFiltersFromResult(payload);
        if (!config.areFiltersEqual(resultFilters, urlFilters)) {
          startTransition(() => {
            router.replace(config.buildHref(pathname, resultFilters) as Route, { scroll: false });
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setFetchError(error instanceof Error ? error.message : "Failed to load data.");
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

  // ── Helper to update a single filter ──
  const setFilter = useMemo(() => {
    return <K extends keyof F>(key: K, value: F[K]) => {
      setDraftSourceKey(searchParamsString);
      setDraftFilters((current) => ({ ...current, [key]: value }));
    };
  }, [searchParamsString]);

  const isUpdating = isFetching || isRouting;

  return {
    activeFilters,
    committedQ,
    fetchError,
    isUpdating,
    result,
    searchParamsString,
    setFilter,
  };
}
