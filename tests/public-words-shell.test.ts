import { describe, expect, it } from "vitest";
import {
  createPublicWordsShellResponse,
  isDefaultPublicWordFilters,
} from "@/lib/words";

describe("public words shell response", () => {
  it("creates a zero-query shell with normalized filters", () => {
    const shell = createPublicWordsShellResponse({
      freq: " b2 ",
      q: " ability ",
      review: "due",
      semantic: " motion ",
    });

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
