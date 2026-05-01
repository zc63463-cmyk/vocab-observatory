import { afterEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn<(tag: string, profile?: string) => void>();

vi.mock("next/cache", () => ({
  revalidateTag,
}));

// Imported after the mock so the module under test picks up the stub.
const {
  PUBLIC_CACHE_TAGS,
  derivePublicContentScope,
  resolvePublicCacheTags,
  revalidatePublicContent,
} = await import("@/lib/cache/public");

afterEach(() => {
  revalidateTag.mockClear();
});

describe("derivePublicContentScope", () => {
  it("returns null when nothing visible changed (unchanged re-upsert only)", () => {
    expect(
      derivePublicContentScope({
        created: 0,
        updated: 0,
        softDeleted: 0,
        collectionNotesCreated: 0,
        collectionNotesUpdated: 0,
        collectionNotesSoftDeleted: 0,
      }),
    ).toBeNull();
  });

  it("ignores fields that are absent from the signals object", () => {
    expect(derivePublicContentScope({})).toBeNull();
  });

  it("flags words-only scope when a word row changed", () => {
    expect(derivePublicContentScope({ created: 1 })).toEqual({
      collections: false,
      words: true,
    });
    expect(derivePublicContentScope({ updated: 2 })).toEqual({
      collections: false,
      words: true,
    });
    expect(derivePublicContentScope({ softDeleted: 3 })).toEqual({
      collections: false,
      words: true,
    });
  });

  it("flags collections-only scope when only plaza notes changed", () => {
    expect(
      derivePublicContentScope({ collectionNotesCreated: 1 }),
    ).toEqual({ collections: true, words: false });
    expect(
      derivePublicContentScope({ collectionNotesUpdated: 2 }),
    ).toEqual({ collections: true, words: false });
    expect(
      derivePublicContentScope({ collectionNotesSoftDeleted: 3 }),
    ).toEqual({ collections: true, words: false });
  });

  it("flags both scopes when words and plaza both changed", () => {
    expect(
      derivePublicContentScope({
        created: 1,
        collectionNotesUpdated: 1,
      }),
    ).toEqual({ collections: true, words: true });
  });
});

describe("resolvePublicCacheTags", () => {
  it("returns every tag when no scope is provided (legacy behaviour)", () => {
    expect(resolvePublicCacheTags()).toEqual(
      expect.arrayContaining([
        PUBLIC_CACHE_TAGS.landing,
        PUBLIC_CACHE_TAGS.plazaDetail,
        PUBLIC_CACHE_TAGS.plazaIndex,
        PUBLIC_CACHE_TAGS.wordDetail,
        PUBLIC_CACHE_TAGS.wordIndex,
      ]),
    );
    expect(resolvePublicCacheTags()).toHaveLength(5);
  });

  it("maps words scope to word+landing tags only", () => {
    const tags = resolvePublicCacheTags({ words: true });
    expect(new Set(tags)).toEqual(
      new Set([
        PUBLIC_CACHE_TAGS.wordIndex,
        PUBLIC_CACHE_TAGS.wordDetail,
        PUBLIC_CACHE_TAGS.landing,
      ]),
    );
  });

  it("maps collections scope to plaza tags only", () => {
    const tags = resolvePublicCacheTags({ collections: true });
    expect(new Set(tags)).toEqual(
      new Set([PUBLIC_CACHE_TAGS.plazaIndex, PUBLIC_CACHE_TAGS.plazaDetail]),
    );
  });

  it("deduplicates when both scopes are requested", () => {
    const tags = resolvePublicCacheTags({ collections: true, words: true });
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toHaveLength(5);
  });

  it("returns an empty tag list when both scopes are false", () => {
    expect(resolvePublicCacheTags({ collections: false, words: false })).toEqual([]);
  });
});

describe("revalidatePublicContent", () => {
  it("calls revalidateTag once per targeted tag with profile=max", () => {
    const tags = revalidatePublicContent({ words: true });
    expect(tags).toHaveLength(3);
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    for (const call of revalidateTag.mock.calls) {
      expect(call[1]).toBe("max");
    }
  });

  it("does not call revalidateTag when the scope resolves to no tags", () => {
    const tags = revalidatePublicContent({ words: false, collections: false });
    expect(tags).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("falls back to clearing every public tag when no scope is passed", () => {
    const tags = revalidatePublicContent();
    expect(tags).toHaveLength(5);
    expect(revalidateTag).toHaveBeenCalledTimes(5);
  });
});
