import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let publicClient: unknown = null;

vi.mock("next/cache", () => ({
  unstable_cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => fn,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    hasSupabasePublicEnv: () => true,
  };
});

vi.mock("@/lib/supabase/public", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/public")>();
  return {
    ...actual,
    getPublicSupabaseClientOrNull: () => publicClient,
  };
});

// Mirrors the slim shape returned by the WORD_INDEX_SELECT PostgREST
// projection that production code now uses everywhere — the `metadata`
// jsonb column is no longer fetched whole; instead five named sub-keys
// come back as top-level columns aliased to `metadata_<key>`.
interface FakeRow {
  id: string;
  ipa: string | null;
  lemma: string;
  metadata_antonyms: unknown;
  metadata_roots: unknown;
  metadata_semantic_field: string | null;
  metadata_synonyms: unknown;
  metadata_word_freq: string | null;
  short_definition: string | null;
  slug: string;
  title: string;
  updated_at: string;
}

const FULL_CORPUS: FakeRow[] = [
  {
    id: "1",
    ipa: "/eɪ/",
    lemma: "alpha",
    metadata_antonyms: null,
    metadata_roots: null,
    metadata_semantic_field: "抽象关系",
    metadata_synonyms: null,
    metadata_word_freq: "必备词",
    short_definition: "first letter",
    slug: "alpha",
    title: "alpha",
    updated_at: "2026-05-05T00:00:00.000Z",
  },
  {
    id: "2",
    ipa: "/biː/",
    lemma: "beta",
    metadata_antonyms: null,
    metadata_roots: null,
    metadata_semantic_field: "抽象关系",
    metadata_synonyms: null,
    metadata_word_freq: "基础词",
    short_definition: "second letter",
    slug: "beta",
    title: "beta",
    updated_at: "2026-05-05T00:00:00.000Z",
  },
  {
    id: "3",
    ipa: "/siː/",
    lemma: "gamma",
    metadata_antonyms: null,
    metadata_roots: null,
    metadata_semantic_field: "理性世界",
    metadata_synonyms: null,
    metadata_word_freq: "必备词",
    short_definition: "third letter",
    slug: "gamma",
    title: "gamma",
    updated_at: "2026-05-05T00:00:00.000Z",
  },
];

function makeWordsChain() {
  // Per-chain mutable state: every fresh `.from("words")` resets these so
  // sequential pagination + parallel queries don't bleed into one another.
  let containsCalled = false;
  let rangeStart = 0;
  let rangeEnd = Number.POSITIVE_INFINITY;

  const chain: Record<string, unknown> = {
    contains: vi.fn(() => {
      containsCalled = true;
      return chain;
    }),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn((start: number, end: number) => {
      rangeStart = start;
      rangeEnd = end;
      return chain;
    }),
    select: vi.fn(() => chain),
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve()
        .then(() => {
          if (containsCalled) {
            // Simulate the real production failure mode: a JSONB containment
            // query against `metadata` without a GIN index hits the Supabase
            // statement_timeout. The error text deliberately avoids any
            // keyword that `isTransientPublicReadError` would treat as
            // network-flaky, so the retry helper throws on first attempt.
            return {
              data: null,
              error: { message: "canceling statement due to statement timeout" },
            };
          }
          // Unfiltered path: return the full corpus (sliced by .range so the
          // 500-row pagination loop in getCachedPublicWordRows terminates).
          const slice = FULL_CORPUS.slice(
            rangeStart,
            Number.isFinite(rangeEnd) ? rangeEnd + 1 : undefined,
          );
          return { count: FULL_CORPUS.length, data: slice, error: null };
        })
        .then(onFulfilled, onRejected),
  };

  return chain;
}

function makeFacetsChain() {
  const chain: Record<string, unknown> = {
    gt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: [
          { count: 2, dimension: "word_freq", updated_at: null, value: "必备词" },
          { count: 1, dimension: "word_freq", updated_at: null, value: "基础词" },
          {
            count: 2,
            dimension: "semantic_field",
            updated_at: null,
            value: "抽象关系",
          },
          {
            count: 1,
            dimension: "semantic_field",
            updated_at: null,
            value: "理性世界",
          },
        ],
        error: null,
      }).then(onFulfilled, onRejected),
  };
  return chain;
}

describe("getPublicWords filter fallback", () => {
  beforeEach(() => {
    publicClient = null;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to JS filtering when DB-side metadata containment hits a statement timeout", async () => {
    publicClient = {
      from: vi.fn((table: string) => {
        if (table === "words") return makeWordsChain();
        if (table === "word_filter_facets") return makeFacetsChain();
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const { getPublicWords } = await import("@/lib/words");
    const result = await getPublicWords({ freq: "必备词" });

    // Two rows in FULL_CORPUS have word_freq=必备词 (alpha, gamma). The
    // DB-filtered fast path (.contains()) deterministically times out, but
    // the JS fallback should still resolve them correctly from the cached
    // full corpus — proving the fall-through prevents `total: 0` regressions.
    expect(result.configured).toBe(true);
    expect(result.counts.total).toBe(2);
    expect(result.words.map((word) => word.slug)).toEqual(["alpha", "gamma"]);
    expect(result.filters.freq).toBe("必备词");
  });

  it("also falls back when filtering by a semantic field whose DB query times out", async () => {
    publicClient = {
      from: vi.fn((table: string) => {
        if (table === "words") return makeWordsChain();
        if (table === "word_filter_facets") return makeFacetsChain();
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const { getPublicWords } = await import("@/lib/words");
    const result = await getPublicWords({ semantic: "抽象关系" });

    expect(result.counts.total).toBe(2);
    expect(result.words.map((word) => word.slug)).toEqual(["alpha", "beta"]);
  });
});
