import { describe, expect, it } from "vitest";
import {
  createPublicWordsPageState,
  createPublicWordsShellResponse,
  isDefaultPublicWordFilters,
  normalizeWordPagination,
} from "@/lib/words";

describe("public words shell response", () => {
  it("creates a zero-query shell with normalized filters and page defaults", () => {
    const shell = createPublicWordsShellResponse(
      {
        freq: " b2 ",
        q: " ability ",
        review: "due",
        semantic: " motion ",
      },
      {
        limit: 999,
        offset: -4,
      },
    );

    expect(shell.counts).toEqual({ showing: 0, total: 0 });
    expect(shell.filterOptions).toEqual({
      frequencies: [],
      semanticFields: [],
    });
    expect(shell.filters).toEqual({
      freq: "b2",
      q: "ability",
      review: "all",
      semantic: "motion",
    });
    expect(shell.isOwner).toBe(false);
    expect(shell.pageInfo).toEqual({
      hasMore: false,
      limit: 120,
      offset: 0,
      total: 0,
    });
    expect(shell.truncated).toBe(false);
    expect(shell.words).toEqual([]);
  });

  it("recognizes default public filters", () => {
    expect(
      isDefaultPublicWordFilters({
        freq: "",
        q: "",
        review: "all",
        semantic: "",
      }),
    ).toBe(true);

    expect(
      isDefaultPublicWordFilters({
        freq: "",
        q: "ab",
        review: "all",
        semantic: "",
      }),
    ).toBe(false);
  });
});

describe("public words pagination", () => {
  it("normalizes page bounds", () => {
    expect(normalizeWordPagination()).toEqual({
      limit: 60,
      offset: 0,
    });

    expect(
      normalizeWordPagination({
        limit: 0,
        offset: 12.8,
      }),
    ).toEqual({
      limit: 1,
      offset: 12,
    });

    expect(
      normalizeWordPagination({
        limit: 999,
        offset: -12,
      }),
    ).toEqual({
      limit: 120,
      offset: 0,
    });
  });

  it("reports page state for partial and terminal slices", () => {
    expect(
      createPublicWordsPageState(181, normalizeWordPagination({ limit: 60 }), 60),
    ).toEqual({
      counts: {
        showing: 60,
        total: 181,
      },
      pageInfo: {
        hasMore: true,
        limit: 60,
        offset: 0,
        total: 181,
      },
      truncated: true,
    });

    expect(
      createPublicWordsPageState(
        91,
        normalizeWordPagination({ limit: 60, offset: 60 }),
        31,
      ),
    ).toEqual({
      counts: {
        showing: 31,
        total: 91,
      },
      pageInfo: {
        hasMore: false,
        limit: 60,
        offset: 60,
        total: 91,
      },
      truncated: false,
    });
  });
});
