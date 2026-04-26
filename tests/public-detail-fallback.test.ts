import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let hasPublicEnv = true;
let publicClient: unknown = null;

vi.mock("next/cache", () => ({
  unstable_cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => fn,
}));

vi.mock("@/lib/markdown", () => ({
  getSection: () => null,
  renderObsidianMarkdown: async (input: string) => `<p>${input}</p>`,
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeHtmlServer: (input: string) => `sanitized:${input}`,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    hasSupabasePublicEnv: () => hasPublicEnv,
  };
});

vi.mock("@/lib/supabase/public", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/public")>();
  return {
    ...actual,
    getPublicSupabaseClientOrNull: () => publicClient,
  };
});

function createSingleResultClient(
  tableName: string,
  maybeSingleImpl: () => Promise<unknown>,
) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(maybeSingleImpl),
    select: vi.fn(() => chain),
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== tableName) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return chain;
    }),
  };
}

function createAwaitableChain<TResult>(
  executor: () => Promise<TResult>,
  extraMethods?: Record<string, () => unknown>,
) {
  const chain: Record<string, unknown> = {
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (onFulfilled?: (value: TResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
      executor().then(onFulfilled, onRejected),
  };

  if (extraMethods) {
    for (const [name, factory] of Object.entries(extraMethods)) {
      chain[name] = vi.fn(() => {
        factory();
        return chain;
      });
    }
  }

  return chain;
}

describe("public detail fallback behavior", () => {
  beforeEach(() => {
    hasPublicEnv = true;
    publicClient = null;
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns a null word after exhausting transient detail retries", async () => {
    const client = createSingleResultClient("words", async () => ({
      data: null,
      error: { code: "", details: "Error: read ECONNRESET", message: "TypeError: terminated" },
    }));
    publicClient = client;

    const { getPublicWordBySlug } = await import("@/lib/words");
    const promise = getPublicWordBySlug("transient-failure-word");

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toEqual({
      configured: true,
      word: null,
    });

    expect(client.from).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("does not retry a word lookup when the slug is simply missing", async () => {
    const client = createSingleResultClient("words", async () => ({
      data: null,
      error: null,
    }));
    publicClient = client;

    const { getPublicWordBySlug } = await import("@/lib/words");

    await expect(getPublicWordBySlug("missing-word-slug")).resolves.toEqual({
      configured: true,
      word: null,
    });

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("retries public word count once after a transient failure", async () => {
    let attempts = 0;
    publicClient = {
      from: vi.fn((table: string) => {
        if (table !== "words") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return createAwaitableChain(async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              count: null,
              error: { code: "", details: "read ECONNRESET", message: "TypeError: terminated" },
            };
          }

          return {
            count: 321,
            error: null,
          };
        });
      }),
    };

    const { getPublicWordsCount } = await import("@/lib/words");
    const promise = getPublicWordsCount();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBe(321);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("retries public word slugs once after a transient failure", async () => {
    let attempts = 0;
    publicClient = {
      from: vi.fn((table: string) => {
        if (table !== "words") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return createAwaitableChain(async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              data: null,
              error: { code: "", details: "socket hang up", message: "fetch failed" },
            };
          }

          return {
            data: [{ slug: "abandon" }, { slug: "abide" }],
            error: null,
          };
        });
      }),
    };

    const { getStaticPublicWordSlugs } = await import("@/lib/words");
    const promise = getStaticPublicWordSlugs();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toEqual(["abandon", "abide"]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not treat missing collection_notes relation as retryable", async () => {
    const client = createSingleResultClient("collection_notes", async () => ({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'collection_notes'" },
    }));
    publicClient = client;

    const { getPublicCollectionNoteBySlug } = await import("@/lib/plaza");

    await expect(getPublicCollectionNoteBySlug("missing-relation-note")).resolves.toEqual({
      available: false,
      canonicalPath: null,
      configured: true,
      note: null,
    });

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns missing_relation collection summaries without retrying", async () => {
    publicClient = {
      from: vi.fn((table: string) => {
        if (table !== "collection_notes") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return createAwaitableChain(async () => ({
          data: null,
          error: { code: "PGRST205", message: "Could not find the table 'collection_notes'" },
        }));
      }),
    };

    const { getCachedCollectionSummaries } = await import("@/lib/plaza");

    await expect(getCachedCollectionSummaries()).resolves.toEqual({
      notes: [],
      status: "missing_relation",
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("retries collection summaries once after a transient failure", async () => {
    let attempts = 0;
    publicClient = {
      from: vi.fn((table: string) => {
        if (table !== "collection_notes") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return createAwaitableChain(async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              data: null,
              error: { code: "", details: "ETIMEDOUT", message: "network error" },
            };
          }

          return {
            data: [
              {
                id: "note-1",
                kind: "root_affix",
                metadata: { coreMeaning: "Leave" },
                related_word_slugs: [],
                slug: "root-ab-abs-绂诲紑",
                summary: "Canonical summary",
                tags: ["roots"],
                title: "ab-/abs-(绂诲紑)",
                updated_at: "2026-04-26T00:00:00.000Z",
              },
            ],
            error: null,
          };
        });
      }),
    };

    const { getCachedCollectionSummaries } = await import("@/lib/plaza");
    const promise = getCachedCollectionSummaries();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toMatchObject({
      notes: [{ slug: "root-ab-abs-绂诲紑", title: "ab-/abs-(绂诲紑)" }],
      status: "ok",
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns a sanitized word detail payload on success", async () => {
    const wordsMaybeSingle = vi.fn(async () => ({
      data: {
        antonym_items: [{ note: "opposite", word: "retreat" }],
        body_md: "Body copy",
        collocations: [],
        core_definitions: [{ partOfSpeech: "n.", senses: ["definition"] }],
        corpus_items: [],
        definition_md: "Definition copy",
        examples: [],
        id: "word-1",
        ipa: "/test/",
        is_deleted: false,
        is_published: true,
        lemma: "advance",
        metadata: {},
        pos: "noun",
        prototype_text: "Prototype",
        short_definition: "Short definition",
        slug: "advance",
        source_path: "Words/advance.md",
        synonym_items: [{ delta: null, object: "idea", semanticDiff: "close", tone: "neutral", usage: "common", word: "progress" }],
        title: "advance",
        updated_at: "2026-04-26T00:00:00.000Z",
      },
      error: null,
    }));
    const wordTagsEq = vi.fn(async () => ({
      data: [{ tags: { label: "tag-a", slug: "tag-a" } }],
      error: null,
    }));

    publicClient = {
      from: vi.fn((table: string) => {
        if (table === "words") {
          const chain = {
            eq: vi.fn(() => chain),
            maybeSingle: wordsMaybeSingle,
            select: vi.fn(() => chain),
          };
          return chain;
        }

        if (table === "word_tags") {
          const chain = {
            eq: wordTagsEq,
            select: vi.fn(() => chain),
          };
          return chain;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const { getPublicWordBySlug } = await import("@/lib/words");
    const result = await getPublicWordBySlug("advance");

    expect(result.configured).toBe(true);
    expect(result.word).toMatchObject({
      body_html: "sanitized:<p>Body copy</p>",
      definition_html: "sanitized:<p>Definition copy</p>",
      id: "word-1",
      lemma: "advance",
      resolved_antonym_items: [{ href: "/words/retreat", note: "opposite", word: "retreat" }],
      resolved_synonym_items: [{ href: "/words/progress", word: "progress" }],
      slug: "advance",
      synonym_html: "sanitized:",
      tags: [{ label: "tag-a", slug: "tag-a" }],
      title: "advance",
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns canonical plaza detail when a legacy slug matches a canonical note", async () => {
    const collectionMaybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          body_md: "Canonical body",
          id: "note-1",
          kind: "root_affix",
          metadata: { coreMeaning: "Leave" },
          related_word_slugs: [],
          slug: "root-ab-abs-离开",
          summary: "Canonical summary",
          tags: ["roots"],
          title: "ab-/abs-(离开)",
          updated_at: "2026-04-26T00:00:00.000Z",
        },
        error: null,
      });
    const summariesOrder = vi
      .fn()
      .mockReturnValueOnce({
        order: vi.fn(async () => ({
          data: [
            {
              id: "note-1",
              kind: "root_affix",
              metadata: { coreMeaning: "Leave" },
              related_word_slugs: [],
              slug: "root-ab-abs-离开",
              summary: "Canonical summary",
              tags: ["roots"],
              title: "ab-/abs-(离开)",
              updated_at: "2026-04-26T00:00:00.000Z",
            },
          ],
          error: null,
        })),
      });

    publicClient = {
      from: vi.fn((table: string) => {
        if (table === "words") {
          return createAwaitableChain(async () => ({
            data: [],
            error: null,
          }));
        }

        if (table !== "collection_notes") {
          throw new Error(`Unexpected table: ${table}`);
        }

        const chain = {
          eq: vi.fn(() => chain),
          maybeSingle: collectionMaybeSingle,
          order: summariesOrder,
          select: vi.fn(() => chain),
        };
        return chain;
      }),
    };

    const { getPublicCollectionNoteBySlug } = await import("@/lib/plaza");
    const result = await getPublicCollectionNoteBySlug("root-ab-/abs-(离开)");

    expect(result).toMatchObject({
      available: true,
      canonicalPath: "/plaza/root-ab-abs-%E7%A6%BB%E5%BC%80",
      configured: true,
      note: {
        body_html: "sanitized:<p>Canonical body</p>",
        slug: "root-ab-abs-离开",
        title: "ab-/abs-(离开)",
      },
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
