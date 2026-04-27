"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

interface UseFilteredSearchConfig<F extends { q: string }, R> {
  normalizeFilters: (partial: Partial<F>) => F;
  areFiltersEqual: (left: F, right: F) => boolean;
  buildHref: (pathname: string, filters: F) => string;
  readResponse: (response: Response) => Promise<R & { error?: string }>;
  buildApiHref: (filters: F) => string;
  initialResult: R;
  getFiltersFromResult: (result: R) => F;
  getFiltersFromSearchParams: (params: URLSearchParams) => Partial<F>;
  credentials?: RequestCredentials;
  shouldSkipInitialFetch?: (urlFilters: F, initialResult: R) => boolean;
}

export interface FilteredSearchState<F, R> {
  result: R;
  activeFilters: F;
  committedQ: string;
  isUpdating: boolean;
  fetchError: string | null;
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  searchParamsString: string;
}

export function useFilteredSearch<F extends { q: string }, R>(
  config: UseFilteredSearchConfig<F, R>,
): FilteredSearchState<F, R> {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stableConfig] = useState(() => ({
    areFiltersEqual: config.areFiltersEqual,
    buildApiHref: config.buildApiHref,
    buildHref: config.buildHref,
    credentials: config.credentials,
    getFiltersFromResult: config.getFiltersFromResult,
    getFiltersFromSearchParams: config.getFiltersFromSearchParams,
    initialResult: config.initialResult,
    normalizeFilters: config.normalizeFilters,
    readResponse: config.readResponse,
    shouldSkipInitialFetch: config.shouldSkipInitialFetch,
  }));

  const initialFilters = stableConfig.getFiltersFromResult(stableConfig.initialResult);
  const searchParamsString = searchParams.toString();
  const [result, setResult] = useState(stableConfig.initialResult);
  const [draftFilters, setDraftFilters] = useState<F>(initialFilters);
  const [draftSourceKey, setDraftSourceKey] = useState(() =>
    searchParamsString ? "__url__" : searchParamsString,
  );
  const [debouncedQ, setDebouncedQ] = useState(initialFilters.q as string);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRouting, startTransition] = useTransition();

  const initialResultRef = useRef(stableConfig.initialResult);
  const hasHydratedFetchRef = useRef(false);

  const urlFilters = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    return stableConfig.normalizeFilters(
      stableConfig.getFiltersFromSearchParams(params),
    );
  }, [searchParamsString, stableConfig]);

  const activeFilters = useMemo(
    () => (draftSourceKey === searchParamsString ? draftFilters : urlFilters),
    [draftFilters, draftSourceKey, searchParamsString, urlFilters],
  );

  const committedQ = draftSourceKey === searchParamsString ? debouncedQ : (activeFilters.q as string);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(activeFilters.q as string);
    }, draftSourceKey === searchParamsString ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeFilters.q, draftSourceKey, searchParamsString]);

  useEffect(() => {
    const nextFilters = stableConfig.normalizeFilters({
      ...activeFilters,
      q: committedQ,
    } as Partial<F>);

    if (stableConfig.areFiltersEqual(nextFilters, urlFilters)) {
      return;
    }

    startTransition(() => {
      router.replace(stableConfig.buildHref(pathname, nextFilters) as Route, { scroll: false });
    });
  }, [activeFilters, committedQ, pathname, router, stableConfig, urlFilters]);

  useEffect(() => {
    if (stableConfig.shouldSkipInitialFetch) {
      if (
        !hasHydratedFetchRef.current &&
        stableConfig.shouldSkipInitialFetch(urlFilters, initialResultRef.current)
      ) {
        hasHydratedFetchRef.current = true;
        return;
      }
    }

    const controller = new AbortController();
    const apiHref = stableConfig.buildApiHref(urlFilters);

    setIsFetching(true);
    setFetchError(null);

    void fetch(apiHref, {
      credentials: stableConfig.credentials ?? "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await stableConfig.readResponse(response);

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

        const resultFilters = stableConfig.getFiltersFromResult(payload);
        if (!stableConfig.areFiltersEqual(resultFilters, urlFilters)) {
          startTransition(() => {
            router.replace(stableConfig.buildHref(pathname, resultFilters) as Route, {
              scroll: false,
            });
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
  }, [pathname, router, stableConfig, urlFilters]);

  const setFilter = useMemo(() => {
    return <K extends keyof F>(key: K, value: F[K]) => {
      setDraftSourceKey(searchParamsString);
      setDraftFilters((current) => ({
        ...(draftSourceKey === searchParamsString ? current : activeFilters),
        [key]: value,
      }));
    };
  }, [activeFilters, draftSourceKey, searchParamsString]);

  return {
    activeFilters,
    committedQ,
    fetchError,
    isUpdating: isFetching || isRouting,
    result,
    searchParamsString,
    setFilter,
  };
}
